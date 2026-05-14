import type { ComparisonOperation, ComparisonPatchFragment } from '../domain/types.js'

export interface QuoteComparisonToolContext {
  snapshot?: unknown
  sheetSchema?: unknown
}

export interface SheetStructureEditInput {
  operations: Array<
    | { kind: 'hide-column' | 'delete-column' | 'show-column'; colKey: string }
    | { kind: 'hide-row' | 'delete-row' | 'show-row'; rowKey: string }
    | { kind: 'set-column-label'; colKey: string; label: string }
    | { kind: 'sort-rows'; colKey: string; direction: 'asc' | 'desc' }
    | { kind: 'filter-blank-rows'; colKey: string }
  >
  summary?: string
}

export interface BulkNumericEditInput {
  colKey: string
  amount: number
  dependentColKey?: string
  dependentFormula?: 'multiply-by-quantity'
  summary?: string
}

export interface DerivedColumnsInput {
  columns: Array<{
    colKey: string
    label: string
    formula: string
    afterColKey?: string
    beforeColKey?: string
  }>
  summary?: string
}

export interface ConvertedQuantityColumnInput {
  sourceColKey?: string
  colKey?: string
  label?: string
  afterColKey?: string
  divisor?: number
  summary?: string
}

export interface SelectionStateInput {
  selections: Array<{
    rowKey: string
    state: 'selected-vendor' | 'no-award' | 'deferred' | 'out-of-scope'
    vendorId?: string
    reason?: string
  }>
  summary?: string
}

export interface DeletionsInput {
  columns?: Array<{ colKey: string }>
  rows?: Array<{ rowKey: string }>
  cells?: Array<{ rowKey: string; colKey: string }>
  summary?: string
}

export interface LowestTotalPriceColumnInput {
  colKey?: string
  label?: string
  afterColKey?: string
  summary?: string
}

export interface PlanningAnalysisInput {
  prompt: string
}

export function inspectQuoteComparisonSnapshot(context: QuoteComparisonToolContext) {
  const sheet = sheetData(context)
  return {
    action: 'snapshot-inspected',
    columns: sheet.columns.map(labelFor),
    rowCount: sheet.rows.length,
    vendors: sheet.vendors.map(labelFor),
  }
}

export function analyzeQuoteComparisonWork(
  context: QuoteComparisonToolContext,
  input: PlanningAnalysisInput,
) {
  const sheet = sheetData(context)
  const lower = input.prompt.toLowerCase()
  const broadPlanningSignals = [
    /\blevel\b/,
    /\bclean(?:er)?\b/,
    /\bbest\b/,
    /\brecommend\b/,
    /\bcompare\b/,
    /\banaly[sz]e\b/,
    /\bsummary\b/,
    /\bwhat should\b/,
  ]
  const simpleEditSignals = [
    /\bhighlight\b/,
    /\bdelete\b/,
    /\badd (?:a |an |new )?(?:column|row)\b/,
    /\bset\b/,
    /\bfill\b/,
  ]
  const matchingBroadSignals = broadPlanningSignals
    .filter((signal) => signal.test(lower))
    .map((signal) => signal.source.replaceAll('\\b', '').replaceAll('(?:er)?', 'er').replaceAll('(?:a |an |new )?', ''))
  const matchingSimpleSignals = simpleEditSignals
    .filter((signal) => signal.test(lower))
    .map((signal) => signal.source.replaceAll('\\b', '').replaceAll('(?:a |an |new )?', ''))
  const vendorColumns = sheet.columns.filter((column) => asRecord(column)?.vendorId || /vendor|price|total|cost|lead|quote/i.test(`${keyFor(column)} ${labelFor(column)}`))
  const unresolvedCells = numericReviewCells(sheet.rows, sheet.columns).filter((cell) => cell.reason !== 'numeric')
  const complexity = matchingBroadSignals.length || lower.split(/\s+/).length > 8 ? 'needs-planning' : 'simple'
  const ambiguity = /\bbest\b|\bclean(?:er)?\b|\blevel\b/.test(lower)

  return {
    action: 'quote-comparison-work-analysis',
    complexity,
    ambiguity: ambiguity ? 'material-choice' : 'low',
    suggestedNextStep: ambiguity
      ? 'Ask one concise clarification before proposing material sheet edits.'
      : complexity === 'needs-planning'
        ? 'Create a short plan, then use read-only analysis or proposal tools that match each step.'
        : 'Use the narrowest matching proposal or answer tool.',
    recommendedToolFamilies: complexity === 'needs-planning'
      ? ['quoteComparison.answerSheetQuestion', 'quoteComparison.proposeDerivedColumns', 'quoteComparison.proposeHighlights', 'quoteComparison.proposeCellEdits']
      : ['quoteComparison.proposeHighlights', 'quoteComparison.proposeCellEdits', 'quoteComparison.proposeSheetStructureEdits'],
    sheetSignals: {
      rowCount: sheet.rows.length,
      columnCount: sheet.columns.length,
      vendorColumnCount: vendorColumns.length,
      unresolvedCellCount: unresolvedCells.length,
    },
    promptSignals: {
      broad: matchingBroadSignals,
      simple: matchingSimpleSignals,
    },
  }
}

export function answerQuoteComparisonQuestion(context: QuoteComparisonToolContext, question: string) {
  const sheet = sheetData(context)
  const lower = question.toLowerCase()
  if (/\bsummary\b|\bgaps?\b|\bbest choice\b|\bcomplete\b|\bincomplete\b/i.test(lower)) {
    const facts = summarizeQuoteComparisonFacts(context)
    return {
      action: 'sheet-answer',
      answer: [
        `Summary facts for model synthesis: ${facts.rowCount} visible items, ${facts.vendorCount} vendors, ${facts.totalMissingPriceCells}/${facts.totalPriceCells} vendor total cells missing.`,
        facts.bestCompleteVendor
          ? `Best complete vendor is ${facts.bestCompleteVendor.vendorName} at ${formatMoney(facts.bestCompleteVendor.total)}.`
          : 'No vendor has a complete visible quote.',
        `${facts.pricingMistakeFlagCount} purple pricing-mistake flag${facts.pricingMistakeFlagCount === 1 ? '' : 's'} are visible.`,
      ].join(' '),
      facts,
    }
  }
  if (lower.includes('lowest') && (lower.includes('total') || lower.includes('price'))) {
    const totals = numericCells(sheet.rows, sheet.columns, (column) => /total|price|cost/i.test(`${keyFor(column)} ${labelFor(column)}`))
    const lowest = totals.sort((a, b) => a.value - b.value)[0]
    if (lowest) {
      return {
        action: 'sheet-answer',
        answer: `${lowest.valueLabel} is the lowest visible total I found, at ${labelFor(lowest.row)} / ${labelFor(lowest.column)}.`,
        references: [{ rowKey: keyFor(lowest.row), colKey: keyFor(lowest.column) }],
      }
    }
  }
  return {
    action: 'sheet-answer',
    answer: `I inspected ${sheet.rows.length} visible rows and ${sheet.columns.length} visible columns, but this first implementation slice could not compute a precise answer for: ${question}`,
  }
}

function summarizeQuoteComparisonFacts(context: QuoteComparisonToolContext) {
  const sheet = sheetData(context)
  const totalColumns = sheet.columns.filter((column) => asRecord(column)?.metric === 'total' && asRecord(column)?.vendorId)
  const unitColumns = sheet.columns.filter((column) => asRecord(column)?.metric === 'unit_price' && asRecord(column)?.vendorId)
  const vendorIds = [...new Set(totalColumns.map((column) => String(asRecord(column)?.vendorId)).filter(Boolean))]
  const vendorSummaries = vendorIds.map((vendorId) => {
    const column = totalColumns.find((candidate) => String(asRecord(candidate)?.vendorId) === vendorId)
    const vendorName = sheet.vendors.find((vendor) => keyFor(vendor) === vendorId || String(asRecord(vendor)?.id) === vendorId)
    let missingTotalCells = 0
    let pricedTotalCells = 0
    let total = 0
    for (const row of sheet.rows) {
      const value = parseNumber(valuesFor(row)[keyFor(column)])
      if (value == null) missingTotalCells += 1
      else {
        pricedTotalCells += 1
        total += value
      }
    }
    return {
      vendorId,
      vendorName: labelFor(vendorName ?? column),
      total: Number(total.toFixed(2)),
      pricedTotalCells,
      missingTotalCells,
      complete: missingTotalCells === 0,
      coverageRatio: sheet.rows.length ? pricedTotalCells / sheet.rows.length : 0,
    }
  })
  const completeVendors = vendorSummaries.filter((vendor) => vendor.complete)
  const bestCompleteVendor = completeVendors.sort((a, b) => a.total - b.total)[0]
  const partialVendors = vendorSummaries.filter((vendor) => !vendor.complete)
  const totalMissingPriceCells = vendorSummaries.reduce((sum, vendor) => sum + vendor.missingTotalCells, 0)
  const highlights = asArray(asRecord(context.snapshot)?.highlights)
  const pricingMistakeFlags = highlights.filter((highlight) => {
    const record = asRecord(highlight)
    return String(record?.color ?? '').toLowerCase() === '#e9d5ff'
  })
  const rowsWithAnyGap = sheet.rows.filter((row) => totalColumns.some((column) => parseNumber(valuesFor(row)[keyFor(column)]) == null))
  const mostIncompleteVendors = [...partialVendors].sort((a, b) => b.missingTotalCells - a.missingTotalCells).slice(0, 3)
  const unitOutlierHints = unitColumns.flatMap((column) => {
    const values = sheet.rows
      .map((row) => ({ row, value: parseNumber(valuesFor(row)[keyFor(column)]) }))
      .filter((entry): entry is { row: unknown; value: number } => entry.value != null && entry.value > 0)
    if (values.length === 0) return []
    return []
  })
  return {
    rowCount: sheet.rows.length,
    vendorCount: vendorIds.length,
    totalPriceCells: sheet.rows.length * vendorIds.length,
    totalMissingPriceCells,
    completeVendorCount: completeVendors.length,
    partialVendorCount: partialVendors.length,
    bestCompleteVendor,
    vendorSummaries,
    mostIncompleteVendors,
    rowsWithAnyGap: rowsWithAnyGap.length,
    pricingMistakeFlagCount: pricingMistakeFlags.length,
    pricingMistakeNotes: pricingMistakeFlags.map((highlight) => String(asRecord(highlight)?.note ?? '')).filter(Boolean).slice(0, 5),
    unitOutlierHints,
  }
}

export function proposeQuoteComparisonHighlights(
  context: QuoteComparisonToolContext,
  input: { rule: 'missing-lead-times' | 'lowest-price-per-row'; color?: 'red' | 'orange' | 'blue' | 'green' | 'yellow' },
): ComparisonPatchFragment {
  const sheet = sheetData(context)
  if (input.rule === 'missing-lead-times') {
    const leadColumns = sheet.columns.filter((column) => /lead/i.test(`${keyFor(column)} ${labelFor(column)} ${String(asRecord(column)?.metric ?? '')}`))
    const operations: ComparisonOperation[] = []
    for (const row of sheet.rows) {
      const values = valuesFor(row)
      for (const column of leadColumns) {
        const colKey = keyFor(column)
        const value = values[colKey]
        if (value == null || String(value).trim() === '') {
          operations.push({
            kind: 'add-highlight',
            id: `hl-missing-lead-${keyFor(row)}-${colKey}`,
            selector: { kind: 'cell', rowKey: keyFor(row), colKey },
            color: input.color ?? 'red',
            note: 'Missing lead time.',
          })
        }
      }
    }
    return {
      summary: operations.length
        ? `Highlighted ${operations.length} missing lead time cell${operations.length === 1 ? '' : 's'}.`
        : 'No missing lead times found in the visible sheet state.',
      operations,
      warnings: operations.length ? [`${operations.length} missing lead time cell${operations.length === 1 ? '' : 's'} found.`] : [],
    }
  }
  return {
    summary: 'Prepared a lowest-price-per-row highlight rule.',
    operations: [{
      kind: 'add-highlight',
      id: `hl-lowest-price-${Date.now()}`,
      selector: { kind: 'rule', rule: 'lowest-price-per-row' },
      color: input.color ?? 'green',
      note: 'Lowest visible price per row.',
    }],
  }
}

export function proposeQuoteComparisonCellEdits(input: {
  edits: Array<{
    rowKey: string
    colKey: string
    value: string | number | boolean | null
    note?: string
  }>
  summary?: string
}): ComparisonPatchFragment {
  return {
    summary: input.summary ?? `Prepared ${input.edits.length} cell edit${input.edits.length === 1 ? '' : 's'}.`,
    operations: input.edits.map((edit) => ({ kind: 'set-cell' as const, ...edit })),
  }
}

export function proposeQuoteComparisonSheetStructureEdits(input: SheetStructureEditInput): ComparisonPatchFragment {
  return {
    summary: input.summary ?? `Prepared ${input.operations.length} sheet structure edit${input.operations.length === 1 ? '' : 's'}.`,
    operations: input.operations,
  }
}

export function proposeQuoteComparisonDeletions(input: DeletionsInput): ComparisonPatchFragment {
  const operations: ComparisonOperation[] = [
    ...(input.columns ?? []).map((column) => ({ kind: 'delete-column' as const, colKey: column.colKey })),
    ...(input.rows ?? []).map((row) => ({ kind: 'delete-row' as const, rowKey: row.rowKey })),
    ...(input.cells ?? []).map((cell) => ({
      kind: 'set-cell' as const,
      rowKey: cell.rowKey,
      colKey: cell.colKey,
      value: '',
      note: 'Deleted cell contents.',
    })),
  ]

  return {
    summary: input.summary ?? `Prepared ${operations.length} delete operation edit${operations.length === 1 ? '' : 's'}.`,
    operations,
  }
}

export function proposeQuoteComparisonBulkNumericEdit(
  context: QuoteComparisonToolContext,
  input: BulkNumericEditInput,
): ComparisonPatchFragment {
  const sheet = sheetData(context)
  const qtyKey = input.dependentFormula === 'multiply-by-quantity' ? quantityColumnKey(sheet.columns) : undefined
  const operations: ComparisonOperation[] = []
  for (const row of sheet.rows) {
    const values = valuesFor(row)
    const current = parseNumber(values[input.colKey])
    if (current == null) continue
    const adjusted = current + input.amount
    operations.push({
      kind: 'set-cell',
      rowKey: keyFor(row),
      colKey: input.colKey,
      value: formatNumberForSheetValue(values[input.colKey], adjusted),
      note: `Adjusted by ${input.amount}.`,
    })

    const quantity = qtyKey ? parseLeadingNumber(values[qtyKey]) : null
    if (input.dependentColKey && input.dependentFormula === 'multiply-by-quantity' && quantity != null) {
      operations.push({
        kind: 'set-cell',
        rowKey: keyFor(row),
        colKey: input.dependentColKey,
        value: formatMoney(adjusted * quantity),
        note: `Updated from ${formatMoney(adjusted)} x ${quantity}.`,
      })
    }
  }

  const warnings = []
  if (input.dependentFormula === 'multiply-by-quantity' && !qtyKey) {
    warnings.push('Could not find a visible quantity column, so dependent totals were not recalculated.')
  }
  if (operations.length === 0) warnings.push(`No numeric values were found in ${input.colKey}.`)
  return {
    summary: input.summary ?? `Prepared ${operations.length} numeric cell update${operations.length === 1 ? '' : 's'} for ${input.colKey}.`,
    operations,
    warnings,
  }
}

export function proposeQuoteComparisonConvertedQuantityColumn(
  context: QuoteComparisonToolContext,
  input: ConvertedQuantityColumnInput,
): ComparisonPatchFragment {
  const sheet = sheetData(context)
  const sourceColKey = input.sourceColKey ?? quantityColumnKey(sheet.columns)
  const colKey = input.colKey ?? 'manual-qty-klf'
  const label = input.label ?? 'Qty (kLF)'
  const divisor = input.divisor ?? 1000
  const operations: ComparisonOperation[] = []

  if (!sourceColKey) {
    return {
      summary: input.summary ?? 'Could not add Qty (kLF) because no visible quantity column was found.',
      operations,
      warnings: ['Could not find a visible quantity column.'],
    }
  }

  operations.push({
    kind: 'insert-column',
    colKey,
    label,
    afterColKey: input.afterColKey ?? sourceColKey,
  })

  for (const row of sheet.rows) {
    const quantity = parseLeadingNumber(valuesFor(row)[sourceColKey])
    if (quantity == null) continue
    operations.push({
      kind: 'set-cell',
      rowKey: keyFor(row),
      colKey,
      value: formatDecimal(quantity / divisor),
      note: `Converted from ${sourceColKey} by dividing by ${divisor}.`,
    })
  }

  const convertedCount = operations.filter((operation) => operation.kind === 'set-cell').length
  return {
    summary: input.summary ?? `Added ${label} and converted ${convertedCount} quantity value${convertedCount === 1 ? '' : 's'}.`,
    operations,
    warnings: convertedCount ? [] : [`No numeric quantity values were found in ${sourceColKey}.`],
  }
}

export function proposeQuoteComparisonLowestTotalPriceColumn(
  context: QuoteComparisonToolContext,
  input: LowestTotalPriceColumnInput,
): ComparisonPatchFragment {
  const sheet = sheetData(context)
  const colKey = input.colKey ?? 'lowest-total-price'
  const label = input.label ?? 'Lowest Total Price'
  const totalColumns = sheet.columns.filter(isTotalPriceColumn)
  const operations: ComparisonOperation[] = [{
    kind: 'insert-column',
    colKey,
    label,
    afterColKey: input.afterColKey ?? quantityColumnKey(sheet.columns) ?? keyFor(sheet.columns[0]),
  }]

  for (const row of sheet.rows) {
    const values = valuesFor(row)
    const totals = totalColumns
      .map((column) => ({ column, value: parseNumber(values[keyFor(column)]) }))
      .filter((candidate): candidate is { column: unknown; value: number } => candidate.value != null)
    if (!totals.length) continue
    const lowest = totals.reduce((best, candidate) => candidate.value < best.value ? candidate : best)
    operations.push({
      kind: 'set-cell',
      rowKey: keyFor(row),
      colKey,
      value: formatMoney(lowest.value),
      note: `Lowest visible total price from ${labelFor(lowest.column)}.`,
    })
  }

  const filled = operations.filter((operation) => operation.kind === 'set-cell').length
  return {
    summary: input.summary ?? `Added ${label} and filled ${filled} row value${filled === 1 ? '' : 's'}.`,
    operations,
    warnings: filled ? [] : ['No visible total price values were found.'],
  }
}

export function proposeQuoteComparisonDerivedColumns(input: DerivedColumnsInput): ComparisonPatchFragment {
  return {
    summary: input.summary ?? `Prepared ${input.columns.length} derived column${input.columns.length === 1 ? '' : 's'}.`,
    operations: input.columns.map((column) => ({ kind: 'add-derived-column' as const, ...column })),
  }
}

export function proposeQuoteComparisonSelectionState(input: SelectionStateInput): ComparisonPatchFragment {
  return {
    summary: input.summary ?? `Prepared ${input.selections.length} selection state change${input.selections.length === 1 ? '' : 's'}.`,
    operations: input.selections.map((selection) => ({ kind: 'set-selection-state' as const, ...selection })),
    warnings: ['Selection state changes are proposal-only in this slice and do not notify vendors or create purchasing follow-ups.'],
  }
}

function sheetData(context: QuoteComparisonToolContext) {
  const snapshot = asRecord(context.snapshot)
  const sheetSchema = asRecord(context.sheetSchema)
  return {
    columns: asArray(snapshot?.columns).length ? asArray(snapshot?.columns) : asArray(sheetSchema?.columns),
    rows: asArray(snapshot?.rows).length ? asArray(snapshot?.rows) : asArray(sheetSchema?.lineItems),
    vendors: asArray(snapshot?.vendors).length ? asArray(snapshot?.vendors) : asArray(sheetSchema?.vendors),
  }
}

function numericCells(rows: unknown[], columns: unknown[], columnPredicate: (column: unknown) => boolean) {
  const matches: Array<{ row: unknown; column: unknown; value: number; valueLabel: string }> = []
  for (const row of rows) {
    const values = valuesFor(row)
    for (const column of columns.filter(columnPredicate)) {
      const raw = values[keyFor(column)]
      const value = parseNumber(raw)
      if (value != null) matches.push({ row, column, value, valueLabel: String(raw) })
    }
  }
  return matches
}

function numericReviewCells(rows: unknown[], columns: unknown[]) {
  const matches: Array<{ row: unknown; column: unknown; reason: 'blank' | 'tbd' | 'numeric' }> = []
  for (const row of rows) {
    const values = valuesFor(row)
    for (const column of columns) {
      if (!/price|lead|total|cost/i.test(`${keyFor(column)} ${labelFor(column)} ${String(asRecord(column)?.metric ?? '')}`)) continue
      const raw = values[keyFor(column)]
      if (raw == null || String(raw).trim() === '') matches.push({ row, column, reason: 'blank' })
      else if (/^(?:tbd|n\/a)$/i.test(String(raw).trim())) matches.push({ row, column, reason: 'tbd' })
      else if (parseNumber(raw) != null) matches.push({ row, column, reason: 'numeric' })
    }
  }
  return matches
}

function isTotalPriceColumn(column: unknown) {
  const record = asRecord(column)
  const text = `${keyFor(column)} ${labelFor(column)} ${String(record?.metric ?? '')}`.toLowerCase()
  return /\btotal\b/.test(text) && !/\bunit\b/.test(text)
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function keyFor(value: unknown) {
  const record = asRecord(value)
  return String(record?.key ?? record?.id ?? record?.rowKey ?? record?.colKey ?? '')
}

function labelFor(value: unknown) {
  const record = asRecord(value)
  return String(record?.label ?? record?.description ?? record?.name ?? keyFor(value))
}

function valuesFor(row: unknown): Record<string, unknown> {
  const record = asRecord(row)
  return asRecord(record?.values) ?? asRecord(record?.cells) ?? {}
}

function parseNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const normalized = value.replace(/[$,\sA-Za-z]/g, '')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function parseLeadingNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

function formatMoney(value: number) {
  const rounded = Math.round(value * 100) / 100
  return rounded.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
  })
}

function formatNumberForSheetValue(original: unknown, value: number) {
  if (typeof original === 'string' && original.includes('$')) return formatMoney(value)
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

function formatDecimal(value: number) {
  return String(Math.round(value * 1000) / 1000)
}

function quantityColumnKey(columns: unknown[]) {
  const column = columns.find((candidate) => {
    const label = `${keyFor(candidate)} ${labelFor(candidate)}`.toLowerCase()
    return /\b(qty|quantity)\b/.test(label)
  })
  return column ? keyFor(column) : undefined
}
