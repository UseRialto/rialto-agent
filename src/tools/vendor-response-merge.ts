import type {
  ComparisonOperation,
  ComparisonPatchFragment,
  ComparisonProvenanceNote,
  SpreadsheetVerificationReport,
} from '../domain/types.js'
import { type WorkbookCellValue, type WorkbookModel, type WorkbookSheet, type WorkbookTable } from './workbook-agent.js'

export interface ExtractedVendorResponse {
  sourceWorkbookId: string
  vendorName: string | null
  confidence: number
  lineItems: ExtractedVendorLineItem[]
  totals: ExtractedQuoteTotal[]
  notes: string[]
  warnings: string[]
}

export interface ExtractedVendorLineItem {
  sourceSheet: string
  sourceRow: number
  itemCode?: string
  description: string
  qty?: number
  unit?: string
  unitPrice?: number
  totalPrice?: number
  leadTime?: string
  exclusions?: string
  alternate?: string
  confidence: number
  provenance: {
    cells: string[]
    rawValues: Record<string, unknown>
  }
}

export interface ExtractedQuoteTotal {
  sourceSheet: string
  sourceRow: number
  label: string
  value?: number
}

export interface LineItemMatch {
  targetRowId: string
  targetDescription: string
  sourceRow: number
  sourceDescription: string
  confidence: number
  matchBasis: Array<'item_code' | 'description_exact' | 'description_fuzzy' | 'quantity_unit' | 'manual_hint'>
  warnings: string[]
}

export interface VendorMergeDecisionReport {
  matches: LineItemMatch[]
  ambiguousMatches: Array<{ sourceRow: number; sourceDescription: string; candidates: LineItemMatch[] }>
  unmatchedSourceRows: ExtractedVendorLineItem[]
  unquotedTargetRows: Array<{ rowId: string; description: string }>
  conflicts: Array<{ rowKey: string; colKey: string; existingValue: unknown; incomingValue: unknown }>
  warnings: string[]
}

export interface ComparisonSnapshotLike {
  columns?: Array<{ key?: string; label?: string; vendorId?: string; vendorName?: string; metric?: string }>
  rows?: Array<{ id?: string; description?: string; values?: Record<string, unknown> }>
  vendors?: Array<{ id?: string; name?: string }>
}

export interface VendorMergePatchResult {
  fragment: ComparisonPatchFragment
  verification: SpreadsheetVerificationReport
  report: VendorMergeDecisionReport
}

type SourceColumnRole = 'item_code' | 'description' | 'qty' | 'unit' | 'unit_price' | 'total_price' | 'lead_time' | 'exclusions' | 'alternate' | 'notes'

export function extractVendorResponseFromWorkbook(input: {
  workbook: WorkbookModel
  vendorNameHint?: string
  filename?: string
}): ExtractedVendorResponse {
  const warnings: string[] = []
  const sheet = input.workbook.sheets.find((candidate) => candidate.tables.length > 0) ?? input.workbook.sheets[0]
  if (!sheet) {
    return {
      sourceWorkbookId: input.workbook.id,
      vendorName: input.vendorNameHint ?? null,
      confidence: input.vendorNameHint ? 0.95 : 0,
      lineItems: [],
      totals: [],
      notes: [],
      warnings: ['No worksheets were found in the uploaded workbook.'],
    }
  }
  const table = sheet.tables[0]
  if (!table) {
    return {
      sourceWorkbookId: input.workbook.id,
      vendorName: input.vendorNameHint ?? vendorNameFromFilename(input.filename) ?? null,
      confidence: input.vendorNameHint ? 0.95 : 0.4,
      lineItems: [],
      totals: [],
      notes: [],
      warnings: [`No table-like range was detected on ${sheet.name}.`],
    }
  }

  const vendorName = input.vendorNameHint ?? inferVendorIdentity(sheet, table) ?? vendorNameFromFilename(input.filename)
  const confidence = input.vendorNameHint ? 0.95 : vendorName ? 0.72 : 0
  const roleByIndex = inferSourceColumns(table)
  const lineItems: ExtractedVendorLineItem[] = []
  const totals: ExtractedQuoteTotal[] = []
  const notes: string[] = []

  for (let rowIndex = table.dataStartRowIndex; rowIndex <= table.dataEndRowIndex; rowIndex += 1) {
    const row = sheet.rows[rowIndex] ?? []
    const rawValues = Object.fromEntries(row.map((value, index) => [table.columns[index]?.label ?? columnName(index), value]))
    const description = text(valueForRole(row, roleByIndex, 'description')) || text(valueForRole(row, roleByIndex, 'item_code'))
    const joined = row.map((value) => text(value)).filter(Boolean).join(' ')
    if (!joined.trim()) continue
    const total = parseNumber(valueForRole(row, roleByIndex, 'total_price')) ?? parseNumber(valueForRole(row, roleByIndex, 'unit_price'))
    if (isTotalPackageText(joined)) {
      totals.push({ sourceSheet: sheet.name, sourceRow: rowIndex + 1, label: description || joined, value: total ?? undefined })
      continue
    }
    if (!description) {
      notes.push(joined)
      continue
    }
    lineItems.push({
      sourceSheet: sheet.name,
      sourceRow: rowIndex + 1,
      itemCode: text(valueForRole(row, roleByIndex, 'item_code')) || undefined,
      description,
      qty: parseNumber(valueForRole(row, roleByIndex, 'qty')) ?? undefined,
      unit: text(valueForRole(row, roleByIndex, 'unit')) || undefined,
      unitPrice: parseNumber(valueForRole(row, roleByIndex, 'unit_price')) ?? undefined,
      totalPrice: parseNumber(valueForRole(row, roleByIndex, 'total_price')) ?? undefined,
      leadTime: text(valueForRole(row, roleByIndex, 'lead_time')) || undefined,
      exclusions: text(valueForRole(row, roleByIndex, 'exclusions')) || undefined,
      alternate: text(valueForRole(row, roleByIndex, 'alternate')) || undefined,
      confidence: 0.86,
      provenance: {
        cells: row.map((_value, index) => `${sheet.name}!${columnName(index)}${rowIndex + 1}`),
        rawValues,
      },
    })
  }

  if (!vendorName) warnings.push('Vendor identity was not confidently detected from the uploaded workbook.')
  if (totals.length) warnings.push(`${totals.length} total/package row${totals.length === 1 ? '' : 's'} excluded from line-item matching.`)
  if (lineItems.length === 0) warnings.push('No quote line items were extracted from the uploaded workbook.')

  return {
    sourceWorkbookId: input.workbook.id,
    vendorName: vendorName ?? null,
    confidence,
    lineItems,
    totals,
    notes,
    warnings,
  }
}

export function matchVendorRowsToComparisonItems(input: {
  snapshot: ComparisonSnapshotLike
  response: ExtractedVendorResponse
}): VendorMergeDecisionReport {
  const targets = targetRows(input.snapshot)
  const matches: LineItemMatch[] = []
  const ambiguousMatches: VendorMergeDecisionReport['ambiguousMatches'] = []
  const unmatchedSourceRows: ExtractedVendorLineItem[] = []
  const usedTargets = new Set<string>()

  for (const item of input.response.lineItems) {
    const candidates = targets
      .map((target) => scoreLineItemMatch(item, target))
      .filter((candidate) => candidate.confidence >= 0.62)
      .sort((a, b) => b.confidence - a.confidence)
    const [best, second] = candidates
    if (!best) {
      unmatchedSourceRows.push(item)
      continue
    }
    if (second && Math.abs(best.confidence - second.confidence) < 0.08) {
      ambiguousMatches.push({ sourceRow: item.sourceRow, sourceDescription: item.description, candidates: candidates.slice(0, 3) })
      continue
    }
    matches.push(best)
    usedTargets.add(best.targetRowId)
  }

  return {
    matches,
    ambiguousMatches,
    unmatchedSourceRows,
    unquotedTargetRows: targets
      .filter((target) => !usedTargets.has(target.rowId))
      .map((target) => ({ rowId: target.rowId, description: target.description })),
    conflicts: [],
    warnings: [
      ...input.response.warnings,
      ...(ambiguousMatches.length ? [`${ambiguousMatches.length} uploaded row${ambiguousMatches.length === 1 ? '' : 's'} had ambiguous matches.`] : []),
      ...(unmatchedSourceRows.length ? [`${unmatchedSourceRows.length} uploaded row${unmatchedSourceRows.length === 1 ? '' : 's'} did not match current comparison items.`] : []),
    ],
  }
}

export function createVendorMergePatch(input: {
  snapshot: ComparisonSnapshotLike
  response: ExtractedVendorResponse
  report: VendorMergeDecisionReport
}): VendorMergePatchResult {
  const vendorName = input.response.vendorName ?? 'Uploaded Vendor'
  const targetColumns = vendorColumns(input.snapshot, vendorName)
  const operations: ComparisonOperation[] = []
  const provenanceNotes: ComparisonProvenanceNote[] = []
  const warnings = [...input.report.warnings]
  const insertedColumns = new Set<string>()
  let insertAfterColKey = vendorInsertionAnchor(input.snapshot, targetColumns)
  const metrics: Array<{ metric: 'unit_price' | 'total' | 'lead' | 'alternate'; label: string }> = [
    { metric: 'unit_price', label: `${vendorName} Unit Price` },
    { metric: 'total', label: `${vendorName} Total` },
    { metric: 'lead', label: `${vendorName} Lead Time` },
    { metric: 'alternate', label: `${vendorName} Alternate / Notes` },
  ]

  for (const metric of metrics) {
    const colKey = targetColumns[metric.metric] ?? vendorColumnKey(vendorName, metric.metric)
    if (!targetColumns[metric.metric] && !insertedColumns.has(colKey)) {
      operations.push({ kind: 'insert-column', colKey, label: metric.label, afterColKey: insertAfterColKey })
      insertedColumns.add(colKey)
      insertAfterColKey = colKey
    } else {
      insertAfterColKey = colKey
    }
  }

  const sourceByRow = new Map(input.response.lineItems.map((item) => [item.sourceRow, item]))
  const rows = new Map((input.snapshot.rows ?? []).map((row) => [String(row.id ?? ''), row]))
  for (const match of input.report.matches) {
    const source = sourceByRow.get(match.sourceRow)
    if (!source) continue
    const target = rows.get(match.targetRowId)
    const edits: Array<{ colKey: string; value: string | number }> = []
    if (source.unitPrice != null) edits.push({ colKey: targetColumns.unit_price ?? vendorColumnKey(vendorName, 'unit_price'), value: source.unitPrice })
    if (source.totalPrice != null) edits.push({ colKey: targetColumns.total ?? vendorColumnKey(vendorName, 'total'), value: source.totalPrice })
    if (source.leadTime) edits.push({ colKey: targetColumns.lead ?? vendorColumnKey(vendorName, 'lead'), value: source.leadTime })
    const noteParts = [source.alternate, source.exclusions].filter(Boolean)
    if (noteParts.length) edits.push({ colKey: targetColumns.alternate ?? vendorColumnKey(vendorName, 'alternate'), value: noteParts.join(' | ') })
    for (const edit of edits) {
      const existingValue = target?.values?.[edit.colKey]
      if (!isBlank(existingValue)) {
        input.report.conflicts.push({ rowKey: match.targetRowId, colKey: edit.colKey, existingValue, incomingValue: edit.value })
      }
      operations.push({
        kind: 'set-cell',
        rowKey: match.targetRowId,
        colKey: edit.colKey,
        value: edit.value,
        note: `From ${vendorName} workbook row ${source.sourceRow} (${Math.round(match.confidence * 100)}% match).`,
      })
      provenanceNotes.push({
        rowKey: match.targetRowId,
        colKey: edit.colKey,
        sourceId: input.response.sourceWorkbookId,
        note: `${source.sourceSheet} row ${source.sourceRow}; match ${Math.round(match.confidence * 100)}%; basis ${match.matchBasis.join(', ')}.`,
      })
    }
  }

  for (const item of input.report.unmatchedSourceRows) {
    operations.push({
      kind: 'add-highlight',
      id: `hl-unmatched-${input.response.sourceWorkbookId}-${item.sourceRow}`,
      selector: { kind: 'rule', rule: 'highest-coverage-overall' },
      color: 'yellow',
      note: `Uploaded ${vendorName} row ${item.sourceRow} did not match a comparison line item: ${item.description}.`,
    })
  }

  if (input.report.conflicts.length) warnings.push(`${input.report.conflicts.length} existing vendor cell${input.report.conflicts.length === 1 ? '' : 's'} would be overwritten and require estimator approval.`)

  const verification = verifyVendorMergePatch({
    operations,
    response: input.response,
    report: input.report,
    insertedColumns,
  })

  return {
    fragment: {
      summary: `Prepared ${vendorName} merge: ${input.report.matches.length} matched row${input.report.matches.length === 1 ? '' : 's'}, ${input.report.unmatchedSourceRows.length} unmatched uploaded row${input.report.unmatchedSourceRows.length === 1 ? '' : 's'}.`,
      operations,
      warnings,
      provenanceNotes,
    },
    verification,
    report: input.report,
  }
}

export function verifyVendorMergePatch(input: {
  operations: ComparisonOperation[]
  response: ExtractedVendorResponse
  report: VendorMergeDecisionReport
  insertedColumns: Set<string>
}): SpreadsheetVerificationReport {
  const setCells = input.operations.filter((operation) => operation.kind === 'set-cell')
  const checks = [
    { id: 'schema-valid', ok: input.operations.length > 0, message: input.operations.length > 0 ? 'Merge patch has visible operations.' : 'Merge patch has no visible operations.' },
    { id: 'matched-rows-only', ok: setCells.every((operation) => input.report.matches.some((match) => match.targetRowId === operation.rowKey)), message: 'Cell edits target matched comparison rows only.' },
    { id: 'added-columns-exist', ok: input.insertedColumns.size > 0 || setCells.length > 0, message: 'Vendor columns are added or existing vendor columns are reused.' },
    { id: 'unmatched-rows-reported', ok: input.report.unmatchedSourceRows.length === 0 || input.operations.some((operation) => operation.kind === 'add-highlight'), message: 'Unmatched uploaded rows are surfaced in the proposal.' },
    { id: 'conflicts-require-approval', ok: true, message: input.report.conflicts.length ? 'Conflicting existing values are kept in warnings for estimator approval.' : 'No conflicting existing values found.' },
    { id: 'total-package-rows-excluded', ok: input.response.totals.every((total) => !input.report.matches.some((match) => match.sourceRow === total.sourceRow)), message: 'Total/package rows are excluded from line-item matches.' },
  ]
  return {
    ok: checks.every((check) => check.ok),
    checks,
    warnings: [
      ...input.response.warnings,
      ...input.report.warnings,
      ...(input.report.conflicts.length ? [`${input.report.conflicts.length} overwrite conflict${input.report.conflicts.length === 1 ? '' : 's'} detected.`] : []),
    ],
  }
}

function inferSourceColumns(table: WorkbookTable): Map<SourceColumnRole, number> {
  const byRole = new Map<SourceColumnRole, number>()
  table.columns.forEach((column, index) => {
    const label = normalize(column.label)
    const role =
      /\b(item|sku|code|mark)\b/.test(label) ? 'item_code'
        : /\b(desc|description|material|product)\b/.test(label) ? 'description'
      : /\b(qty|quantity|requested qty)\b/.test(label) ? 'qty'
            : /\b(unit price|unit cost|price per unit|price unit|each)\b/.test(label) ? 'unit_price'
              : /\b(unit|uom|u m)\b/.test(label) ? 'unit'
                : /\b(total|extended|ext price|amount)\b/.test(label) ? 'total_price'
                  : /\b(lead|delivery|availability|eta)\b/.test(label) ? 'lead_time'
                    : /\b(exclusion|exclusions|exclude|scope|clarification|clarifications)\b/.test(label) ? 'exclusions'
                      : /\b(alternate|substitution|option)\b/.test(label) ? 'alternate'
                        : /\b(note|comment|remark)\b/.test(label) ? 'notes'
                          : undefined
    if (role && !byRole.has(role)) byRole.set(role, index)
  })
  if (!byRole.has('description')) {
    const fallback = table.columns.find((column) => column.semanticType === 'description') ?? table.columns[1] ?? table.columns[0]
    if (fallback) byRole.set('description', fallback.index)
  }
  return byRole
}

function valueForRole(row: WorkbookCellValue[], roleByIndex: Map<SourceColumnRole, number>, role: SourceColumnRole) {
  const index = roleByIndex.get(role)
  return index == null ? undefined : row[index]
}

function inferVendorIdentity(sheet: WorkbookSheet, table: WorkbookTable) {
  for (const row of sheet.rows.slice(0, table.headerRowIndex)) {
    for (let index = 0; index < row.length; index += 1) {
      const label = text(row[index])
      const adjacent = text(row[index + 1])
      if (/^(vendor|supplier|company)$/i.test(label) && adjacent) return adjacent
    }
  }
  const beforeTable = sheet.rows.slice(0, table.headerRowIndex).flat().map((value) => text(value)).filter(Boolean)
  const candidate = beforeTable.find((value) => /\b(vendor|supplier|quote from|company)\b/i.test(value))
  const match = candidate?.match(/(?:vendor|supplier|quote from|company)\s*:?\s*(.+)$/i)
  return match?.[1]?.trim()
}

function vendorNameFromFilename(filename?: string) {
  if (!filename) return undefined
  return filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\b(response|quote|bid|rfq)\b/gi, '').replace(/\s+/g, ' ').trim() || undefined
}

function scoreLineItemMatch(item: ExtractedVendorLineItem, target: { rowId: string; description: string; itemCode?: string; qty?: number; unit?: string }): LineItemMatch {
  const basis: LineItemMatch['matchBasis'] = []
  let score = 0
  if (item.itemCode && target.itemCode && normalize(item.itemCode) === normalize(target.itemCode)) {
    score += 0.55
    basis.push('item_code')
  }
  const sourceDescription = normalize(item.description)
  const targetDescription = normalize(target.description)
  if (sourceDescription && sourceDescription === targetDescription) {
    score += 0.5
    basis.push('description_exact')
  } else {
    const overlap = tokenOverlap(sourceDescription, targetDescription)
    if (overlap >= 0.45) {
      score += overlap * 0.42
      basis.push('description_fuzzy')
    }
  }
  if (item.qty != null && target.qty != null && Math.abs(item.qty - target.qty) <= Math.max(0.01, target.qty * 0.02)) {
    score += 0.12
    basis.push('quantity_unit')
  }
  if (item.unit && target.unit && normalize(item.unit) === normalize(target.unit) && !basis.includes('quantity_unit')) {
    score += 0.08
    basis.push('quantity_unit')
  }
  return {
    targetRowId: target.rowId,
    targetDescription: target.description,
    sourceRow: item.sourceRow,
    sourceDescription: item.description,
    confidence: Math.min(0.99, Math.round(score * 100) / 100),
    matchBasis: basis,
    warnings: [],
  }
}

function targetRows(snapshot: ComparisonSnapshotLike) {
  const columns = snapshot.columns ?? []
  const itemColumn = columns.find((column) => /\b(sku|code|product code)\b/i.test(`${column.key} ${column.label}`))
    ?? columns.find((column) => /\b(item|mark)\b/i.test(`${column.key} ${column.label}`))
  const qtyColumn = columns.find((column) => /\b(qty|quantity)\b/i.test(`${column.key} ${column.label}`))
  const unitColumn = columns.find((column) => /\b(unit|uom)\b/i.test(`${column.key} ${column.label}`))
  return (snapshot.rows ?? []).flatMap((row) => {
    const rowId = String(row.id ?? '')
    const description = String(row.description ?? '')
    if (!rowId || !description || isTotalPackageText(description)) return []
    return [{
      rowId,
      description,
      itemCode: itemColumn?.key ? text(row.values?.[itemColumn.key]) : undefined,
      qty: qtyColumn?.key ? parseNumber(row.values?.[qtyColumn.key]) ?? undefined : undefined,
      unit: unitColumn?.key ? text(row.values?.[unitColumn.key]) : undefined,
    }]
  })
}

function vendorColumns(snapshot: ComparisonSnapshotLike, vendorName: string) {
  const result: Partial<Record<'unit_price' | 'total' | 'lead' | 'alternate', string>> = {}
  for (const column of snapshot.columns ?? []) {
    const sameVendor = normalize(column.vendorName ?? '').includes(normalize(vendorName)) || normalize(column.label ?? '').includes(normalize(vendorName))
    if (!sameVendor || !column.key) continue
    if (column.metric === 'unit_price' || /\bunit\b.*\b(price|cost)\b/i.test(column.label ?? '')) result.unit_price = column.key
    else if (column.metric === 'total' || /\b(total|amount|extended)\b/i.test(column.label ?? '')) result.total = column.key
    else if (column.metric === 'lead' || /\blead|delivery|eta\b/i.test(column.label ?? '')) result.lead = column.key
    else if (column.metric === 'alternate' || /\balternate|note|exclusion\b/i.test(column.label ?? '')) result.alternate = column.key
  }
  return result
}

function vendorInsertionAnchor(snapshot: ComparisonSnapshotLike, existingVendorColumns: Partial<Record<'unit_price' | 'total' | 'lead' | 'alternate', string>>) {
  return existingVendorColumns.alternate
    ?? existingVendorColumns.lead
    ?? existingVendorColumns.total
    ?? existingVendorColumns.unit_price
    ?? snapshot.columns?.at(-1)?.key
}

function vendorColumnKey(vendorName: string, metric: 'unit_price' | 'total' | 'lead' | 'alternate') {
  return `vendor-${slug(vendorName)}:${metric}`
}

function text(value: unknown) {
  return value == null ? '' : String(value).trim()
}

function parseNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const match = text(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function tokenOverlap(a: string, b: string) {
  const left = new Set(a.split(/\s+/).filter((token) => token.length > 1))
  const right = new Set(b.split(/\s+/).filter((token) => token.length > 1))
  if (left.size === 0 || right.size === 0) return 0
  let shared = 0
  for (const token of left) if (right.has(token)) shared += 1
  return shared / Math.max(left.size, right.size)
}

function isBlank(value: unknown) {
  return value == null || String(value).trim() === ''
}

function isTotalPackageText(value: string) {
  return /\b(total quote|lump sum|package total|complete quote|project total|grand total)\b/i.test(value)
}

function columnName(index: number) {
  let number = index + 1
  let name = ''
  while (number > 0) {
    const remainder = (number - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    number = Math.floor((number - 1) / 26)
  }
  return name
}

function slug(value: string) {
  return normalize(value).replace(/\s+/g, '-')
}
