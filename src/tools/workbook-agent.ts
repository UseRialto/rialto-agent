export type WorkbookCellValue = string | number | boolean | null

export interface WorkbookModel {
  id: string
  sheets: WorkbookSheet[]
  versions: WorkbookVersion[]
  auditLog: WorkbookAuditEvent[]
}

export interface WorkbookSheet {
  id: string
  name: string
  rows: WorkbookCellValue[][]
  tables: WorkbookTable[]
}

export interface WorkbookTable {
  id: string
  sheetId: string
  name: string
  headerRowIndex: number
  dataStartRowIndex: number
  dataEndRowIndex: number
  columns: WorkbookColumnSchema[]
}

export interface WorkbookColumnSchema {
  key: string
  label: string
  index: number
  semanticType:
    | 'item'
    | 'description'
    | 'quantity'
    | 'unit'
    | 'vendor-price'
    | 'vendor-lead-time'
    | 'vendor-quote-type'
    | 'vendor-exclusion'
    | 'notes'
    | 'unknown'
  vendorName?: string
  valueType: 'number' | 'currency' | 'text' | 'blank' | 'mixed'
}

export interface WorkbookVersion {
  id: string
  createdAt: string
  summary: string
  workbook: WorkbookSnapshot
  sourcePatchId?: string
}

export interface WorkbookAuditEvent {
  id: string
  at: string
  actor: 'system' | 'agent' | 'user'
  action: string
  summary: string
  patchId?: string
  details?: unknown
}

export interface WorkbookSnapshot {
  sheets: Array<Omit<WorkbookSheet, 'tables'> & { tables: WorkbookTable[] }>
}

export type WorkbookPatchOperation =
  | { op: 'add_column'; sheet: string; after?: string; before?: string; name: string; values?: WorkbookCellValue[] }
  | { op: 'delete_column'; sheet: string; column: string }
  | { op: 'rename_column'; sheet: string; column: string; name: string }
  | { op: 'set_cell'; sheet: string; row: number; column: string; value: WorkbookCellValue }
  | { op: 'set_range_values'; sheet: string; column: string; startRow: number; values: WorkbookCellValue[] }
  | { op: 'set_range_formula'; sheet: string; column: string; startRow: number; formulas: string[] }
  | { op: 'highlight_cells'; sheet: string; cells: Array<{ row: number; column: string }>; color: string; note?: string }
  | { op: 'format_cells'; sheet: string; column: string; format: 'currency' | 'number' | 'text' }
  | { op: 'create_summary_sheet'; sheet: string; name: string; rows: WorkbookCellValue[][] }

export interface WorkbookPatch {
  patch_id: string
  summary: string
  risk_level: 'safe' | 'medium' | 'destructive'
  requires_approval: boolean
  operations: WorkbookPatchOperation[]
  preview: {
    changed_cells: number
    sample_before_after: Array<{
      sheet: string
      row?: number
      column?: string
      before?: WorkbookCellValue | Record<string, WorkbookCellValue>
      after?: WorkbookCellValue | Record<string, WorkbookCellValue>
    }>
    warnings: string[]
  }
  verification: WorkbookVerificationResult
}

export interface WorkbookVerificationResult {
  ok: boolean
  checks: Array<{ id: string; ok: boolean; message: string }>
}

export interface QuoteColumnGroup {
  vendorName: string
  priceColumn?: WorkbookColumnSchema
  leadTimeColumn?: WorkbookColumnSchema
  quoteTypeColumn?: WorkbookColumnSchema
  exclusionColumn?: WorkbookColumnSchema
}

export interface WorkbookAnomalyReport {
  missingQuotes: ReturnType<typeof detectMissingQuotes>
  priceOutliers: Array<{ row: number; item: string; vendorName: string; column: string; price: number; median: number; percentAboveMedian: number }>
  unitMismatches: Array<{ row: number; item: string; unit: WorkbookCellValue; expectedUnits: string[] }>
  totalQuoteRows: Array<{ row: number; item: string; classification: string }>
  ambiguousVendorColumns: Array<{ column: string; reason: string }>
}

export function ingestWorkbookFromSheets(input: {
  id: string
  sheets: Array<{ name: string; rows: WorkbookCellValue[][] }>
  now?: string
}): WorkbookModel {
  const workbook: WorkbookModel = {
    id: input.id,
    sheets: input.sheets.map((sheet, index) => {
      const id = slug(sheet.name) || `sheet-${index + 1}`
      const normalized = sheet.rows.map((row) => row.map(normalizeCell))
      const base = { id, name: sheet.name, rows: normalized, tables: [] as WorkbookTable[] }
      base.tables = detectTables(base)
      return base
    }),
    versions: [],
    auditLog: [],
  }
  appendVersion(workbook, 'ingested workbook', undefined, input.now)
  appendAudit(workbook, 'system', 'inspect_workbook', `Ingested ${workbook.sheets.length} sheet${workbook.sheets.length === 1 ? '' : 's'}.`, undefined, undefined, input.now)
  return workbook
}

export function workbookFromQuoteComparisonSnapshot(input: {
  id: string
  sheetName?: string
  snapshot: unknown
  now?: string
}): WorkbookModel {
  const record = asRecord(input.snapshot)
  const columns = asArray(record?.columns).map(asRecord).filter((value): value is Record<string, unknown> => Boolean(value))
  const rows = asArray(record?.rows).map(asRecord).filter((value): value is Record<string, unknown> => Boolean(value))
  const header = columns.map((column) => String(column.label ?? column.key ?? ''))
  const body = rows.map((row) => {
    const values = asRecord(row.values) ?? asRecord(row.cells) ?? {}
    return columns.map((column) => normalizeCell(values[String(column.key ?? column.id ?? '')]))
  })
  return ingestWorkbookFromSheets({
    id: input.id,
    sheets: [{ name: input.sheetName ?? 'Quote Comparison', rows: [header, ...body] }],
    now: input.now,
  })
}

export function getWorkbookOverview(workbook: WorkbookModel) {
  return {
    workbookId: workbook.id,
    sheetCount: workbook.sheets.length,
    sheets: workbook.sheets.map((sheet) => ({
      id: sheet.id,
      name: sheet.name,
      rowCount: sheet.rows.length,
      columnCount: Math.max(0, ...sheet.rows.map((row) => row.length)),
      tableCount: sheet.tables.length,
    })),
  }
}

export function listSheets(workbook: WorkbookModel) {
  return getWorkbookOverview(workbook).sheets
}

export function inspectSheet(workbook: WorkbookModel, sheetName: string) {
  const sheet = requireSheet(workbook, sheetName)
  return {
    id: sheet.id,
    name: sheet.name,
    rowCount: sheet.rows.length,
    columnCount: Math.max(0, ...sheet.rows.map((row) => row.length)),
    tables: sheet.tables,
    nonEmptyCells: sheet.rows.flat().filter((cell) => cell !== null && String(cell).trim() !== '').length,
  }
}

export function detectTables(sheet: Pick<WorkbookSheet, 'id' | 'name' | 'rows'>): WorkbookTable[] {
  const headerRowIndex = bestHeaderRowIndex(sheet.rows)
  if (headerRowIndex < 0) return []
  const header = sheet.rows[headerRowIndex]
  const dataStartRowIndex = headerRowIndex + 1
  let dataEndRowIndex = sheet.rows.length - 1
  for (let index = dataStartRowIndex; index < sheet.rows.length; index += 1) {
    const filled = sheet.rows[index]?.filter((cell) => cell !== null && String(cell).trim() !== '').length ?? 0
    if (filled === 0) {
      dataEndRowIndex = index - 1
      break
    }
  }
  const columns = header.map((label, index) => inferColumnSchema(String(label ?? `Column ${index + 1}`), index, sheet.rows.slice(dataStartRowIndex, dataEndRowIndex + 1)))
  return [{
    id: `${sheet.id}:table-1`,
    sheetId: sheet.id,
    name: `${sheet.name} Table`,
    headerRowIndex,
    dataStartRowIndex,
    dataEndRowIndex,
    columns,
  }]
}

function bestHeaderRowIndex(rows: WorkbookCellValue[][]) {
  let best = { index: -1, score: 0 }
  rows.forEach((row, index) => {
    const filled = row.filter((cell) => !isBlank(cell)).length
    if (filled < 2) return
    const normalized = row.map((cell) => normalizeText(String(cell ?? '')))
    const signals = normalized.filter((label) => (
      /\b(line|item|sku|code|mark)\b/.test(label)
      || /\b(desc|description|material|product)\b/.test(label)
      || /\b(qty|quantity|requested qty)\b/.test(label)
      || /\b(unit|uom|u m)\b/.test(label)
      || /\b(price|cost|each|total|extended|ext amount|amount)\b/.test(label)
      || /\b(lead|delivery|availability|eta)\b/.test(label)
      || /\b(exclusion|clarification|alternate|note|comment)\b/.test(label)
    )).length
    const score = signals * 5 + filled
    if (score > best.score) best = { index, score }
  })
  return best.index
}

export function getTableSchema(workbook: WorkbookModel, sheetName: string, tableId?: string) {
  const sheet = requireSheet(workbook, sheetName)
  const table = tableId ? sheet.tables.find((candidate) => candidate.id === tableId) : sheet.tables[0]
  if (!table) throw new Error(`No table found on sheet ${sheetName}.`)
  return table
}

export function findColumn(workbook: WorkbookModel, sheetName: string, query: string) {
  const table = getTableSchema(workbook, sheetName)
  const normalized = normalizeText(query)
  return table.columns
    .map((column) => ({
      column,
      score: normalizeText(column.label).includes(normalized)
        ? 2
        : normalizeText(column.key).includes(normalized) || normalizeText(column.semanticType).includes(normalized)
          ? 1
          : 0,
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((candidate) => candidate.column)
}

export function searchWorkbook(workbook: WorkbookModel, query: string) {
  const needle = normalizeText(query)
  const matches: Array<{ sheet: string; row: number; column: string; value: WorkbookCellValue }> = []
  for (const sheet of workbook.sheets) {
    const table = sheet.tables[0]
    for (let rowIndex = 0; rowIndex < sheet.rows.length; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < (sheet.rows[rowIndex]?.length ?? 0); columnIndex += 1) {
        const value = sheet.rows[rowIndex]?.[columnIndex] ?? null
        if (normalizeText(String(value ?? '')).includes(needle)) {
          matches.push({ sheet: sheet.name, row: rowIndex + 1, column: table?.columns[columnIndex]?.label ?? columnName(columnIndex), value })
        }
      }
    }
  }
  return matches
}

export function readRange(workbook: WorkbookModel, sheetName: string, range: string) {
  const sheet = requireSheet(workbook, sheetName)
  const parsed = parseRange(range)
  return sheet.rows.slice(parsed.startRow, parsed.endRow + 1).map((row) => row.slice(parsed.startCol, parsed.endCol + 1))
}

export function queryTable(workbook: WorkbookModel, input: {
  sheet: string
  select?: string[]
  where?: Array<{ column: string; op: '=' | '!=' | 'contains' | 'not_blank' | 'blank'; value?: WorkbookCellValue }>
  orderBy?: { column: string; direction: 'asc' | 'desc' }
  limit?: number
}) {
  const sheet = requireSheet(workbook, input.sheet)
  const table = sheet.tables[0]
  if (!table) return { rows: [], validation: verifyQueryResult([], input.limit) }
  const columns = table.columns
  let rows = tableRows(sheet, table)
  for (const clause of input.where ?? []) {
    const column = requireColumn(table, clause.column)
    rows = rows.filter((row) => {
      const value = row[column.label]
      if (clause.op === 'not_blank') return !isBlank(value)
      if (clause.op === 'blank') return isBlank(value)
      if (clause.op === 'contains') return normalizeText(String(value ?? '')).includes(normalizeText(String(clause.value ?? '')))
      if (clause.op === '=') return String(value ?? '') === String(clause.value ?? '')
      return String(value ?? '') !== String(clause.value ?? '')
    })
  }
  if (input.orderBy) {
    const column = requireColumn(table, input.orderBy.column)
    rows = [...rows].sort((a, b) => compareValues(a[column.label], b[column.label]) * (input.orderBy?.direction === 'desc' ? -1 : 1))
  }
  const selected = input.select?.length ? input.select.map((name) => requireColumn(table, name)) : columns
  rows = rows.slice(0, input.limit ?? rows.length).map((row) => Object.fromEntries(selected.map((column) => [column.label, row[column.label]])))
  return { rows, validation: verifyQueryResult(rows, input.limit) }
}

export function identifyVendorColumns(workbook: WorkbookModel, sheetName: string): QuoteColumnGroup[] {
  const table = getTableSchema(workbook, sheetName)
  const groups = new Map<string, QuoteColumnGroup>()
  for (const column of table.columns) {
    if (!column.vendorName) continue
    const group = groups.get(column.vendorName) ?? { vendorName: column.vendorName }
    if (column.semanticType === 'vendor-price') group.priceColumn = column
    if (column.semanticType === 'vendor-lead-time') group.leadTimeColumn = column
    if (column.semanticType === 'vendor-quote-type') group.quoteTypeColumn = column
    if (column.semanticType === 'vendor-exclusion') group.exclusionColumn = column
    groups.set(column.vendorName, group)
  }
  return Array.from(groups.values())
}

export function detectMissingQuotes(workbook: WorkbookModel, sheetName: string) {
  const sheet = requireSheet(workbook, sheetName)
  const table = getTableSchema(workbook, sheetName)
  const groups = identifyVendorColumns(workbook, sheetName).filter((group) => group.priceColumn)
  return tableRows(sheet, table).flatMap((row, rowOffset) => {
    const item = itemLabel(row, table)
    return groups
      .filter((group) => isBlank(row[group.priceColumn!.label]) || /^(?:n\/a|na|tbd|no bid)$/i.test(String(row[group.priceColumn!.label]).trim()))
      .map((group) => ({ row: table.dataStartRowIndex + rowOffset + 1, item, vendorName: group.vendorName, column: group.priceColumn!.label }))
  })
}

export function detectPartialVsTotalQuotes(workbook: WorkbookModel, sheetName: string) {
  const sheet = requireSheet(workbook, sheetName)
  const table = getTableSchema(workbook, sheetName)
  return tableRows(sheet, table).map((row, rowOffset) => {
    const text = Object.values(row).map((value) => String(value ?? '')).join(' ')
    const classification = /\b(total quote|lump sum|complete quote|package total)\b/i.test(text)
      ? 'total'
      : /\b(partial|alternate)\b/i.test(text)
        ? 'partial'
        : 'line-item'
    return { row: table.dataStartRowIndex + rowOffset + 1, item: itemLabel(row, table), classification }
  })
}

export function findLowestValidQuote(workbook: WorkbookModel, input: {
  sheet: string
  items?: string[]
  excludeTotalQuotes?: boolean
  requireLeadTime?: boolean
  excludeExclusions?: boolean
}) {
  const sheet = requireSheet(workbook, input.sheet)
  const table = getTableSchema(workbook, input.sheet)
  const groups = identifyVendorColumns(workbook, input.sheet).filter((group) => group.priceColumn)
  const classifications = detectPartialVsTotalQuotes(workbook, input.sheet)
  const wanted = (input.items ?? []).map(normalizeText)
  const results = []
  for (const [rowOffset, row] of tableRows(sheet, table).entries()) {
    const item = itemLabel(row, table)
    const itemCode = itemCodeLabel(row, table)
    if (wanted.length && !wanted.some((candidate) => normalizeText(item).includes(candidate) || normalizeText(itemCode).includes(candidate))) continue
    const rowNumber = table.dataStartRowIndex + rowOffset + 1
    const classification = classifications[rowOffset]?.classification ?? 'line-item'
    if (input.excludeTotalQuotes && classification === 'total') continue
    const candidates = groups.flatMap((group) => {
      const price = parseNumber(row[group.priceColumn!.label])
      const lead = group.leadTimeColumn ? row[group.leadTimeColumn.label] : null
      const exclusion = group.exclusionColumn ? row[group.exclusionColumn.label] : null
      if (price == null) return []
      if (input.requireLeadTime && !isValidLeadTime(lead)) return []
      if (input.excludeExclusions && !isBlank(exclusion)) return []
      return [{ vendorName: group.vendorName, column: group.priceColumn!.label, price, leadTime: lead, exclusion }]
    })
    const lowest = [...candidates].sort((a, b) => a.price - b.price)[0]
    results.push({ row: rowNumber, item, classification, lowest, candidates })
  }
  return results
}

export function recommendVendor(workbook: WorkbookModel, input: { sheet: string; ignoreMissingLeadTimes?: boolean; excludeTotalQuotes?: boolean }) {
  return findLowestValidQuote(workbook, {
    sheet: input.sheet,
    requireLeadTime: input.ignoreMissingLeadTimes,
    excludeTotalQuotes: input.excludeTotalQuotes ?? true,
  }).map((result) => ({
    row: result.row,
    item: result.item,
    recommendation: result.lowest ? result.lowest.vendorName : 'Review',
    reason: result.lowest ? `Lowest valid price ${formatMoney(result.lowest.price)}.` : 'No valid comparable quote.',
  }))
}

export function computeBasicStats(workbook: WorkbookModel, input: { sheet: string; column: string }) {
  const sheet = requireSheet(workbook, input.sheet)
  const table = getTableSchema(workbook, input.sheet)
  const column = requireColumn(table, input.column)
  const values = tableRows(sheet, table).map((row) => parseNumber(row[column.label])).filter((value): value is number => value != null)
  const sorted = [...values].sort((a, b) => a - b)
  const sum = values.reduce((total, value) => total + value, 0)
  return {
    column: column.label,
    count: values.length,
    sum,
    min: sorted[0] ?? null,
    max: sorted.at(-1) ?? null,
    mean: values.length ? sum / values.length : null,
    median: median(values),
  }
}

export function detectPriceOutliers(workbook: WorkbookModel, input: { sheet: string; percentAboveMedian?: number }) {
  const sheet = requireSheet(workbook, input.sheet)
  const table = getTableSchema(workbook, input.sheet)
  const groups = identifyVendorColumns(workbook, input.sheet).filter((group) => group.priceColumn)
  const threshold = input.percentAboveMedian ?? 25
  return tableRows(sheet, table).flatMap((row, rowOffset) => {
    const prices = groups.flatMap((group) => {
      const price = parseNumber(row[group.priceColumn!.label])
      return price == null ? [] : [{ vendorName: group.vendorName, column: group.priceColumn!.label, price }]
    })
    const rowMedian = median(prices.map((candidate) => candidate.price))
    if (rowMedian == null || rowMedian === 0) return []
    return prices
      .map((candidate) => ({ ...candidate, percentAboveMedian: ((candidate.price - rowMedian) / rowMedian) * 100 }))
      .filter((candidate) => candidate.percentAboveMedian >= threshold)
      .map((candidate) => ({
        row: table.dataStartRowIndex + rowOffset + 1,
        item: itemLabel(row, table),
        vendorName: candidate.vendorName,
        column: candidate.column,
        price: candidate.price,
        median: rowMedian,
        percentAboveMedian: Math.round(candidate.percentAboveMedian * 10) / 10,
      }))
  })
}

export function analyzeWorkbookAnomalies(workbook: WorkbookModel, input: { sheet: string; expectedUnits?: string[]; outlierPercentAboveMedian?: number }): WorkbookAnomalyReport {
  const sheet = requireSheet(workbook, input.sheet)
  const table = getTableSchema(workbook, input.sheet)
  const expectedUnits = input.expectedUnits ?? ['LF', 'linear ft', 'ft']
  const unitColumn = table.columns.find((column) => column.semanticType === 'unit')
  const unitMismatches = unitColumn
    ? tableRows(sheet, table).flatMap((row, rowOffset) => {
      const unit = row[unitColumn.label]
      if (isBlank(unit) || expectedUnits.some((expected) => normalizeText(expected) === normalizeText(String(unit)))) return []
      return [{ row: table.dataStartRowIndex + rowOffset + 1, item: itemLabel(row, table), unit, expectedUnits }]
    })
    : []
  const totalQuoteRows = detectPartialVsTotalQuotes(workbook, input.sheet).filter((row) => row.classification === 'total')
  const ambiguousVendorColumns = table.columns
    .filter((column) => /vendor|supplier/i.test(column.label) && !column.vendorName)
    .map((column) => ({ column: column.label, reason: 'Column mentions vendor/supplier but does not map to a quote metric.' }))
  return {
    missingQuotes: detectMissingQuotes(workbook, input.sheet),
    priceOutliers: detectPriceOutliers(workbook, { sheet: input.sheet, percentAboveMedian: input.outlierPercentAboveMedian }),
    unitMismatches,
    totalQuoteRows,
    ambiguousVendorColumns,
  }
}

export function createRecommendationColumnPatch(workbook: WorkbookModel, input: { sheet: string; columnName?: string; ignoreMissingLeadTimes?: boolean; patchId?: string }) {
  const recommendations = recommendVendor(workbook, { sheet: input.sheet, ignoreMissingLeadTimes: input.ignoreMissingLeadTimes ?? true })
  return createWorkbookPatch(workbook, {
    patchId: input.patchId,
    summary: `Add ${input.columnName ?? 'Recommendation'} column from deterministic quote recommendations.`,
    operations: [{
      op: 'add_column',
      sheet: input.sheet,
      after: 'Notes',
      name: input.columnName ?? 'Recommendation',
      values: recommendations.map((row) => `${row.recommendation}: ${row.reason}`),
    }],
  })
}

export function createNormalizeCurrencyPatch(workbook: WorkbookModel, input: { sheet: string; columns?: string[]; suffix?: string; patchId?: string }) {
  const sheet = requireSheet(workbook, input.sheet)
  const table = getTableSchema(workbook, input.sheet)
  const columns = (input.columns?.length ? input.columns.map((name) => requireColumn(table, name)) : table.columns.filter((column) => column.semanticType === 'vendor-price'))
  const operations: WorkbookPatchOperation[] = []
  for (const column of columns) {
    operations.push({
      op: 'add_column',
      sheet: input.sheet,
      after: column.label,
      name: `${column.label}${input.suffix ?? ' Numeric'}`,
      values: tableRows(sheet, table).map((row) => parseCurrencyLike(row[column.label])),
    })
  }
  return createWorkbookPatch(workbook, {
    patchId: input.patchId,
    summary: `Add normalized numeric currency columns for ${columns.map((column) => column.label).join(', ')}.`,
    operations,
  })
}

export function createFormulaFillPatch(workbook: WorkbookModel, input: { sheet: string; column: string; startRow: number; endRow: number; formulaForRow: (row: number) => string; patchId?: string }) {
  return createWorkbookPatch(workbook, {
    patchId: input.patchId,
    summary: `Fill formulas in ${input.column} from row ${input.startRow} through ${input.endRow}.`,
    operations: [{
      op: 'set_range_formula',
      sheet: input.sheet,
      column: input.column,
      startRow: input.startRow,
      formulas: Array.from({ length: input.endRow - input.startRow + 1 }, (_, offset) => input.formulaForRow(input.startRow + offset)),
    }],
  })
}

export function createWorkbookPatch(workbook: WorkbookModel, input: { summary: string; operations: WorkbookPatchOperation[]; patchId?: string }): WorkbookPatch {
  const patchId = input.patchId ?? `patch-${workbook.auditLog.length + 1}`
  const preview = previewPatch(workbook, input.operations)
  const risk = riskLevel(input.operations, preview)
  const verification = verifyPatch(workbook, { patch_id: patchId, summary: input.summary, risk_level: risk, requires_approval: risk !== 'safe', operations: input.operations, preview, verification: { ok: true, checks: [] } })
  const patch = {
    patch_id: patchId,
    summary: input.summary,
    risk_level: risk,
    requires_approval: risk !== 'safe',
    operations: input.operations,
    preview,
    verification,
  }
  appendAudit(workbook, 'agent', 'create_patch', input.summary, patchId, { risk, operationCount: input.operations.length })
  return patch
}

export function applyWorkbookPatch(workbook: WorkbookModel, patch: WorkbookPatch, input: { approved: boolean; now?: string }) {
  if (patch.requires_approval && !input.approved) throw new Error(`Patch ${patch.patch_id} requires approval.`)
  const beforeRowCounts = new Map(workbook.sheets.map((sheet) => [sheet.name, sheet.rows.length]))
  for (const operation of patch.operations) applyOperation(workbook, operation)
  for (const sheet of workbook.sheets) sheet.tables = detectTables(sheet)
  const verification = verifyAfterApply(workbook, patch, beforeRowCounts)
  appendVersion(workbook, patch.summary, patch.patch_id, input.now)
  appendAudit(workbook, 'agent', 'apply_patch', patch.summary, patch.patch_id, verification, input.now)
  return { workbook, verification }
}

export function rollbackWorkbookPatch(workbook: WorkbookModel, patchId: string, input: { now?: string } = {}) {
  const versionIndex = workbook.versions.findIndex((version) => version.sourcePatchId === patchId)
  if (versionIndex <= 0) throw new Error(`Cannot rollback patch ${patchId}; no prior version found.`)
  const prior = workbook.versions[versionIndex - 1]
  workbook.sheets = cloneSnapshot(prior.workbook).sheets
  appendVersion(workbook, `rollback ${patchId}`, undefined, input.now)
  appendAudit(workbook, 'agent', 'rollback_patch', `Rolled back ${patchId}.`, patchId, undefined, input.now)
  return workbook
}

export function verifyPatch(workbook: WorkbookModel, patch: WorkbookPatch): WorkbookVerificationResult {
  const checks = [
    { id: 'has-operations', ok: patch.operations.length > 0, message: patch.operations.length > 0 ? 'Patch has operations.' : 'Patch has no operations.' },
    { id: 'known-sheets', ok: patch.operations.every((operation) => Boolean(findSheet(workbook, operation.sheet))), message: 'Every operation targets an existing sheet, except summary sheets created by operation.' },
    { id: 'preview-built', ok: patch.preview.changed_cells >= 0 && Array.isArray(patch.preview.sample_before_after), message: 'Patch preview is available.' },
  ]
  return { ok: checks.every((check) => check.ok), checks }
}

export function verifyQueryResult(rows: Array<Record<string, WorkbookCellValue>>, limit?: number): WorkbookVerificationResult {
  const checks = [
    { id: 'array-result', ok: Array.isArray(rows), message: 'Query returned row objects.' },
    { id: 'limit-respected', ok: limit == null || rows.length <= limit, message: 'Query result respects requested limit.' },
  ]
  return { ok: checks.every((check) => check.ok), checks }
}

export function quoteComparisonSummaryRows(workbook: WorkbookModel, sheetName: string): WorkbookCellValue[][] {
  const vendors = identifyVendorColumns(workbook, sheetName)
  const missing = detectMissingQuotes(workbook, sheetName)
  const recommendations = recommendVendor(workbook, { sheet: sheetName, ignoreMissingLeadTimes: true })
  return [
    ['Vendor', 'Quoted Items', 'Missing Items', 'Recommended Lines'],
    ...vendors.map((vendor) => [
      vendor.vendorName,
      recommendations.filter((row) => row.recommendation === vendor.vendorName).length,
      missing.filter((row) => row.vendorName === vendor.vendorName).length,
      recommendations.filter((row) => row.recommendation === vendor.vendorName).map((row) => row.item).join(', '),
    ]),
  ]
}

function previewPatch(workbook: WorkbookModel, operations: WorkbookPatchOperation[]): WorkbookPatch['preview'] {
  const samples: WorkbookPatch['preview']['sample_before_after'] = []
  const warnings: string[] = []
  let changedCells = 0
  for (const operation of operations) {
    if (operation.op === 'create_summary_sheet') {
      changedCells += operation.rows.reduce((count, row) => count + row.length, 0)
      samples.push({ sheet: operation.name, before: {}, after: { rows: operation.rows.length } })
      continue
    }
    const sheet = requireSheet(workbook, operation.sheet)
    const table = sheet.tables[0]
    if (!table) {
      warnings.push(`No detected table on ${sheet.name}.`)
      continue
    }
    if (operation.op === 'add_column') {
      changedCells += Math.max(1, operation.values?.length ?? 0)
      samples.push({ sheet: sheet.name, column: operation.name, before: {}, after: { [operation.name]: operation.values?.[0] ?? null } })
    } else if (operation.op === 'delete_column') {
      changedCells += sheet.rows.length
      samples.push({ sheet: sheet.name, column: operation.column, before: { [operation.column]: 'existing column' }, after: {} })
    } else if (operation.op === 'set_cell') {
      const column = requireColumn(table, operation.column)
      const before = sheet.rows[operation.row - 1]?.[column.index] ?? null
      if (!isBlank(before)) warnings.push(`Operation overwrites non-empty ${sheet.name}!${operation.column}${operation.row}.`)
      changedCells += 1
      samples.push({ sheet: sheet.name, row: operation.row, column: operation.column, before, after: operation.value })
    } else if (operation.op === 'set_range_values' || operation.op === 'set_range_formula') {
      const values = operation.op === 'set_range_values' ? operation.values : operation.formulas
      changedCells += values.length
      const column = findColumnInTable(table, operation.column)
      samples.push({ sheet: sheet.name, row: operation.startRow, column: operation.column, before: column ? sheet.rows[operation.startRow - 1]?.[column.index] ?? null : null, after: values[0] ?? null })
    } else if (operation.op === 'highlight_cells' || operation.op === 'format_cells' || operation.op === 'rename_column') {
      changedCells += operation.op === 'highlight_cells' ? operation.cells.length : 1
      samples.push({ sheet: sheet.name, column: operation.op === 'rename_column' ? operation.column : 'column' in operation ? operation.column : undefined, before: null, after: null })
    }
    if (samples.length > 5) samples.length = 5
  }
  return { changed_cells: changedCells, sample_before_after: samples, warnings }
}

function riskLevel(operations: WorkbookPatchOperation[], preview: WorkbookPatch['preview']): WorkbookPatch['risk_level'] {
  if (operations.some((operation) => operation.op === 'delete_column')) return 'destructive'
  if (operations.some((operation) => operation.op === 'set_range_formula')) return 'medium'
  if (preview.changed_cells > 25) return 'medium'
  if (preview.warnings.some((warning) => warning.includes('overwrites'))) return 'medium'
  if (operations.some((operation) => ['add_column', 'rename_column', 'create_summary_sheet'].includes(operation.op))) return 'medium'
  return 'safe'
}

function applyOperation(workbook: WorkbookModel, operation: WorkbookPatchOperation) {
  if (operation.op === 'create_summary_sheet') {
    workbook.sheets.push({ id: slug(operation.name), name: operation.name, rows: operation.rows.map((row) => row.map(normalizeCell)), tables: [] })
    return
  }
  const sheet = requireSheet(workbook, operation.sheet)
  const table = sheet.tables[0] ?? detectTables(sheet)[0]
  if (!table) throw new Error(`No table found on ${sheet.name}.`)
  if (operation.op === 'add_column') {
    const after = operation.after ? requireColumn(table, operation.after).index : table.columns.length - 1
    const index = operation.before ? requireColumn(table, operation.before).index : after + 1
    for (const [rowIndex, row] of sheet.rows.entries()) {
      const value = rowIndex === table.headerRowIndex ? operation.name : operation.values?.[rowIndex - table.dataStartRowIndex] ?? null
      row.splice(index, 0, normalizeCell(value))
    }
    sheet.tables = detectTables(sheet)
  } else if (operation.op === 'delete_column') {
    const column = requireColumn(table, operation.column)
    for (const row of sheet.rows) row.splice(column.index, 1)
    sheet.tables = detectTables(sheet)
  } else if (operation.op === 'rename_column') {
    const column = requireColumn(table, operation.column)
    sheet.rows[table.headerRowIndex]![column.index] = operation.name
    sheet.tables = detectTables(sheet)
  } else if (operation.op === 'set_cell') {
    const column = requireColumn(sheet.tables[0] ?? table, operation.column)
    ensureRow(sheet, operation.row - 1)
    sheet.rows[operation.row - 1]![column.index] = normalizeCell(operation.value)
  } else if (operation.op === 'set_range_values' || operation.op === 'set_range_formula') {
    const column = requireColumn(sheet.tables[0] ?? table, operation.column)
    const values = operation.op === 'set_range_values' ? operation.values : operation.formulas
    for (const [offset, value] of values.entries()) {
      ensureRow(sheet, operation.startRow - 1 + offset)
      sheet.rows[operation.startRow - 1 + offset]![column.index] = normalizeCell(value)
    }
  }
}

function verifyAfterApply(workbook: WorkbookModel, patch: WorkbookPatch, beforeRowCounts: Map<string, number>): WorkbookVerificationResult {
  const checks = [
    { id: 'patch-verified-before-apply', ok: patch.verification.ok, message: 'Patch verified before apply.' },
    {
      id: 'row-count-stable',
      ok: patch.operations.some((operation) => operation.op === 'create_summary_sheet') || workbook.sheets.every((sheet) => beforeRowCounts.get(sheet.name) == null || beforeRowCounts.get(sheet.name) === sheet.rows.length),
      message: 'Existing sheet row counts remained stable.',
    },
  ]
  return { ok: checks.every((check) => check.ok), checks }
}

function inferColumnSchema(label: string, index: number, dataRows: WorkbookCellValue[][]): WorkbookColumnSchema {
  const normalized = normalizeText(label)
  const vendorName = vendorNameFromLabel(label)
  const semanticType: WorkbookColumnSchema['semanticType'] =
    /\b(item|sku|line)\b/.test(normalized) ? 'item'
      : /\b(desc|description|material)\b/.test(normalized) ? 'description'
        : /\b(qty|quantity)\b/.test(normalized) ? 'quantity'
          : /\bunit\b/.test(normalized) && !/\bprice\b/.test(normalized) ? 'unit'
            : /\b(lead|delivery)\b/.test(normalized) ? 'vendor-lead-time'
              : /\b(type|quote type|scope)\b/.test(normalized) ? 'vendor-quote-type'
                : /\b(exclusion|exclude)\b/.test(normalized) ? 'vendor-exclusion'
                  : /\b(price|cost|total|quote)\b/.test(normalized) ? 'vendor-price'
                    : /\b(note|terms)\b/.test(normalized) ? 'notes'
                      : 'unknown'
  const values = dataRows.map((row) => row[index]).filter((value) => !isBlank(value))
  const numeric = values.filter((value) => parseNumber(value) != null).length
  const currency = values.filter((value) => typeof value === 'string' && value.includes('$')).length
  const valueType = values.length === 0 ? 'blank' : currency ? 'currency' : numeric === values.length ? 'number' : numeric > 0 ? 'mixed' : 'text'
  return { key: slug(label) || `col-${index + 1}`, label, index, semanticType, vendorName, valueType }
}

function vendorNameFromLabel(label: string) {
  const stripped = label.replace(/\b(unit\s*)?price\b|\btotal\b|\bcost\b|\blead\s*time\b|\bquote\s*type\b|\bexclusions?\b/ig, '').trim()
  if (stripped && stripped !== label && !/\b(qty|quantity|unit|item|description|notes)\b/i.test(label)) return stripped
  return undefined
}

function tableRows(sheet: WorkbookSheet, table: WorkbookTable) {
  return sheet.rows.slice(table.dataStartRowIndex, table.dataEndRowIndex + 1).map((row) => Object.fromEntries(table.columns.map((column) => [column.label, row[column.index] ?? null])))
}

function itemLabel(row: Record<string, WorkbookCellValue>, table: WorkbookTable) {
  const itemColumn = table.columns.find((column) => column.semanticType === 'item')
  const descriptionColumn = table.columns.find((column) => column.semanticType === 'description')
  return String(row[descriptionColumn?.label ?? ''] ?? row[itemColumn?.label ?? ''] ?? '')
}

function itemCodeLabel(row: Record<string, WorkbookCellValue>, table: WorkbookTable) {
  const itemColumn = table.columns.find((column) => column.semanticType === 'item')
  return String(row[itemColumn?.label ?? ''] ?? '')
}

function requireSheet(workbook: WorkbookModel, sheetName: string) {
  const sheet = findSheet(workbook, sheetName)
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}.`)
  return sheet
}

function findSheet(workbook: WorkbookModel, sheetName: string) {
  const normalized = normalizeText(sheetName)
  return workbook.sheets.find((sheet) => normalizeText(sheet.name) === normalized || sheet.id === sheetName)
}

function requireColumn(table: WorkbookTable, columnName: string) {
  const column = findColumnInTable(table, columnName)
  if (!column) throw new Error(`Column not found: ${columnName}.`)
  return column
}

function findColumnInTable(table: WorkbookTable, columnName: string) {
  const normalized = normalizeText(columnName)
  return table.columns.find((candidate) => normalizeText(candidate.label) === normalized || candidate.key === columnName || normalizeText(candidate.label).includes(normalized))
}

function parseRange(range: string) {
  const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i.exec(range.trim())
  if (!match) throw new Error(`Unsupported range: ${range}.`)
  return {
    startCol: columnIndex(match[1]!),
    startRow: Number(match[2]) - 1,
    endCol: columnIndex(match[3]!),
    endRow: Number(match[4]) - 1,
  }
}

function columnIndex(name: string) {
  return name.toUpperCase().split('').reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1
}

function columnName(index: number) {
  let name = ''
  let value = index + 1
  while (value > 0) {
    const remainder = (value - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    value = Math.floor((value - 1) / 26)
  }
  return name
}

function appendVersion(workbook: WorkbookModel, summary: string, sourcePatchId?: string, now = new Date().toISOString()) {
  workbook.versions.push({ id: `version-${workbook.versions.length + 1}`, createdAt: now, summary, sourcePatchId, workbook: cloneSnapshot({ sheets: workbook.sheets }) })
}

function appendAudit(workbook: WorkbookModel, actor: WorkbookAuditEvent['actor'], action: string, summary: string, patchId?: string, details?: unknown, now = new Date().toISOString()) {
  workbook.auditLog.push({ id: `audit-${workbook.auditLog.length + 1}`, at: now, actor, action, summary, patchId, details })
}

function cloneSnapshot(snapshot: WorkbookSnapshot): WorkbookSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as WorkbookSnapshot
}

function ensureRow(sheet: WorkbookSheet, rowIndex: number) {
  while (sheet.rows.length <= rowIndex) sheet.rows.push([])
}

function normalizeCell(value: unknown): WorkbookCellValue {
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  return String(value)
}

function isBlank(value: unknown) {
  return value == null || String(value).trim() === ''
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function slug(value: string) {
  return normalizeText(value).replaceAll(' ', '-')
}

function parseNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const normalized = value.replace(/[$,\sA-Za-z]/g, '')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function parseCurrencyLike(value: unknown): WorkbookCellValue {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  if (!trimmed || /^(?:tbd|n\/a|na|no bid|included|-)$/.test(trimmed)) return null
  const multiplier = trimmed.endsWith('k') ? 1000 : 1
  const parsed = Number(trimmed.replace(/usd|\$|,|\s|k$/g, ''))
  return Number.isFinite(parsed) ? parsed * multiplier : null
}

function median(values: number[]) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

function isValidLeadTime(value: unknown) {
  if (isBlank(value)) return false
  return !/^(?:n\/a|na|tbd|unknown|no bid)$/i.test(String(value).trim())
}

function compareValues(a: WorkbookCellValue, b: WorkbookCellValue) {
  const aNumber = parseNumber(a)
  const bNumber = parseNumber(b)
  if (aNumber != null && bNumber != null) return aNumber - bNumber
  return String(a ?? '').localeCompare(String(b ?? ''))
}

function formatMoney(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}
