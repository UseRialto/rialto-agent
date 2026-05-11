import { z } from 'zod'
import {
  BUILT_IN_LINE_ITEM_FIELD_BANK,
  isCoreLineItemFieldLike,
  isCoreVendorResponseFieldLike,
  makeFieldDefinition,
  normalizeFieldKey,
} from '@/lib/contractor-customization'
import type { RequestType } from '@/lib/types/procurement'
import type { ProcurementLineItemAttribute } from '@/lib/types/procurement'

export interface ImportedLineItem {
  sku: string
  description: string
  quantity: number
  unit: string
  attributes?: ProcurementLineItemAttribute[]
  specs?: string
  constraints?: string
  certifications?: string[]
  notes?: string
  contractor_budget?: number
  suggested_lead_time_days?: number
}

export interface ImportWarning {
  row?: number
  message: string
}

export interface ImportLineItemsResult {
  items: ImportedLineItem[]
  metadata: {
    parser: 'deterministic-table' | 'deterministic-lines'
    confidence: number
    warnings: ImportWarning[]
    skippedRows: number
  }
}

interface ImportInput {
  text: string
  filename: string
  requestType?: RequestType
  category?: string
  projectName?: string
  sourceKind?: 'text' | 'pdf' | 'spreadsheet'
  extractionWarnings?: ImportWarning[]
}

type RawItem = {
  sku?: unknown
  description?: unknown
  quantity?: unknown
  unit?: unknown
  specs?: unknown
  constraints?: unknown
  certifications?: unknown
  notes?: unknown
  contractor_budget?: unknown
  suggested_lead_time_days?: unknown
  attributes?: ProcurementLineItemAttribute[]
  sourceRow?: number
}

type ParsedAttempt = {
  items: ImportedLineItem[]
  warnings: ImportWarning[]
  skippedRows: number
  confidence: number
}

const importedItemSchema = z.object({
  sku: z.string().optional().default(''),
  description: z.string().optional().default(''),
  quantity: z.union([z.number(), z.string()]).optional().default(0),
  unit: z.string().optional().default(''),
  specs: z.string().optional().default(''),
  constraints: z.string().optional().default(''),
  certifications: z.union([z.array(z.string()), z.string()]).optional().default([]),
  notes: z.string().optional().default(''),
  contractor_budget: z.union([z.number(), z.string()]).optional(),
  suggested_lead_time_days: z.union([z.number(), z.string()]).optional(),
})

const importResponseSchema = z.object({
  items: z.array(importedItemSchema),
  warnings: z.array(z.union([
    z.string(),
    z.object({ row: z.number().optional(), message: z.string() }),
  ])).optional().default([]),
})

const FIELD_ALIASES = {
  sku: ['sku', 'item no', 'item #', 'item number', 'part', 'part no', 'part number', 'code', 'product code', 'material code'],
  description: ['description', 'desc', 'material', 'item', 'product', 'product type', 'scope', 'name', 'material description'],
  quantity: ['qty', 'quantity', 'amount', 'count', 'takeoff', 'take off', 'qnty', 'order qty', 'required qty'],
  unit: ['u/m', 'uom', 'unit', 'unit of measure', 'measure', 'units'],
  specs: ['spec', 'specs', 'specification', 'specifications', 'grade', 'standard', 'size', 'finish', 'performance', 'type', 'mix', 'rating'],
  constraints: ['constraint', 'constraints', 'delivery', 'logistics', 'handling', 'site', 'location', 'delivery constraint'],
  certifications: ['certification', 'certifications', 'cert', 'certs', 'compliance', 'astm', 'aisc', 'iso', 'standard required'],
  notes: ['note', 'notes', 'comment', 'comments', 'remark', 'remarks', 'clarification'],
  budget: ['target_budget', 'target budget', 'budget', 'allowance', 'target', 'unit budget', 'unit price target', 'budget per unit'],
  leadTime: ['lead_time', 'lead time', 'lead', 'days', 'needed by', 'required lead time', 'suggested lead time'],
} as const

function parseJsonResponse<T>(content: string): T {
  const trimmed = content.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced?.[1]?.trim() ?? trimmed
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Response did not contain a JSON object.')
  }
  return JSON.parse(raw.slice(start, end + 1)) as T
}

function normalizeText(text: string) {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\u00A0/g, ' ').trimEnd())
    .join('\n')
    .trim()
}

function normalizeHeader(value: string) {
  return value
    .replace(/[_/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function countDelimiters(line: string, delimiter: string) {
  let count = 0
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const next = line[i + 1]
    if (char === '"' && inQuotes && next === '"') {
      i += 1
      continue
    }
    if (char === '"') inQuotes = !inQuotes
    if (!inQuotes && char === delimiter) count += 1
  }
  return count
}

function sniffDelimiter(lines: string[]) {
  const candidates = [',', '\t', ';', '|']
  return candidates
    .map((delimiter) => ({
      delimiter,
      score: lines.slice(0, 12).reduce((sum, line) => sum + countDelimiters(line, delimiter), 0),
    }))
    .sort((a, b) => b.score - a.score)[0]?.delimiter ?? ','
}

function parseDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const next = line[i + 1]
    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      i += 1
      continue
    }
    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && char === delimiter) {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  cells.push(current.trim())
  return cells
}

function tableRowsFromText(text: string) {
  const lines = text.split('\n').filter((line) => line.trim())
  const delimiter = sniffDelimiter(lines)
  if (lines.slice(0, 12).reduce((sum, line) => sum + countDelimiters(line, delimiter), 0) < 2) {
    return { rows: [] as string[][], delimiter }
  }
  return {
    rows: lines.map((line) => parseDelimitedLine(line, delimiter)).filter((row) => row.some(Boolean)),
    delimiter,
  }
}

function aliasMatches(header: string, aliases: readonly string[]) {
  const normalized = normalizeHeader(header)
  return aliases.some((alias) => {
    const target = normalizeHeader(alias)
    return normalized === target || normalized.includes(target)
  })
}

function mapHeaderToAttribute(header: string, order: number): ProcurementLineItemAttribute | null {
  const label = header.replace(/[_/-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!label) return null
  if (isCoreLineItemFieldLike(label) || isCoreVendorResponseFieldLike(label)) return null

  const key = normalizeFieldKey(label)
  const bank = BUILT_IN_LINE_ITEM_FIELD_BANK.find((entry) => {
    const entryKey = normalizeFieldKey(entry.key)
    const entryLabel = normalizeFieldKey(entry.label)
    return key === entryKey || key.includes(entryKey) || key.includes(entryLabel) || entryLabel.includes(key)
  })
  const field = makeFieldDefinition(bank?.label ?? label, order, 'spreadsheet', {
    key: bank?.key ?? key,
    group: bank?.group ?? 'From uploaded file',
  })

  return {
    key: field.key,
    label: field.label,
    value: '',
    group: field.group,
    helperText: field.helperText,
    inputType: field.inputType,
    required: field.required,
    visible: field.visible,
    options: field.options,
    source: field.source,
    order: field.order,
  }
}

function findColumns(headers: string[], aliases: readonly string[]) {
  return headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => aliasMatches(header, aliases))
    .map(({ index }) => index)
}

function scoreHeader(headers: string[]) {
  const normalized = headers.map(normalizeHeader)
  const groups = [
    FIELD_ALIASES.sku,
    FIELD_ALIASES.description,
    FIELD_ALIASES.quantity,
    FIELD_ALIASES.unit,
    FIELD_ALIASES.specs,
    FIELD_ALIASES.certifications,
    FIELD_ALIASES.budget,
    FIELD_ALIASES.leadTime,
  ]
  return groups.reduce((score, aliases) => (
    normalized.some((header) => aliases.some((alias) => header === normalizeHeader(alias) || header.includes(normalizeHeader(alias))))
      ? score + 1
      : score
  ), 0)
}

function detectHeaderRow(rows: string[][]) {
  const candidates = rows.slice(0, Math.min(rows.length, 8))
  let best = { index: -1, score: 0 }
  candidates.forEach((row, index) => {
    const score = scoreHeader(row)
    if (score > best.score) best = { index, score }
  })
  return best.score >= 2 ? best.index : -1
}

function compactCell(value: unknown, max = 500) {
  if (value === undefined || value === null) return ''
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max)
}

function joinCells(row: string[], columns: number[]) {
  return columns
    .map((index) => compactCell(row[index]))
    .filter(Boolean)
    .join('; ')
}

function parseCertifications(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((cert) => compactCell(cert, 80)).filter(Boolean).slice(0, 12)
  }
  return compactCell(value, 500)
    .split(/[;,|]/)
    .map((cert) => compactCell(cert, 80))
    .filter(Boolean)
    .slice(0, 12)
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  const text = compactCell(value, 80)
  if (!text) return undefined
  const match = text.match(/-?\$?\s*[0-9][0-9,\s]*(?:\.[0-9]+)?/)
  if (!match) return undefined
  const parsed = Number.parseFloat(match[0].replace(/[$,\s]/g, ''))
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseQuantityUnit(value: unknown) {
  const text = compactCell(value, 120)
  if (!text) return { quantity: undefined, unit: '' }
  const match = text.match(/([0-9][0-9,\s]*(?:\.[0-9]+)?)\s*(tons?|tn|tonnes?|ea|each|pcs?|pieces?|sf|sq\.?\s*ft|sqft|ft2|lf|lin\.?\s*ft|linear\s*ft|cy|cu\.?\s*yd|cubic\s*yd|yd3|bf|sheets?|lbs?|pounds?)\b/i)
  if (!match) return { quantity: toNumber(text), unit: '' }
  return {
    quantity: toNumber(match[1]),
    unit: match[2],
  }
}

function normalizeUnit(unit: string, item: Pick<ImportedLineItem, 'sku' | 'description'>, category?: string) {
  const raw = unit.trim().toLowerCase().replace(/\s+/g, ' ')
  const synonyms: Record<string, string> = {
    ea: 'ea',
    each: 'ea',
    item: 'ea',
    items: 'ea',
    pcs: 'ea',
    pc: 'ea',
    piece: 'ea',
    pieces: 'ea',
    sf: 'sf',
    sqft: 'sf',
    'sq ft': 'sf',
    'sq. ft': 'sf',
    ft2: 'sf',
    lf: 'lf',
    lft: 'lf',
    'lin ft': 'lf',
    'lin. ft': 'lf',
    'linear ft': 'lf',
    ft: 'lf',
    cy: 'cy',
    yd3: 'cy',
    'cu yd': 'cy',
    'cu. yd': 'cy',
    'cubic yd': 'cy',
    ton: 'tons',
    tons: 'tons',
    tn: 'tons',
    tonne: 'tons',
    tonnes: 'tons',
    bf: 'bf',
    sheets: 'sheets',
    sheet: 'sheets',
    lbs: 'lbs',
    lb: 'lbs',
    pounds: 'lbs',
  }
  if (synonyms[raw]) return synonyms[raw]

  const text = `${item.sku} ${item.description} ${category ?? ''}`.toLowerCase()
  if (/(wide flange|w\d+x|hss|angle|channel|plate|rebar|beam|steel)/.test(text) && !/(deck|roof deck|tile)/.test(text)) return 'tons'
  if (/(ready[- ]?mix|concrete|grout|shotcrete)/.test(text)) return 'cy'
  if (/(tile|flooring|carpet|stone|paver|roof|deck|membrane|insulation|glass|glazing|cladding|panel|ceiling)/.test(text)) return 'sf'
  if (/(pipe|conduit|duct|strand|cable|wire|trim|molding|stud track)/.test(text)) return 'lf'
  if (/(lumber|2x|board foot|glulam)/.test(text)) return 'bf'
  if (/(plywood|osb|drywall|gypsum|sheet)/.test(text)) return 'sheets'
  return raw || 'ea'
}

function sanitizeItems(rawItems: RawItem[], category?: string): ParsedAttempt {
  const warnings: ImportWarning[] = []
  let skippedRows = 0
  const items = rawItems.flatMap((raw) => {
    const parsed = importedItemSchema.safeParse(raw)
    if (!parsed.success) {
      skippedRows += 1
      warnings.push({ row: raw.sourceRow, message: 'Skipped row because it did not match the import schema.' })
      return []
    }

    const item = parsed.data
    const sku = compactCell(item.sku, 120)
    const description = compactCell(item.description, 300)
    if (!sku && !description) {
      skippedRows += 1
      warnings.push({ row: raw.sourceRow, message: 'Skipped row with no SKU or description.' })
      return []
    }

    const quantityUnit = parseQuantityUnit(item.quantity)
    const quantity = Math.max(quantityUnit.quantity ?? toNumber(item.quantity) ?? 0, 0)
    if (quantity <= 0) {
      warnings.push({ row: raw.sourceRow, message: 'Imported row has no positive quantity and needs review.' })
    }

    const unitText = compactCell(item.unit, 40) || quantityUnit.unit
    const budget = toNumber(item.contractor_budget)
    const leadTime = toNumber(item.suggested_lead_time_days)

    return [{
      sku,
      description,
      quantity,
      unit: normalizeUnit(unitText, { sku, description }, category),
      attributes: (raw.attributes ?? []).map((attribute) => ({
        ...attribute,
        value: compactCell(attribute.value, 500),
      })).filter((attribute) => attribute.key && attribute.label && attribute.value),
      specs: compactCell(item.specs),
      constraints: compactCell(item.constraints),
      certifications: parseCertifications(item.certifications),
      notes: compactCell(item.notes),
      contractor_budget: budget !== undefined && budget >= 0 ? budget : undefined,
      suggested_lead_time_days: leadTime !== undefined && leadTime > 0 ? Math.round(leadTime) : undefined,
    }]
  })

  return {
    items,
    warnings,
    skippedRows,
    confidence: items.length > 0 ? Math.max(0.35, Math.min(0.98, items.length / Math.max(items.length + skippedRows, 1))) : 0,
  }
}

function buildStructuredHint(text: string) {
  const { rows, delimiter } = tableRowsFromText(text)
  return {
    delimiter: delimiter === '\t' ? 'tab' : delimiter,
    likelyHeaders: rows[detectHeaderRow(rows)] ?? rows[0] ?? [],
    sampleRows: rows.slice(Math.max(detectHeaderRow(rows) + 1, 1), Math.max(detectHeaderRow(rows) + 8, 8)),
  }
}

function deterministicTableImport(text: string, category?: string): ParsedAttempt {
  const { rows } = tableRowsFromText(text)
  if (rows.length < 2) return { items: [], warnings: [], skippedRows: 0, confidence: 0 }

  const headerIndex = detectHeaderRow(rows)
  if (headerIndex < 0) return { items: [], warnings: [], skippedRows: 0, confidence: 0 }

  const headers = rows[headerIndex]
  const dataRows = rows.slice(headerIndex + 1)
  const budgetCols = findColumns(headers, FIELD_ALIASES.budget)
  const leadCols = findColumns(headers, FIELD_ALIASES.leadTime)
  const skuCols = findColumns(headers, FIELD_ALIASES.sku)
  const descCols = findColumns(headers, FIELD_ALIASES.description)
    .filter((index) => !skuCols.includes(index))
  const qtyCols = findColumns(headers, FIELD_ALIASES.quantity)
    .filter((index) => !budgetCols.includes(index) && !leadCols.includes(index))
  const unitCols = findColumns(headers, FIELD_ALIASES.unit)
    .filter((index) => !budgetCols.includes(index) && !leadCols.includes(index))
  const certCols = findColumns(headers, FIELD_ALIASES.certifications)
  const specCols = findColumns(headers, FIELD_ALIASES.specs)
    .filter((index) => !certCols.includes(index))
  const constraintsCols = findColumns(headers, FIELD_ALIASES.constraints)
  const notesCols = findColumns(headers, FIELD_ALIASES.notes)
  const attributeColumns = headers
    .map((header, index) => ({ index, attribute: mapHeaderToAttribute(header, index) }))
    .filter((entry): entry is { index: number; attribute: ProcurementLineItemAttribute } => Boolean(entry.attribute))

  if (descCols.length === 0 && skuCols.length === 0) return { items: [], warnings: [], skippedRows: 0, confidence: 0 }
  if (qtyCols.length === 0 && !headers.some((header) => /qty|quantity|takeoff|amount/i.test(header))) {
    return { items: [], warnings: [], skippedRows: 0, confidence: 0 }
  }

  const rawItems = dataRows.map((row, index): RawItem => {
    const quantityText = joinCells(row, qtyCols)
    const quantityUnit = parseQuantityUnit(quantityText)
    const unitText = joinCells(row, unitCols) || quantityUnit.unit

    return {
      sourceRow: headerIndex + index + 2,
      sku: joinCells(row, skuCols),
      description: joinCells(row, descCols),
      quantity: quantityText,
      unit: unitText,
      attributes: attributeColumns
        .map(({ index: columnIndex, attribute }) => ({
          ...attribute,
          value: compactCell(row[columnIndex]),
        }))
        .filter((attribute) => attribute.value),
      specs: joinCells(row, specCols),
      constraints: joinCells(row, constraintsCols),
      certifications: joinCells(row, certCols),
      notes: joinCells(row, notesCols),
      contractor_budget: joinCells(row, budgetCols) || undefined,
      suggested_lead_time_days: joinCells(row, leadCols) || undefined,
    }
  })

  const result = sanitizeItems(rawItems, category)
  const mappedFieldCount = [
    skuCols,
    descCols,
    qtyCols,
    unitCols,
    specCols,
    constraintsCols,
    certCols,
    notesCols,
    budgetCols,
    leadCols,
  ].filter((cols) => cols.length > 0).length
  return {
    ...result,
    confidence: result.items.length > 0 ? Math.min(0.99, 0.55 + mappedFieldCount * 0.05) : 0,
  }
}

function deterministicQuantityLineImport(text: string, category?: string): ParsedAttempt {
  const unitPattern = '(?:ea|each|pcs?|pieces?|sf|sq\\.?\\s*ft|sqft|lf|lin\\.?\\s*ft|linear\\s*ft|cy|cu\\.?\\s*yd|cubic\\s*yd|tons?|tn|tonnes?|bf|sheets?)'
  const linePattern = new RegExp(`^(.+?)\\s+([0-9][0-9,]*(?:\\.\\d+)?)\\s+(${unitPattern})\\b\\s*(.*)$`, 'i')
  const rawItems = text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line && !/^(item|material|description)\b/i.test(line))
    .flatMap((line, index): RawItem[] => {
      const match = line.match(linePattern)
      if (!match) return []
      return [{
        sourceRow: index + 1,
        description: match[1],
        quantity: match[2],
        unit: match[3],
        specs: match[4] ?? '',
      }]
    })
  const result = sanitizeItems(rawItems, category)
  return {
    ...result,
    confidence: result.items.length > 0 ? 0.65 : 0,
  }
}
export async function importLineItems(input: ImportInput): Promise<ImportLineItemsResult> {
  const normalizedText = normalizeText(input.text)
  if (!normalizedText) throw new Error('Import file is empty.')

  const tableResult = deterministicTableImport(normalizedText, input.category)
  if (tableResult.items.length > 0 && tableResult.confidence >= 0.7) {
    return {
      items: tableResult.items,
      metadata: {
        parser: 'deterministic-table',
        confidence: tableResult.confidence,
        warnings: [...(input.extractionWarnings ?? []), ...tableResult.warnings],
        skippedRows: tableResult.skippedRows,
      },
    }
  }

  const lineResult = deterministicQuantityLineImport(normalizedText, input.category)
  if (lineResult.items.length > 0 && lineResult.confidence >= 0.65) {
    return {
      items: lineResult.items,
      metadata: {
        parser: 'deterministic-lines',
        confidence: lineResult.confidence,
        warnings: [...(input.extractionWarnings ?? []), ...lineResult.warnings],
        skippedRows: lineResult.skippedRows,
      },
    }
  }
  const bestFallback = tableResult.items.length >= lineResult.items.length ? tableResult : lineResult
  if (bestFallback.items.length > 0) {
    return {
      items: bestFallback.items,
      metadata: {
        parser: tableResult.items.length >= lineResult.items.length ? 'deterministic-table' : 'deterministic-lines',
        confidence: bestFallback.confidence,
        warnings: [
          ...(input.extractionWarnings ?? []),
          ...bestFallback.warnings,
          { message: 'Imported with low confidence. Review quantities, units, and specs before publishing.' },
        ],
        skippedRows: bestFallback.skippedRows,
      },
    }
  }

  throw new Error('No usable material line items were found in this file.')
}

export function isProbablyText(buffer: Buffer) {
  if (buffer.length === 0) return false
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096))
  let suspicious = 0
  for (const byte of sample) {
    if (byte === 0) return false
    if (byte < 7 || (byte > 13 && byte < 32)) suspicious += 1
  }
  return suspicious / sample.length < 0.02
}
