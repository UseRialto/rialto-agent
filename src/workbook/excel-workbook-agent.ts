import ExcelJS from 'exceljs'

export type WorkbookCellValue = string | number | boolean | null

export interface WorkbookColumnSchema {
  key: string
  label: string
  index: number
  role: 'line-item' | 'quantity' | 'unit' | 'vendor-price' | 'vendor-lead-time' | 'vendor-quote-type' | 'vendor-notes' | 'other'
  vendorName?: string
}

export interface WorkbookSheetSchema {
  name: string
  rowCount: number
  columnCount: number
  headerRow: number
  columns: WorkbookColumnSchema[]
}

export interface WorkbookContext {
  workbookId: string
  filename: string
  sheets: WorkbookSheetSchema[]
  auditLog: WorkbookAuditEntry[]
  history: WorkbookVersion[]
  workbook: ExcelJS.Workbook
}

export interface WorkbookAuditEntry {
  id: string
  action: string
  summary: string
  at: string
  details?: unknown
}

export interface WorkbookVersion {
  versionId: string
  summary: string
  at: string
  buffer: Buffer<ArrayBufferLike>
}

export interface RangeReadResult {
  sheet: string
  range: string
  values: WorkbookCellValue[][]
}

export interface QuoteComparisonResult {
  sheet: string
  itemColumn: string
  vendorPriceColumns: Array<{ vendorName: string; columnKey: string; label: string }>
  rows: Array<{
    rowNumber: number
    item: string
    lowestVendor?: string
    lowestValue?: number
    missingVendors: string[]
    excludedVendors: string[]
  }>
  partialVendors: Array<{ vendorName: string; missingCount: number; missingItems: string[] }>
}

export type WorkbookPatchOperation =
  | { op: 'add_column'; sheet: string; after: string; name: string; key?: string }
  | { op: 'set_cell'; sheet: string; row: number; column: string; value: WorkbookCellValue; note?: string }
  | { op: 'set_formula_range'; sheet: string; range: string; formula: string }
  | { op: 'highlight_cells'; sheet: string; cells: string[]; color: 'yellow' | 'green' | 'red' | 'orange' | 'blue' }
  | { op: 'create_summary_sheet'; sheet: string; rows: WorkbookCellValue[][] }

export interface WorkbookPatch {
  patch_id: string
  summary: string
  risk_level: 'safe' | 'medium' | 'destructive'
  requires_approval: boolean
  operations: WorkbookPatchOperation[]
  preview: {
    changed_cells: number
    sample_before_after: Array<{ sheet: string; cell: string; before: WorkbookCellValue; after: WorkbookCellValue }>
    warnings: string[]
  }
}

export interface PatchApplyResult {
  patchId: string
  versionId: string
  auditEntryId: string
  verification: PatchVerification
}

export interface PatchVerification {
  ok: boolean
  rowCountStable: boolean
  noUnintendedOverwrites: boolean
  checkedOperations: number
  warnings: string[]
}

export async function ingestWorkbook(input: { filename: string; buffer: Buffer<ArrayBufferLike>; workbookId?: string }): Promise<WorkbookContext> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(input.buffer as never)
  const context: WorkbookContext = {
    workbookId: input.workbookId ?? `wb-${Date.now()}`,
    filename: input.filename,
    workbook,
    sheets: extractWorkbookSchema(workbook),
    auditLog: [],
    history: [],
  }
  context.history.push(await snapshotVersion(context, 'Initial workbook ingestion.'))
  audit(context, 'ingest_workbook', `Ingested ${input.filename}.`, { sheets: context.sheets.map((sheet) => sheet.name) })
  return context
}

export function extractWorkbookSchema(workbook: ExcelJS.Workbook): WorkbookSheetSchema[] {
  return workbook.worksheets.map((sheet) => {
    const headerRow = findHeaderRow(sheet)
    const headers = sheet.getRow(headerRow)
    const columns: WorkbookColumnSchema[] = []
    for (let index = 1; index <= sheet.actualColumnCount; index += 1) {
      const label = cellText(headers.getCell(index).value) || `Column ${index}`
      columns.push({
        key: stableKey(label, index),
        label,
        index,
        role: inferColumnRole(label),
        vendorName: inferVendorName(label),
      })
    }
    return {
      name: sheet.name,
      rowCount: sheet.actualRowCount,
      columnCount: sheet.actualColumnCount,
      headerRow,
      columns,
    }
  })
}

export function readRange(context: WorkbookContext, sheetName: string, range: string): RangeReadResult {
  const sheet = requiredSheet(context, sheetName)
  const [start, end] = range.split(':')
  const startCell = sheet.getCell(start)
  const endCell = end ? sheet.getCell(end) : startCell
  const values: WorkbookCellValue[][] = []
  for (let row = startCell.row; row <= endCell.row; row += 1) {
    const rowValues: WorkbookCellValue[] = []
    for (let col = Number(startCell.col); col <= Number(endCell.col); col += 1) {
      rowValues.push(normalizeCellValue(sheet.getCell(row, col).value))
    }
    values.push(rowValues)
  }
  audit(context, 'read_range', `Read ${sheetName}!${range}.`)
  return { sheet: sheetName, range, values }
}

export function compareVendorsByLineItem(context: WorkbookContext, sheetName: string): QuoteComparisonResult {
  const schema = requiredSheetSchema(context, sheetName)
  const sheet = requiredSheet(context, sheetName)
  const itemColumn = schema.columns.find((column) => column.role === 'line-item') ?? schema.columns[0]
  const priceColumns = schema.columns.filter((column) => column.role === 'vendor-price')
  const rows: QuoteComparisonResult['rows'] = []
  const missingByVendor = new Map<string, string[]>()

  for (let rowNumber = schema.headerRow + 1; rowNumber <= sheet.actualRowCount; rowNumber += 1) {
    const item = cellText(sheet.getCell(rowNumber, itemColumn.index).value)
    if (!item || isTotalPackageRow(item)) continue
    const candidates: Array<{ vendorName: string; value: number }> = []
    const missingVendors: string[] = []
    const excludedVendors: string[] = []
    for (const column of priceColumns) {
      const vendorName = column.vendorName ?? column.label
      const raw = sheet.getCell(rowNumber, column.index).value
      if (isNoQuoteValue(raw)) {
        missingVendors.push(vendorName)
        missingByVendor.set(vendorName, [...(missingByVendor.get(vendorName) ?? []), item])
        continue
      }
      const value = parseCurrency(raw)
      if (value == null) {
        excludedVendors.push(vendorName)
        continue
      }
      candidates.push({ vendorName, value })
    }
    const lowest = candidates.sort((a, b) => a.value - b.value)[0]
    rows.push({
      rowNumber,
      item,
      lowestVendor: lowest?.vendorName,
      lowestValue: lowest?.value,
      missingVendors,
      excludedVendors,
    })
  }

  audit(context, 'compare_vendors_by_line_item', `Compared ${rows.length} line item row${rows.length === 1 ? '' : 's'} on ${sheetName}.`)
  return {
    sheet: sheetName,
    itemColumn: itemColumn.label,
    vendorPriceColumns: priceColumns.map((column) => ({ vendorName: column.vendorName ?? column.label, columnKey: column.key, label: column.label })),
    rows,
    partialVendors: Array.from(missingByVendor.entries()).map(([vendorName, missingItems]) => ({
      vendorName,
      missingCount: missingItems.length,
      missingItems,
    })),
  }
}

export function createConvertedQuantityPatch(context: WorkbookContext, input: {
  sheet: string
  sourceColumnLabel?: string
  newColumnName: string
  divisor: number
}): WorkbookPatch {
  const schema = requiredSheetSchema(context, input.sheet)
  const source = findColumn(schema, input.sourceColumnLabel ?? 'Qty') ?? schema.columns.find((column) => column.role === 'quantity')
  if (!source) throw new Error(`Could not find quantity column on ${input.sheet}.`)
  const operations: WorkbookPatchOperation[] = [{ op: 'add_column', sheet: input.sheet, after: source.label, name: input.newColumnName }]
  const sheet = requiredSheet(context, input.sheet)
  for (let rowNumber = schema.headerRow + 1; rowNumber <= sheet.actualRowCount; rowNumber += 1) {
    const quantity = parseLeadingNumber(sheet.getCell(rowNumber, source.index).value)
    if (quantity == null) continue
    operations.push({ op: 'set_cell', sheet: input.sheet, row: rowNumber, column: input.newColumnName, value: round(quantity / input.divisor) })
  }
  return previewPatch(context, {
    patch_id: `patch-${Date.now()}`,
    summary: `Add ${input.newColumnName} converted from ${source.label}.`,
    risk_level: 'safe',
    requires_approval: false,
    operations,
    preview: { changed_cells: 0, sample_before_after: [], warnings: [] },
  })
}

export function createCheapestValidHighlightPatch(context: WorkbookContext, sheetName: string): WorkbookPatch {
  const analysis = compareVendorsByLineItem(context, sheetName)
  const schema = requiredSheetSchema(context, sheetName)
  const cells: string[] = []
  for (const row of analysis.rows) {
    if (!row.lowestVendor) continue
    const column = schema.columns.find((candidate) => candidate.vendorName === row.lowestVendor && candidate.role === 'vendor-price')
    if (column) cells.push(`${columnLetter(column.index)}${row.rowNumber}`)
  }
  return previewPatch(context, {
    patch_id: `patch-${Date.now()}`,
    summary: `Highlight ${cells.length} cheapest valid vendor price cell${cells.length === 1 ? '' : 's'}.`,
    risk_level: 'safe',
    requires_approval: false,
    operations: [{ op: 'highlight_cells', sheet: sheetName, cells, color: 'green' }],
    preview: { changed_cells: 0, sample_before_after: [], warnings: [] },
  })
}

export function previewPatch(context: WorkbookContext, patch: WorkbookPatch): WorkbookPatch {
  const warnings: string[] = []
  const samples: WorkbookPatch['preview']['sample_before_after'] = []
  const addedColumns = new Map<string, Map<string, number>>()
  let changedCells = 0

  for (const operation of patch.operations) {
    if (operation.op === 'add_column') {
      const schema = requiredSheetSchema(context, operation.sheet)
      if (findColumn(schema, operation.name)) warnings.push(`Column ${operation.name} already exists on ${operation.sheet}.`)
      const afterIndex = columnIndexByLabel(context, operation.sheet, operation.after)
      const sheetAddedColumns = addedColumns.get(operation.sheet) ?? new Map<string, number>()
      sheetAddedColumns.set(normalizeLabel(operation.name), afterIndex + 1 + sheetAddedColumns.size)
      addedColumns.set(operation.sheet, sheetAddedColumns)
      changedCells += 1
    } else if (operation.op === 'set_cell') {
      const sheet = requiredSheet(context, operation.sheet)
      const addedColumnIndex = addedColumns.get(operation.sheet)?.get(normalizeLabel(operation.column))
      const col = columnIndexByLabelWithAdded(context, addedColumns, operation.sheet, operation.column)
      const cell = sheet.getCell(operation.row, col)
      const before = addedColumnIndex ? null : normalizeCellValue(cell.value)
      if (before !== null && before !== '' && before !== operation.value) warnings.push(`Would overwrite ${operation.sheet}!${columnLetter(col)}${operation.row}.`)
      if (samples.length < 5) samples.push({ sheet: operation.sheet, cell: `${columnLetter(col)}${operation.row}`, before, after: operation.value })
      changedCells += 1
    } else if (operation.op === 'set_formula_range') {
      changedCells += countRangeCells(operation.range)
      patch.requires_approval = true
      if (patch.risk_level === 'safe') patch.risk_level = 'medium'
    } else if (operation.op === 'highlight_cells') {
      changedCells += operation.cells.length
    } else if (operation.op === 'create_summary_sheet') {
      if (context.workbook.getWorksheet(operation.sheet)) warnings.push(`Sheet ${operation.sheet} already exists and would be overwritten.`)
      changedCells += operation.rows.flat().length
    }
  }
  const risky = warnings.some((warning) => warning.includes('overwrite')) || patch.operations.some((operation) => operation.op === 'create_summary_sheet')
  return {
    ...patch,
    requires_approval: patch.requires_approval || risky,
    risk_level: risky && patch.risk_level === 'safe' ? 'medium' : patch.risk_level,
    preview: { changed_cells: changedCells, sample_before_after: samples, warnings },
  }
}

export async function applyPatch(context: WorkbookContext, patch: WorkbookPatch): Promise<PatchApplyResult> {
  const beforeRowCounts = new Map(context.workbook.worksheets.map((sheet) => [sheet.name, sheet.actualRowCount]))
  const overwriteWarnings = patch.preview.warnings.filter((warning) => warning.includes('overwrite'))
  for (const operation of patch.operations) applyOperation(context, operation)
  context.sheets = extractWorkbookSchema(context.workbook)
  const verification = verifyPatch(context, patch, beforeRowCounts, overwriteWarnings)
  const version = await snapshotVersion(context, `Applied patch ${patch.patch_id}: ${patch.summary}`)
  context.history.push(version)
  const entry = audit(context, 'apply_patch', patch.summary, { patchId: patch.patch_id, verification })
  return { patchId: patch.patch_id, versionId: version.versionId, auditEntryId: entry.id, verification }
}

export async function rollbackPatch(context: WorkbookContext, versionId: string): Promise<void> {
  const version = context.history.find((candidate) => candidate.versionId === versionId)
  if (!version) throw new Error(`Unknown workbook version ${versionId}.`)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(version.buffer as never)
  context.workbook = workbook
  context.sheets = extractWorkbookSchema(workbook)
  context.history.push(await snapshotVersion(context, `Rollback to ${versionId}.`))
  audit(context, 'rollback_patch', `Rolled back workbook to ${versionId}.`)
}

export function verifyPatch(
  context: WorkbookContext,
  patch: WorkbookPatch,
  beforeRowCounts: Map<string, number> = new Map(),
  overwriteWarnings: string[] = patch.preview.warnings.filter((warning) => warning.includes('overwrite')),
): PatchVerification {
  const rowCountStable = Array.from(beforeRowCounts.entries()).every(([sheetName, count]) => requiredSheet(context, sheetName).actualRowCount === count)
  return {
    ok: rowCountStable && overwriteWarnings.length === 0,
    rowCountStable,
    noUnintendedOverwrites: overwriteWarnings.length === 0,
    checkedOperations: patch.operations.length,
    warnings: [...patch.preview.warnings],
  }
}

function applyOperation(context: WorkbookContext, operation: WorkbookPatchOperation) {
  if (operation.op === 'add_column') {
    const sheet = requiredSheet(context, operation.sheet)
    const afterIndex = columnIndexByLabel(context, operation.sheet, operation.after)
    sheet.spliceColumns(afterIndex + 1, 0, [])
    sheet.getCell(requiredSheetSchema(context, operation.sheet).headerRow, afterIndex + 1).value = operation.name
    context.sheets = extractWorkbookSchema(context.workbook)
    return
  }
  if (operation.op === 'set_cell') {
    const sheet = requiredSheet(context, operation.sheet)
    sheet.getCell(operation.row, columnIndexByLabel(context, operation.sheet, operation.column)).value = operation.value
    return
  }
  if (operation.op === 'set_formula_range') {
    const sheet = requiredSheet(context, operation.sheet)
    const [start, end] = operation.range.split(':')
    const startCell = sheet.getCell(start)
    const endCell = end ? sheet.getCell(end) : startCell
    for (let row = startCell.row; row <= endCell.row; row += 1) {
      for (let col = Number(startCell.col); col <= Number(endCell.col); col += 1) sheet.getCell(row, col).value = { formula: operation.formula }
    }
    return
  }
  if (operation.op === 'highlight_cells') {
    const sheet = requiredSheet(context, operation.sheet)
    for (const address of operation.cells) sheet.getCell(address).fill = solidFill(operation.color)
    return
  }
  if (operation.op === 'create_summary_sheet') {
    const existing = context.workbook.getWorksheet(operation.sheet)
    if (existing) context.workbook.removeWorksheet(existing.id)
    const sheet = context.workbook.addWorksheet(operation.sheet)
    operation.rows.forEach((row) => sheet.addRow(row))
  }
}

function requiredSheet(context: WorkbookContext, sheetName: string) {
  const sheet = context.workbook.getWorksheet(sheetName)
  if (!sheet) throw new Error(`Unknown worksheet ${sheetName}.`)
  return sheet
}

function requiredSheetSchema(context: WorkbookContext, sheetName: string) {
  const schema = context.sheets.find((sheet) => sheet.name === sheetName)
  if (!schema) throw new Error(`Unknown worksheet schema ${sheetName}.`)
  return schema
}

function findColumn(schema: WorkbookSheetSchema, label: string) {
  const normalized = normalizeLabel(label)
  return schema.columns.find((column) => normalizeLabel(column.label) === normalized || normalizeLabel(column.key) === normalized)
}

function columnIndexByLabel(context: WorkbookContext, sheetName: string, label: string) {
  const column = findColumn(requiredSheetSchema(context, sheetName), label)
  if (!column) throw new Error(`Unknown column ${label} on ${sheetName}.`)
  return column.index
}

function columnIndexByLabelWithAdded(
  context: WorkbookContext,
  addedColumns: Map<string, Map<string, number>>,
  sheetName: string,
  label: string,
) {
  const addedColumn = addedColumns.get(sheetName)?.get(normalizeLabel(label))
  if (addedColumn) return addedColumn
  const schemaColumn = findColumn(requiredSheetSchema(context, sheetName), label)
  if (schemaColumn) return schemaColumn.index
  throw new Error(`Unknown column ${label} on ${sheetName}.`)
}

function findHeaderRow(sheet: ExcelJS.Worksheet) {
  let best = 1
  let bestFilled = 0
  for (let rowNumber = 1; rowNumber <= Math.min(sheet.actualRowCount, 10); rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    let filled = 0
    row.eachCell((cell) => {
      if (cellText(cell.value)) filled += 1
    })
    if (filled > bestFilled) {
      best = rowNumber
      bestFilled = filled
    }
  }
  return best
}

function inferColumnRole(label: string): WorkbookColumnSchema['role'] {
  const lower = label.toLowerCase()
  if (/\b(item|description|material)\b/.test(lower)) return 'line-item'
  if (/\b(qty|quantity)\b/.test(lower)) return 'quantity'
  if (/\bunit\b/.test(lower)) return 'unit'
  if (/\b(lead|eta)\b/.test(lower)) return 'vendor-lead-time'
  if (/\b(type|quote type)\b/.test(lower)) return 'vendor-quote-type'
  if (/\b(note|exclusion|term)\b/.test(lower)) return 'vendor-notes'
  if (/\b(price|quote|cost|total)\b/.test(lower)) return 'vendor-price'
  return 'other'
}

function inferVendorName(label: string) {
  if (!/\b(price|quote|cost|total|lead|eta|exclusion|note|type)\b/i.test(label)) return undefined
  return label.replace(/\b(unit price|price|quote|cost|total|lead time|lead|eta|exclusions?|notes?|quote type|type)\b/ig, '').trim() || undefined
}

function cellText(value: unknown) {
  const normalized = normalizeCellValue(value as ExcelJS.CellValue | undefined)
  return normalized == null ? '' : String(normalized).trim()
}

function normalizeCellValue(value: ExcelJS.CellValue | undefined): WorkbookCellValue {
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object' && 'result' in value) return normalizeCellValue(value.result as ExcelJS.CellValue)
  if (typeof value === 'object' && 'text' in value) return String(value.text)
  if (typeof value === 'object' && 'richText' in value) return value.richText.map((part) => part.text).join('')
  return String(value)
}

function parseCurrency(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const lower = value.trim().toLowerCase()
  if (!lower || /^(?:n\/a|na|tbd|included|no bid|-)$/.test(lower)) return null
  const multiplier = lower.endsWith('k') ? 1000 : 1
  const parsed = Number(lower.replace(/usd|\$|,|\s|k$/g, ''))
  return Number.isFinite(parsed) ? parsed * multiplier : null
}

function parseLeadingNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}

function isNoQuoteValue(value: unknown) {
  const text = cellText(value).toLowerCase()
  return !text || /^(?:n\/a|na|tbd|no bid|-)$/.test(text)
}

function isTotalPackageRow(item: string) {
  return /\b(total|lump sum|package)\b/i.test(item)
}

function stableKey(label: string, index: number) {
  return `${normalizeLabel(label) || 'column'}-${index}`
}

function normalizeLabel(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
}

function columnLetter(index: number) {
  let result = ''
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(((n - 1) % 26) + 65) + result
  return result
}

function countRangeCells(range: string) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('tmp')
  const [start, end] = range.split(':')
  const startCell = sheet.getCell(start)
  const endCell = end ? sheet.getCell(end) : startCell
  const startCol = Number(startCell.col)
  const endCol = Number(endCell.col)
  return (Number(endCell.row) - Number(startCell.row) + 1) * (endCol - startCol + 1)
}

function solidFill(color: string): ExcelJS.Fill {
  const argb = {
    yellow: 'FFFFFF00',
    green: 'FF92D050',
    red: 'FFFF0000',
    orange: 'FFFFC000',
    blue: 'FF00B0F0',
  }[color] ?? 'FFFFFF00'
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

async function snapshotVersion(context: WorkbookContext, summary: string): Promise<WorkbookVersion> {
  const buffer = Buffer.from(await context.workbook.xlsx.writeBuffer())
  return { versionId: `version-${context.history.length + 1}-${Date.now()}`, summary, at: new Date().toISOString(), buffer }
}

function audit(context: WorkbookContext, action: string, summary: string, details?: unknown): WorkbookAuditEntry {
  const entry = { id: `audit-${context.auditLog.length + 1}-${Date.now()}`, action, summary, at: new Date().toISOString(), details }
  context.auditLog.push(entry)
  return entry
}
