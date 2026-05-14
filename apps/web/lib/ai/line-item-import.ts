import { readFileSync } from 'fs'
import { join } from 'path'
import { z } from 'zod'
import {
  makeFieldDefinition,
  normalizeFieldKey,
  type CustomLineItemFieldDefinition,
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

type ImportColumnRole = { key: string; label: string; role: 'item' | 'quantity' | 'unit' | 'custom'; sourceIndex: number }
type SourceColumnRole = 'item' | 'quantity' | 'unit' | 'custom' | 'ignore'
type SourceColumnDecision = {
  sourceIndex: number
  role: SourceColumnRole
  itemValueKind?: 'sku' | 'description'
  label?: string
}

export interface ImportLineItemsResult {
  items: ImportedLineItem[]
  metadata: {
    parser: 'deterministic-table' | 'deterministic-headerless-table' | 'deterministic-lines' | 'ai-table'
    confidence: number
    warnings: ImportWarning[]
    skippedRows: number
    importedColumns?: CustomLineItemFieldDefinition[]
    columnRoles?: ImportColumnRole[]
    columnRoleSource?: 'ai' | 'deterministic'
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
  importedColumns?: CustomLineItemFieldDefinition[]
  columnRoles?: ImportColumnRole[]
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

const columnRoleResponseSchema = z.object({
  columns: z.array(z.object({
    sourceIndex: z.number().int().nonnegative(),
    role: z.enum(['item', 'quantity', 'unit', 'custom', 'ignore']),
    itemValueKind: z.string().optional(),
    label: z.string().optional(),
  })),
  warnings: z.array(z.union([
    z.string(),
    z.object({ row: z.number().optional(), message: z.string() }),
  ])).optional().default([]),
})

let envLoaded = false

function ensureLocalEnvLoaded() {
  if (envLoaded) return
  envLoaded = true
  try {
    const lines = readFileSync(join(process.cwd(), '.env.local'), 'utf8').split('\n')
    for (const line of lines) {
      const eq = line.indexOf('=')
      if (eq > 0) {
        const key = line.slice(0, eq).trim()
        const val = line.slice(eq + 1).trim()
        if (key && !process.env[key]) process.env[key] = val
      }
    }
  } catch {}
}

const UNIT_CELL_PATTERN = /^(?:ea|each|pcs?|pieces?|sf|sq\.?\s*ft|sqft|ft2|sy|sq\.?\s*yd|sqyd|yd2|lf|lft|lin\.?\s*ft|linear\s*ft|ft|cy|cu\.?\s*yd|cubic\s*yd|yd3|tons?|tn|tonnes?|bf|sheets?|lbs?|lb|pounds?)$/i

const FIELD_ALIASES = {
  sku: ['sku', 'item code', 'item no', 'item #', 'item number', 'part', 'part no', 'part number', 'product code', 'material code'],
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
  let atFieldStart = true
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const next = line[i + 1]
    if (char === '"' && inQuotes && next === '"') {
      i += 1
      atFieldStart = false
      continue
    }
    if (char === '"' && inQuotes) {
      inQuotes = false
      atFieldStart = false
      continue
    }
    // Only enter quoted mode when the quote appears at the start of a field.
    // Mid-field quotes (e.g. 3/4" conduit) are treated as literal characters.
    if (char === '"' && atFieldStart) {
      inQuotes = true
      atFieldStart = false
      continue
    }
    if (!inQuotes && char === delimiter) {
      count += 1
      atFieldStart = true
      continue
    }
    atFieldStart = false
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
  let atFieldStart = true
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const next = line[i + 1]
    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      i += 1
      atFieldStart = false
      continue
    }
    if (char === '"' && inQuotes) {
      inQuotes = false
      atFieldStart = false
      continue
    }
    // Only enter quoted mode when the quote appears at the start of a field.
    // Mid-field quotes (e.g. 3/4" conduit) are treated as literal characters.
    if (char === '"' && atFieldStart) {
      inQuotes = true
      atFieldStart = false
      continue
    }
    if (!inQuotes && char === delimiter) {
      cells.push(current.trim())
      current = ''
      atFieldStart = true
      continue
    }
    current += char
    atFieldStart = false
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
    if (target.length <= 3) return normalized === target
    return normalized === target || normalized.includes(target)
  })
}

function isUnitCell(value: unknown) {
  return UNIT_CELL_PATTERN.test(compactCell(value, 40).replace(/\./g, '').trim())
}

function hasNumericCell(value: unknown) {
  return toNumber(value) !== undefined
}

function rowLooksLikeLineItemData(row: string[]) {
  const nonEmpty = row.map((cell) => compactCell(cell)).filter(Boolean)
  if (nonEmpty.length < 2) return false
  const hasDescription = nonEmpty.some((cell) => /[A-Za-z]/.test(cell) && cell.length >= 4 && !isUnitCell(cell))
  const hasCombinedQuantityUnit = nonEmpty.some((cell) => {
    const parsed = parseQuantityUnit(cell)
    return (parsed.quantity ?? 0) > 0 && Boolean(parsed.unit)
  })
  const hasAdjacentQuantityUnit = row.some((cell, index) => (
    hasNumericCell(cell) && (isUnitCell(row[index - 1]) || isUnitCell(row[index + 1]))
  ))
  return hasDescription && (hasCombinedQuantityUnit || hasAdjacentQuantityUnit)
}

function importedFieldFromHeader(header: string, sourceIndex: number, order: number, seenKeys: Set<string>): CustomLineItemFieldDefinition | null {
  const label = header.replace(/[_/-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
  if (!label || /^(#|no\.?)$/i.test(label)) return null
  if (toNumber(label) !== undefined || isUnitCell(label)) return null

  const baseKey = `imported_${normalizeFieldKey(label) || `column_${sourceIndex + 1}`}`
  let key = baseKey
  let suffix = 2
  while (seenKeys.has(key)) {
    key = `${baseKey}_${suffix}`
    suffix += 1
  }
  seenKeys.add(key)

  return makeFieldDefinition(label, order, 'spreadsheet', {
    key,
    label,
    group: 'From uploaded file',
    inputType: 'text',
    visible: true,
    required: false,
    options: [],
  })
}

function importedFieldFromLabel(label: string, sourceIndex: number, order: number, seenKeys: Set<string>) {
  return importedFieldFromHeader(label, sourceIndex, order, seenKeys)
}

function findColumns(headers: string[], aliases: readonly string[]) {
  return headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => aliasMatches(header, aliases))
    .map(({ index }) => index)
}

function findExplicitDescriptionColumns(headers: string[]) {
  return headers
    .map((header, index) => ({ header: normalizeHeader(header), index }))
    .filter(({ header }) => /\bdesc(?:ription)?\b/.test(header))
    .map(({ index }) => index)
}

function chooseDescriptionColumns(headers: string[], skuColumns: number[]) {
  const explicitDescriptionColumns = findExplicitDescriptionColumns(headers)
  const candidates = (explicitDescriptionColumns.length > 0 ? explicitDescriptionColumns : findColumns(headers, FIELD_ALIASES.description))
    .filter((index) => !skuColumns.includes(index))
  const nonScopeCandidates = candidates.filter((index) => normalizeHeader(headers[index]) !== 'scope')
  return nonScopeCandidates.length > 0 ? nonScopeCandidates : candidates
}

function itemValueKindForHeader(header: string): 'sku' | 'description' {
  const normalized = normalizeHeader(header)
  if (/\b(?:sku|part|product code|material code|item no|item number)\b/.test(normalized)) return 'sku'
  return 'description'
}

function columnDecisionsFromDeterministicRules(headers: string[]) {
  const allSkuCols = findColumns(headers, FIELD_ALIASES.sku)
  const itemCodeCols = headers
    .map((header, index) => ({ header: normalizeHeader(header), index }))
    .filter(({ header }) => header === 'item code')
    .map(({ index }) => index)
  const explicitDescCols = findExplicitDescriptionColumns(headers)
  const skuCols = itemCodeCols.length > 0 && explicitDescCols.length > 0
    ? allSkuCols.filter((index) => !itemCodeCols.includes(index))
    : allSkuCols
  const descCols = chooseDescriptionColumns(headers, skuCols)
  const qtyCols = findColumns(headers, FIELD_ALIASES.quantity)
  const unitCols = findColumns(headers, FIELD_ALIASES.unit)
  return {
    skuCols,
    descCols,
    qtyCols,
    unitCols,
    customCols: [] as number[],
    ignoredCols: [] as number[],
  }
}

function columnDecisionsFromAi(headers: string[], decisions: SourceColumnDecision[]) {
  const byIndex = new Map<number, SourceColumnDecision>()
  decisions.forEach((decision) => {
    if (decision.sourceIndex >= 0 && decision.sourceIndex < headers.length && !byIndex.has(decision.sourceIndex)) {
      byIndex.set(decision.sourceIndex, decision)
    }
  })

  const itemDecisions = [...byIndex.values()].filter((decision) => decision.role === 'item')
  const skuCols = itemDecisions
    .filter((decision) => (decision.itemValueKind ?? itemValueKindForHeader(headers[decision.sourceIndex])) === 'sku')
    .map((decision) => decision.sourceIndex)
  const descCols = itemDecisions
    .filter((decision) => (decision.itemValueKind ?? itemValueKindForHeader(headers[decision.sourceIndex])) === 'description')
    .map((decision) => decision.sourceIndex)
  const qtyCols = [...byIndex.values()].filter((decision) => decision.role === 'quantity').map((decision) => decision.sourceIndex)
  const unitCols = [...byIndex.values()].filter((decision) => decision.role === 'unit').map((decision) => decision.sourceIndex)
  const customCols = [...byIndex.values()].filter((decision) => decision.role === 'custom').map((decision) => decision.sourceIndex)
  const ignoredCols = [...byIndex.values()].filter((decision) => decision.role === 'ignore').map((decision) => decision.sourceIndex)

  return { skuCols, descCols, qtyCols, unitCols, customCols, ignoredCols }
}

function strongSkuHeader(header: string) {
  return /^(?:sku|product code|material code|part|part no|part number)$/.test(normalizeHeader(header))
}

function applyColumnDecisionSafetyRails(headers: string[], decisions: SourceColumnDecision[]) {
  const next = new Map<number, SourceColumnDecision>()
  decisions.forEach((decision) => next.set(decision.sourceIndex, { ...decision }))

  const explicitDescriptionColumns = findExplicitDescriptionColumns(headers)
  const itemCodeColumns = headers
    .map((header, index) => ({ header: normalizeHeader(header), index }))
    .filter(({ header }) => header === 'item code')
    .map(({ index }) => index)

  if (explicitDescriptionColumns.length > 0) {
    explicitDescriptionColumns.forEach((sourceIndex) => {
      const existing = next.get(sourceIndex)
      next.set(sourceIndex, {
        sourceIndex,
        label: existing?.label,
        role: 'item',
        itemValueKind: 'description',
      })
    })
  }

  itemCodeColumns.forEach((sourceIndex) => {
    if (explicitDescriptionColumns.length === 0) return
    const existing = next.get(sourceIndex)
    next.set(sourceIndex, {
      sourceIndex,
      label: existing?.label,
      role: 'custom',
    })
  })

  headers.forEach((header, sourceIndex) => {
    if (!strongSkuHeader(header)) return
    const existing = next.get(sourceIndex)
    next.set(sourceIndex, {
      sourceIndex,
      label: existing?.label,
      role: 'item',
      itemValueKind: 'sku',
    })
  })

  return [...next.values()].sort((a, b) => a.sourceIndex - b.sourceIndex)
}

function scoreHeader(headers: string[]) {
  const normalized = headers.map(normalizeHeader)
  const groups = {
    sku: FIELD_ALIASES.sku,
    description: FIELD_ALIASES.description,
    quantity: FIELD_ALIASES.quantity,
    unit: FIELD_ALIASES.unit,
    specs: FIELD_ALIASES.specs,
    certifications: FIELD_ALIASES.certifications,
    budget: FIELD_ALIASES.budget,
    leadTime: FIELD_ALIASES.leadTime,
    notes: FIELD_ALIASES.notes,
  }
  const matched = Object.fromEntries(Object.entries(groups).map(([key, aliases]) => [
    key,
    normalized.some((header) => aliases.some((alias) => header === normalizeHeader(alias) || header.includes(normalizeHeader(alias))))
  ])) as Record<keyof typeof groups, boolean>
  const optionalScore = [
    matched.specs,
    matched.certifications,
    matched.budget,
    matched.leadTime,
    matched.notes,
  ].filter(Boolean).length
  const coreScore = [
    matched.sku,
    matched.description,
    matched.quantity,
    matched.unit,
  ].filter(Boolean).length
  const hasItemHeader = matched.sku || matched.description
  const hasQuantityHeader = matched.quantity
  const hasUnitHeader = matched.unit
  if (!hasItemHeader || (!hasQuantityHeader && !hasUnitHeader)) return 0
  return coreScore * 2 + optionalScore
}

function detectHeaderRow(rows: string[][]) {
  const candidates = rows.slice(0, Math.min(rows.length, 8))
  let best = { index: -1, score: 0 }
  candidates.forEach((row, index) => {
    if (rowLooksLikeLineItemData(row)) return
    const score = scoreHeader(row)
    if (score > best.score) best = { index, score }
  })
  return best.score >= 4 ? best.index : -1
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
  const match = text.match(/([0-9][0-9,\s]*(?:\.[0-9]+)?)\s*(tons?|tn|tonnes?|ea|each|pcs?|pieces?|sf|sq\.?\s*ft|sqft|ft2|sy|sq\.?\s*yd|sqyd|yd2|lf|lin\.?\s*ft|linear\s*ft|cy|cu\.?\s*yd|cubic\s*yd|yd3|bf|sheets?|lbs?|pounds?)\b/i)
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
    sy: 'sy',
    sqyd: 'sy',
    'sq yd': 'sy',
    'sq. yd': 'sy',
    yd2: 'sy',
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

function rowHasPositiveQuantity(row: string[], quantityColumns: number[]) {
  const quantityText = joinCells(row, quantityColumns)
  const quantityUnit = parseQuantityUnit(quantityText)
  return (quantityUnit.quantity ?? toNumber(quantityText) ?? 0) > 0
}

function sectionHeaderFromRow(row: string[], quantityColumns: number[], unitColumns: number[]) {
  if (rowHasPositiveQuantity(row, quantityColumns)) return ''
  if (row.some((cell, index) => unitColumns.includes(index) && isUnitCell(cell))) return ''

  const nonEmpty = row
    .map((cell, index) => ({ index, value: compactCell(cell, 160) }))
    .filter(({ value }) => value)
  if (nonEmpty.length === 0 || nonEmpty.length > 2) return ''

  const text = nonEmpty.map(({ value }) => value).join(' ').replace(/\s+/g, ' ').trim()
  if (!/[A-Za-z]/.test(text) || text.length < 4) return ''
  if (/^(?:total|subtotal|grand total|page|date|estimator|project|status|schedule|market sector|signature|prepared by)\b/i.test(text)) return ''
  if (/\b(?:am|pm)\b/i.test(text) || /^\d+\s*\/\s*\d+$/.test(text)) return ''

  const firstColumn = nonEmpty[0]?.index ?? 0
  const csiSection = /^\d{2}\s+\d{2}\s+\d{2}(?:\.\d+)?\s*[-–—:]\s*\S/.test(text)
  if (csiSection) return text
  if (firstColumn <= 1 && nonEmpty.length === 1 && textValueScore(text) > 16 && !hasNumericCell(text)) return text
  return ''
}

function sourceColumnHasValues(rows: string[][], columnIndex: number) {
  return rows.some((row) => Boolean(compactCell(row[columnIndex])))
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
      skippedRows += 1
      warnings.push({ row: raw.sourceRow, message: 'Skipped row with no positive quantity.' })
      return []
    }

    const unitText = compactCell(item.unit, 40) || quantityUnit.unit
    if (!unitText) {
      warnings.push({ row: raw.sourceRow, message: 'Imported row has no explicit unit; Rialto inferred one from the item description.' })
    }
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

function deterministicTableImport(text: string, category?: string, aiColumnDecisions?: SourceColumnDecision[]): ParsedAttempt {
  const { rows } = tableRowsFromText(text)
  if (rows.length < 2) return { items: [], warnings: [], skippedRows: 0, confidence: 0 }

  const headerIndex = detectHeaderRow(rows)
  if (headerIndex < 0) return { items: [], warnings: [], skippedRows: 0, confidence: 0 }

  const headers = rows[headerIndex]
  const dataRows = rows.slice(headerIndex + 1)
  const columnSelection = aiColumnDecisions?.length
    ? columnDecisionsFromAi(headers, aiColumnDecisions)
    : columnDecisionsFromDeterministicRules(headers)
  const { skuCols, descCols, qtyCols, unitCols, customCols, ignoredCols } = columnSelection
  const explicitCustomColumns = new Set(customCols)
  const ignoredColumns = new Set(ignoredCols)
  const itemCols = skuCols.length > 0 ? skuCols : descCols
  const descriptionContextColumns = new Set(skuCols.length > 0 ? descCols : [])
  const consumedColumns = new Set([...itemCols, ...qtyCols, ...unitCols, ...ignoredCols])
  const seenImportedKeys = new Set<string>()
  const rowClassifications = dataRows.map((row) => {
    const isMaterial = rowHasPositiveQuantity(row, qtyCols) && Boolean(joinCells(row, [...skuCols, ...descCols]))
    return {
      row,
      isMaterial,
      section: sectionHeaderFromRow(row, qtyCols, unitCols),
    }
  })
  const materialRows = rowClassifications.filter((entry) => entry.isMaterial).map((entry) => entry.row)
  const inferredSections = rowClassifications.some((entry) => Boolean(entry.section))
  const scopeLabel = headers.some((header) => normalizeHeader(header) === 'scope') ? 'Section' : 'Scope'
  const scopeField = inferredSections
    ? importedFieldFromLabel(scopeLabel, -1, 0, seenImportedKeys)
    : null
  const importedColumns = headers
    .map((header, index) => ({
      index,
      field: consumedColumns.has(index)
        ? null
        : (descriptionContextColumns.has(index) || explicitCustomColumns.size === 0 || explicitCustomColumns.has(index) || !aiColumnDecisions?.length) &&
          !ignoredColumns.has(index) &&
          sourceColumnHasValues(materialRows, index)
          ? importedFieldFromHeader(header, index, index + (scopeField ? 1 : 0), seenImportedKeys)
          : null,
    }))
    .filter((entry): entry is { index: number; field: CustomLineItemFieldDefinition } => Boolean(entry.field))
  const columnRoles: ImportColumnRole[] = headers.flatMap((header, index): ImportColumnRole[] => {
    const field = importedColumns.find((entry) => entry.index === index)?.field
    const label = header.replace(/[_/-]+/g, ' ').replace(/\s+/g, ' ').trim()
    if (!label) return []
    if (itemCols.includes(index)) return [{ key: skuCols.length > 0 ? 'sku' : 'description', label, role: 'item' as const, sourceIndex: index }]
    if (qtyCols.includes(index)) return [{ key: 'quantity', label, role: 'quantity' as const, sourceIndex: index }]
    if (unitCols.includes(index)) return [{ key: 'unit', label, role: 'unit' as const, sourceIndex: index }]
    if (field) return [{ key: field.key, label: field.label, role: 'custom' as const, sourceIndex: index }]
    return []
  })
  if (scopeField) {
    columnRoles.unshift({ key: scopeField.key, label: scopeField.label, role: 'custom', sourceIndex: -1 })
  }

  if (descCols.length === 0 && skuCols.length === 0) return { items: [], warnings: [], skippedRows: 0, confidence: 0 }
  if (qtyCols.length === 0 && !headers.some((header) => /qty|quantity|takeoff|amount/i.test(header))) {
    return { items: [], warnings: [], skippedRows: 0, confidence: 0 }
  }

  const rawItems: RawItem[] = []
  let activeSection = ''
  rowClassifications.forEach(({ row, isMaterial, section }, index) => {
    if (section) {
      activeSection = section
      return
    }
    if (!isMaterial) return

    const quantityText = joinCells(row, qtyCols)
    const quantityUnit = parseQuantityUnit(quantityText)
    const unitText = joinCells(row, unitCols) || quantityUnit.unit
    const attributes: ProcurementLineItemAttribute[] = []
    if (scopeField && activeSection) {
      attributes.push({
        key: scopeField.key,
        label: scopeField.label,
        value: activeSection,
        group: scopeField.group,
        helperText: scopeField.helperText,
        inputType: scopeField.inputType,
        required: scopeField.required,
        visible: scopeField.visible,
        options: scopeField.options,
        source: scopeField.source,
        order: scopeField.order,
      })
    }
    attributes.push(...importedColumns
      .map(({ index: columnIndex, field }) => ({
        key: field.key,
        label: field.label,
        value: compactCell(row[columnIndex]),
        group: field.group,
        helperText: field.helperText,
        inputType: field.inputType,
        required: field.required,
        visible: field.visible,
        options: field.options,
        source: field.source,
        order: field.order,
      }))
      .filter((attribute) => attribute.value))

    rawItems.push({
      sourceRow: headerIndex + index + 2,
      sku: joinCells(row, skuCols),
      description: joinCells(row, descCols),
      quantity: quantityText,
      unit: unitText,
      attributes,
      specs: '',
      constraints: '',
      certifications: [],
      notes: '',
      contractor_budget: undefined,
      suggested_lead_time_days: undefined,
    })
  })

  const result = sanitizeItems(rawItems, category)
  const mappedFieldCount = [
    skuCols,
    descCols,
    qtyCols,
    unitCols,
    importedColumns.map(({ index }) => index),
    scopeField ? [-1] : [],
  ].filter((cols) => cols.length > 0).length
  return {
    ...result,
    importedColumns: [
      ...(scopeField ? [scopeField] : []),
      ...importedColumns.map(({ field }) => field),
    ],
    columnRoles,
    confidence: result.items.length > 0 ? Math.min(0.99, 0.55 + mappedFieldCount * 0.05) : 0,
  }
}

function findQuantityUnitInRow(row: string[]) {
  const candidates: Array<{ quantity: number; unit: string; quantityIndex: number; unitIndex: number; score: number }> = []

  row.forEach((cell, index) => {
    const parsed = parseQuantityUnit(cell)
    if ((parsed.quantity ?? 0) > 0 && parsed.unit) {
      candidates.push({
        quantity: parsed.quantity!,
        unit: parsed.unit,
        quantityIndex: index,
        unitIndex: index,
        score: 3,
      })
    }

    const quantity = toNumber(cell)
    if (!quantity || quantity <= 0) return
    for (const unitIndex of [index + 1, index - 1]) {
      if (!isUnitCell(row[unitIndex])) continue
      candidates.push({
        quantity,
        unit: compactCell(row[unitIndex], 40),
        quantityIndex: index,
        unitIndex,
        score: unitIndex === index + 1 ? 5 : 4,
      })
    }
  })

  return candidates.sort((a, b) => b.score - a.score || a.quantityIndex - b.quantityIndex)[0]
}

function textValueScore(value: string) {
  if (!value || isUnitCell(value)) return -1
  if (hasNumericCell(value) && !/[A-Za-z]/.test(value)) return -1
  if (/^(?:notes?|comments?|remarks?|total|subtotal|page|section)\b[:\s-]*$/i.test(value)) return -2
  const letterCount = (value.match(/[A-Za-z]/g) ?? []).length
  const wordCount = value.split(/\s+/).filter(Boolean).length
  return letterCount + wordCount * 4 + Math.min(value.length, 120) / 4
}

function deterministicHeaderlessTableImport(text: string, category?: string): ParsedAttempt {
  const { rows } = tableRowsFromText(text)
  if (rows.length < 1) return { items: [], warnings: [], skippedRows: 0, confidence: 0 }
  if (detectHeaderRow(rows) >= 0) return { items: [], warnings: [], skippedRows: 0, confidence: 0 }

  const rawItems: RawItem[] = []
  let skippedRows = 0
  const warnings: ImportWarning[] = []

  rows.forEach((row, index) => {
    const quantityUnit = findQuantityUnitInRow(row)
    if (!quantityUnit) {
      skippedRows += 1
      return
    }

    const textCandidates = row
      .map((cell, columnIndex) => ({ columnIndex, value: compactCell(cell, 220) }))
      .filter(({ columnIndex, value }) => {
        if (columnIndex === quantityUnit.quantityIndex || columnIndex === quantityUnit.unitIndex) return false
        if (columnIndex > quantityUnit.quantityIndex && row.slice(0, quantityUnit.quantityIndex).some((candidate) => textValueScore(compactCell(candidate)) > 0)) return false
        return textValueScore(value) > 0
      })
      .sort((a, b) => a.columnIndex - b.columnIndex)

    const beforeQuantityCandidates = textCandidates.filter((candidate) => candidate.columnIndex < quantityUnit.quantityIndex)
    const primaryCandidate = beforeQuantityCandidates[0] ?? textCandidates[0]
    const secondaryCandidate = beforeQuantityCandidates[1]
    const firstLooksLikeSku = Boolean(primaryCandidate && /^[A-Z0-9][A-Z0-9._/#-]{2,}$/i.test(primaryCandidate.value) && !/\s/.test(primaryCandidate.value))
    const descriptionCandidate = firstLooksLikeSku && secondaryCandidate ? secondaryCandidate : primaryCandidate
    const sku = firstLooksLikeSku && secondaryCandidate ? primaryCandidate.value : ''
    const description = descriptionCandidate?.value ?? ''
    if (!description) {
      skippedRows += 1
      warnings.push({ row: index + 1, message: 'Skipped row because no item description or SKU was found near the quantity.' })
      return
    }

    const tailCells = row
      .map((cell, columnIndex) => ({ columnIndex, value: compactCell(cell, 300) }))
      .filter(({ columnIndex, value }) => (
        value &&
        columnIndex !== quantityUnit.quantityIndex &&
        columnIndex !== quantityUnit.unitIndex &&
        value !== sku &&
        value !== description &&
        columnIndex > (descriptionCandidate?.columnIndex ?? -1)
      ))
      .map(({ value }) => value)

    const certificationCells = tailCells.filter((value) => /\b(?:ASTM|AISC|ISO|UL|FM|ANSI|NFPA)\b/i.test(value))
    const specCells = tailCells.filter((value) => !certificationCells.includes(value))

    rawItems.push({
      sourceRow: index + 1,
      sku,
      description,
      quantity: String(quantityUnit.quantity),
      unit: quantityUnit.unit,
      specs: specCells.join('; '),
      certifications: certificationCells,
    })
  })

  const result = sanitizeItems(rawItems, category)
  const importedCount = result.items.length
  const confidence = importedCount > 0
    ? Math.min(0.88, Math.max(0.55, 0.62 + Math.min(importedCount, 5) * 0.05 - Math.min(skippedRows, 3) * 0.02))
    : 0

  return {
    items: result.items,
    warnings: [...warnings, ...result.warnings],
    skippedRows: skippedRows + result.skippedRows,
    confidence,
  }
}

function deterministicQuantityLineImport(text: string, category?: string): ParsedAttempt {
  const unitPattern = '(?:ea|each|pcs?|pieces?|sf|sq\\.?\\s*ft|sqft|sy|sq\\.?\\s*yd|sqyd|lf|lin\\.?\\s*ft|linear\\s*ft|cy|cu\\.?\\s*yd|cubic\\s*yd|tons?|tn|tonnes?|bf|sheets?)'
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

function warningObjects(warnings: z.infer<typeof importResponseSchema>['warnings']): ImportWarning[] {
  return warnings.map((warning) => (
    typeof warning === 'string'
      ? { message: warning }
      : { row: warning.row, message: warning.message }
  ))
}

async function aiColumnRoleDecisions(input: ImportInput, normalizedText: string): Promise<{ decisions: SourceColumnDecision[]; warnings: ImportWarning[] } | null> {
  ensureLocalEnvLoaded()
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || process.env.DISABLE_AI_COLUMN_ROLES === '1') return null

  const { rows, delimiter } = tableRowsFromText(normalizedText)
  const headerIndex = detectHeaderRow(rows)
  if (headerIndex < 0) return null

  const headers = rows[headerIndex]
  const sampleRows = rows
    .slice(headerIndex + 1, headerIndex + 17)
    .filter((row) => row.some((cell) => compactCell(cell)))
    .map((row, offset) => ({
      sourceRow: headerIndex + offset + 2,
      cells: headers.map((header, index) => ({
        sourceIndex: index,
        header: compactCell(header, 80),
        value: compactCell(row[index], 160),
      })).filter((cell) => cell.header || cell.value),
    }))

  const prompt = [
    `Filename: ${input.filename}`,
    `Request type: ${input.requestType ?? 'rfq'}`,
    `Project: ${input.projectName || 'unknown'}`,
    `Category: ${input.category || 'unknown'}`,
    `Source kind: ${input.sourceKind ?? 'text'}`,
    `Delimiter: ${delimiter === '\t' ? 'tab' : delimiter}`,
    '',
    'Detected source headers:',
    JSON.stringify(headers.map((header, sourceIndex) => ({ sourceIndex, header })), null, 2),
    '',
    'Sample rows below the header:',
    JSON.stringify(sampleRows, null, 2),
  ].join('\n')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: { authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_COLUMN_ROLE_MODEL || process.env.OPENAI_MODEL || 'gpt-5-mini',
      response_format: { type: 'json_object' },
      max_completion_tokens: 3000,
      reasoning_effort: 'low',
      messages: [
        {
          role: 'system',
          content: [
            'You classify columns in construction RFQ material import tables.',
            'Return strict JSON: { "columns": [{ "sourceIndex": number, "role": "item"|"quantity"|"unit"|"custom"|"ignore", "itemValueKind": "sku"|"description", "label": string }], "warnings": [] }.',
            'Choose which source column should populate Rialto\'s required Item Description/SKU field.',
            'Use role item with itemValueKind description for human-readable material descriptions.',
            'Use role item with itemValueKind sku only for true catalog identifiers, SKUs, part numbers, or product codes that should be the primary required item cell.',
            'If a file has Item Code plus Item Description, usually make Item Description the item and Item Code custom.',
            'Make quantity the column containing requested quantities, including combined values like "25 tons".',
            'Make unit the explicit UOM/unit column only; if units are combined with quantity, leave unit absent.',
            'Make source columns like Scope, Section, Variant, Per, Notes, Spec, Budget, Lead Time, Manufacturer, Grade, Compliance custom unless they are the required item/quantity/unit.',
            'Use ignore for blank spacer columns, formatting-only columns, price columns with no values, metadata, totals, signatures, and footer-only columns.',
            'Classify every meaningful source column exactly once.',
          ].join(' '),
        },
        { role: 'user', content: prompt },
      ],
    }),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`OpenAI column classification failed with ${response.status}. ${detail.slice(0, 180)}`)
  }
  const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const choice = json.choices?.[0] as { finish_reason?: string; message?: { content?: string | Array<{ text?: string; type?: string }> } } | undefined
  const rawContent = choice?.message?.content
  const content = (typeof rawContent === 'string'
    ? rawContent
    : Array.isArray(rawContent)
      ? rawContent.map((part) => part.text ?? '').join('')
      : '').trim()
  if (!content) {
    throw new Error(`OpenAI column classification returned an empty response${choice?.finish_reason ? ` (${choice.finish_reason})` : ''}.`)
  }
  const parsed = columnRoleResponseSchema.parse(parseJsonResponse<unknown>(content))
  const validDecisions = parsed.columns
    .filter((decision) => decision.sourceIndex < headers.length)
    .map((decision): SourceColumnDecision => ({
      ...decision,
      itemValueKind: decision.itemValueKind === 'sku' || decision.itemValueKind === 'description'
        ? decision.itemValueKind
        : undefined,
    }))
  return {
    decisions: applyColumnDecisionSafetyRails(headers, validDecisions),
    warnings: warningObjects(parsed.warnings),
  }
}

async function aiLineItemImport(input: ImportInput, normalizedText: string): Promise<ParsedAttempt | null> {
  ensureLocalEnvLoaded()
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  const hint = buildStructuredHint(normalizedText)
  const prompt = [
    `Filename: ${input.filename}`,
    `Request type: ${input.requestType ?? 'rfq'}`,
    `Project: ${input.projectName || 'unknown'}`,
    `Category: ${input.category || 'unknown'}`,
    `Source kind: ${input.sourceKind ?? 'text'}`,
    '',
    'Detected table hint:',
    JSON.stringify(hint, null, 2),
    '',
    'File text:',
    normalizedText.slice(0, 24_000),
  ].join('\n')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5-mini',
      response_format: { type: 'json_object' },
      max_completion_tokens: 1800,
      messages: [
        {
          role: 'system',
          content: [
            'You extract construction procurement line items from messy CSV, Excel, PDF text, and takeoff tables.',
            'Return strict JSON with { "items": [...], "warnings": [...] }.',
            'Each item must have a general item/description or SKU, a positive numeric quantity, and a unit.',
            'Use sku only for true item codes, part numbers, or catalog identifiers; otherwise put the item name in description.',
            'Treat rows as data unless a row clearly contains column labels for item plus quantity or unit.',
            'Never treat simple row values like "12800", "SF", "ASTM C..." or material notes as column names.',
            'Skip title rows, note paragraphs, section headings, subtotal/total rows, and rows without quantity and unit.',
            'Optional fields: specs, constraints, certifications, notes, contractor_budget, suggested_lead_time_days.',
          ].join(' '),
        },
        { role: 'user', content: prompt },
      ],
    }),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`OpenAI line item import failed with ${response.status}. ${detail.slice(0, 240)}`)
  }
  const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = json.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('OpenAI line item import returned an empty response.')
  const parsed = importResponseSchema.parse(parseJsonResponse<unknown>(content))
  const result = sanitizeItems(parsed.items, input.category)
  return {
    ...result,
    warnings: [...warningObjects(parsed.warnings), ...result.warnings],
    confidence: result.items.length > 0 ? Math.max(result.confidence, 0.86) : 0,
  }
}

export async function importLineItems(input: ImportInput): Promise<ImportLineItemsResult> {
  const normalizedText = normalizeText(input.text)
  if (!normalizedText) throw new Error('Import file is empty.')

  let aiColumnWarnings: ImportWarning[] = []
  let aiColumnDecisions: SourceColumnDecision[] | undefined
  try {
    const aiColumns = await aiColumnRoleDecisions(input, normalizedText)
    if (aiColumns?.decisions.length) {
      aiColumnDecisions = aiColumns.decisions
      aiColumnWarnings = aiColumns.warnings
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI column classification failed.'
    aiColumnWarnings = [{ message: `${message} Falling back to deterministic column matching.` }]
  }

  const tableResult = deterministicTableImport(normalizedText, input.category, aiColumnDecisions)
  if (tableResult.items.length > 0 && tableResult.confidence >= 0.7) {
    return {
      items: tableResult.items,
      metadata: {
        parser: 'deterministic-table',
        confidence: tableResult.confidence,
        warnings: [...(input.extractionWarnings ?? []), ...aiColumnWarnings, ...tableResult.warnings],
        skippedRows: tableResult.skippedRows,
        importedColumns: tableResult.importedColumns,
        columnRoles: tableResult.columnRoles,
        columnRoleSource: aiColumnDecisions?.length ? 'ai' : 'deterministic',
      },
    }
  }

  const headerlessTableResult = deterministicHeaderlessTableImport(normalizedText, input.category)
  if (headerlessTableResult.items.length > 0 && headerlessTableResult.confidence >= 0.7) {
    return {
      items: headerlessTableResult.items,
      metadata: {
        parser: 'deterministic-headerless-table',
        confidence: headerlessTableResult.confidence,
        warnings: [...(input.extractionWarnings ?? []), ...aiColumnWarnings, ...headerlessTableResult.warnings],
        skippedRows: headerlessTableResult.skippedRows,
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
        warnings: [...(input.extractionWarnings ?? []), ...aiColumnWarnings, ...lineResult.warnings],
        skippedRows: lineResult.skippedRows,
      },
    }
  }

  try {
    const aiResult = await aiLineItemImport(input, normalizedText)
    if (aiResult && aiResult.items.length > 0) {
      return {
        items: aiResult.items,
        metadata: {
          parser: 'ai-table',
          confidence: aiResult.confidence,
          warnings: [...(input.extractionWarnings ?? []), ...aiColumnWarnings, ...aiResult.warnings],
          skippedRows: aiResult.skippedRows,
        },
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI import failed.'
    const bestDeterministic = [tableResult, headerlessTableResult, lineResult]
      .sort((a, b) => b.items.length - a.items.length || b.confidence - a.confidence)[0]
    if (bestDeterministic.items.length > 0) {
      bestDeterministic.warnings.push({ message: `${message} Falling back to deterministic import.` })
    }
  }

  const bestFallback = [tableResult, headerlessTableResult, lineResult]
    .sort((a, b) => b.items.length - a.items.length || b.confidence - a.confidence)[0]
  if (bestFallback.items.length > 0) {
    return {
      items: bestFallback.items,
      metadata: {
        parser: bestFallback === tableResult
          ? 'deterministic-table'
          : bestFallback === headerlessTableResult
            ? 'deterministic-headerless-table'
            : 'deterministic-lines',
        confidence: bestFallback.confidence,
        warnings: [
          ...(input.extractionWarnings ?? []),
          ...aiColumnWarnings,
          ...bestFallback.warnings,
          { message: 'Imported with low confidence. Review quantities, units, and specs before publishing.' },
        ],
        skippedRows: bestFallback.skippedRows,
        importedColumns: bestFallback.importedColumns,
        columnRoles: bestFallback.columnRoles,
        columnRoleSource: bestFallback === tableResult && aiColumnDecisions?.length ? 'ai' : 'deterministic',
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
