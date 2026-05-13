import { describe, expect, it } from 'vitest'
import {
  analyzeWorkbookAnomalies,
  applyWorkbookPatch,
  computeBasicStats,
  createFormulaFillPatch,
  createNormalizeCurrencyPatch,
  createRecommendationColumnPatch,
  createWorkbookPatch,
  detectMissingQuotes,
  detectPartialVsTotalQuotes,
  findColumn,
  findLowestValidQuote,
  getTableSchema,
  getWorkbookOverview,
  identifyVendorColumns,
  ingestWorkbookFromSheets,
  queryTable,
  quoteComparisonSummaryRows,
  readRange,
  recommendVendor,
  rollbackWorkbookPatch,
  searchWorkbook,
} from './workbook-agent.js'

const rfqRows = [
  ['Item', 'Description', 'Qty', 'Unit', 'Acme Price', 'Acme Lead Time', 'Acme Quote Type', 'Acme Exclusions', 'L n W Price', 'L n W Lead Time', 'L n W Quote Type', 'L n W Exclusions', 'BuildCo Price', 'BuildCo Lead Time', 'BuildCo Quote Type', 'BuildCo Exclusions', 'Notes'],
  ['X', 'Drywall 5/8 Type X', '12,500 LF', 'LF', '$1,200', '2 weeks', 'partial', '', '$1,150', '14 days', 'partial', '', '$1,500', '4 weeks', 'partial', 'excludes delivery', ''],
  ['Y', 'Metal studs 20ga', '8,000 linear ft', 'linear ft', '$960', '3 weeks', 'partial', '', '$940', '2-3 weeks', 'partial', '', 'TBD', '', 'partial', '', ''],
  ['Z', 'J track 20ga', '4,500 ft', 'ft', '$550', '21 days', 'partial', '', '$575', '5 weeks', 'partial', 'excludes tax', '$500', '18 days', 'partial', '', ''],
  ['D', 'Fasteners', '600 EA', 'EA', '$300', '10 days', 'partial', '', '', 'N/A', 'partial', '', '$280', '8 days', 'partial', '', 'unit mismatch'],
  ['E', 'Insulation rolls', '40 rolls', 'rolls', '$2,400', '3-4 weeks', 'partial', '', '$2,200', '2 weeks', 'partial', '', '$2,100', 'TBD', 'partial', '', ''],
  ['PKG', 'Project lump sum quote', '1', 'LS', '$9,500', '2 weeks', 'total quote', '', '$8,900', '2 weeks', 'lump sum', '', '$9,100', '2 weeks', 'complete quote', '', 'total bid row'],
]

function workbook() {
  return ingestWorkbookFromSheets({
    id: 'rfq-workbook',
    sheets: [{ name: 'Vendor Quotes', rows: rfqRows }],
    now: '2026-05-12T12:00:00.000Z',
  })
}

describe('deterministic workbook agent tools', () => {
  it('ingests workbook sheets, extracts table schema, searches, reads ranges, and queries rows', () => {
    const wb = workbook()

    expect(getWorkbookOverview(wb)).toMatchObject({
      workbookId: 'rfq-workbook',
      sheetCount: 1,
      sheets: [{ name: 'Vendor Quotes', rowCount: 7, columnCount: 17, tableCount: 1 }],
    })
    expect(getTableSchema(wb, 'Vendor Quotes').columns.map((column) => [column.label, column.semanticType, column.vendorName])).toContainEqual(['Acme Price', 'vendor-price', 'Acme'])
    expect(findColumn(wb, 'Vendor Quotes', 'quantity')[0]).toMatchObject({ label: 'Qty', semanticType: 'quantity' })
    expect(searchWorkbook(wb, 'lump sum')).toEqual([
      { sheet: 'Vendor Quotes', row: 7, column: 'Description', value: 'Project lump sum quote' },
      { sheet: 'Vendor Quotes', row: 7, column: 'L n W Quote Type', value: 'lump sum' },
    ])
    expect(readRange(wb, 'Vendor Quotes', 'A1:D2')).toEqual([
      ['Item', 'Description', 'Qty', 'Unit'],
      ['X', 'Drywall 5/8 Type X', '12,500 LF', 'LF'],
    ])
    expect(queryTable(wb, {
      sheet: 'Vendor Quotes',
      select: ['Item', 'Description', 'Acme Price'],
      where: [{ column: 'Unit', op: '=', value: 'LF' }],
    })).toMatchObject({
      rows: [{ Item: 'X', Description: 'Drywall 5/8 Type X', 'Acme Price': '$1,200' }],
      validation: { ok: true },
    })
  })

  it('identifies quote columns and answers lowest partial quote questions without package totals', () => {
    const wb = workbook()

    expect(identifyVendorColumns(wb, 'Vendor Quotes')).toMatchObject([
      { vendorName: 'Acme', priceColumn: { label: 'Acme Price' }, leadTimeColumn: { label: 'Acme Lead Time' } },
      { vendorName: 'L n W', priceColumn: { label: 'L n W Price' } },
      { vendorName: 'BuildCo', priceColumn: { label: 'BuildCo Price' } },
    ])
    expect(detectPartialVsTotalQuotes(wb, 'Vendor Quotes').at(-1)).toEqual({ row: 7, item: 'Project lump sum quote', classification: 'total' })
    expect(findLowestValidQuote(wb, {
      sheet: 'Vendor Quotes',
      items: ['X', 'Y', 'Z'],
      excludeTotalQuotes: true,
    }).map((result) => [result.item, result.lowest?.vendorName, result.lowest?.price])).toEqual([
      ['Drywall 5/8 Type X', 'L n W', 1150],
      ['Metal studs 20ga', 'L n W', 940],
      ['J track 20ga', 'BuildCo', 500],
    ])
  })

  it('detects missing quotes and recommends cheapest vendors while ignoring missing lead times', () => {
    const wb = workbook()

    expect(detectMissingQuotes(wb, 'Vendor Quotes')).toEqual([
      { row: 3, item: 'Metal studs 20ga', vendorName: 'BuildCo', column: 'BuildCo Price' },
      { row: 5, item: 'Fasteners', vendorName: 'L n W', column: 'L n W Price' },
    ])
    expect(recommendVendor(wb, {
      sheet: 'Vendor Quotes',
      ignoreMissingLeadTimes: true,
      excludeTotalQuotes: true,
    }).map((row) => [row.item, row.recommendation])).toEqual([
      ['Drywall 5/8 Type X', 'L n W'],
      ['Metal studs 20ga', 'L n W'],
      ['J track 20ga', 'BuildCo'],
      ['Fasteners', 'BuildCo'],
      ['Insulation rolls', 'L n W'],
    ])
  })

  it('creates a risk-scored patch preview, applies a Qty kLF column, verifies row stability, logs audit events, and rolls back', () => {
    const wb = workbook()
    const patch = createWorkbookPatch(wb, {
      patchId: 'patch-qty-klf',
      summary: 'Add Qty (k LF) converted from Qty.',
      operations: [{
        op: 'add_column',
        sheet: 'Vendor Quotes',
        after: 'Qty',
        name: 'Qty (k LF)',
        values: [12.5, 8, 4.5, 0.6, 0.04, 0.001],
      }],
    })

    expect(patch).toMatchObject({
      patch_id: 'patch-qty-klf',
      risk_level: 'medium',
      requires_approval: true,
      preview: {
        changed_cells: 6,
        sample_before_after: [{ sheet: 'Vendor Quotes', column: 'Qty (k LF)', after: { 'Qty (k LF)': 12.5 } }],
      },
      verification: { ok: true },
    })

    const applied = applyWorkbookPatch(wb, patch, { approved: true, now: '2026-05-12T12:01:00.000Z' })
    expect(applied.verification).toMatchObject({ ok: true })
    expect(readRange(wb, 'Vendor Quotes', 'A1:E2')).toEqual([
      ['Item', 'Description', 'Qty', 'Qty (k LF)', 'Unit'],
      ['X', 'Drywall 5/8 Type X', '12,500 LF', 12.5, 'LF'],
    ])
    expect(wb.auditLog.map((event) => event.action)).toEqual(['inspect_workbook', 'create_patch', 'apply_patch'])
    expect(wb.versions).toHaveLength(2)

    rollbackWorkbookPatch(wb, 'patch-qty-klf', { now: '2026-05-12T12:02:00.000Z' })
    expect(readRange(wb, 'Vendor Quotes', 'A1:E2')).toEqual([
      ['Item', 'Description', 'Qty', 'Unit', 'Acme Price'],
      ['X', 'Drywall 5/8 Type X', '12,500 LF', 'LF', '$1,200'],
    ])
    expect(wb.auditLog.at(-1)).toMatchObject({ action: 'rollback_patch', patchId: 'patch-qty-klf' })
  })

  it('creates cheapest highlight, recommendation, formula, formatting, and summary-sheet patches without mutating until approved', () => {
    const wb = workbook()
    const lowest = findLowestValidQuote(wb, { sheet: 'Vendor Quotes', excludeTotalQuotes: true, requireLeadTime: true })
    const recommendations = recommendVendor(wb, { sheet: 'Vendor Quotes', ignoreMissingLeadTimes: true })
    const patch = createWorkbookPatch(wb, {
      patchId: 'patch-leveling',
      summary: 'Level RFQ quotes with highlights, recommendations, formulas, formatting, and summary.',
      operations: [
        {
          op: 'highlight_cells',
          sheet: 'Vendor Quotes',
          color: 'yellow',
          note: 'Cheapest valid vendor price in row.',
          cells: lowest.flatMap((row) => row.lowest ? [{ row: row.row, column: row.lowest.column }] : []),
        },
        {
          op: 'add_column',
          sheet: 'Vendor Quotes',
          after: 'Notes',
          name: 'Recommendation',
          values: recommendations.map((row) => `${row.recommendation}: ${row.reason}`),
        },
        {
          op: 'add_column',
          sheet: 'Vendor Quotes',
          after: 'Recommendation',
          name: 'Acme Numeric Price',
          values: [1200, 960, 550, 300, 2400, 9500],
        },
        {
          op: 'set_range_formula',
          sheet: 'Vendor Quotes',
          column: 'Acme Numeric Price',
          startRow: 2,
          formulas: ['=VALUE(SUBSTITUTE(E2,"$",""))'],
        },
        { op: 'format_cells', sheet: 'Vendor Quotes', column: 'Acme Numeric Price', format: 'currency' },
        { op: 'create_summary_sheet', sheet: 'Vendor Quotes', name: 'Quote Summary', rows: quoteComparisonSummaryRows(wb, 'Vendor Quotes') },
      ],
    })

    expect(patch.risk_level).toBe('medium')
    expect(patch.preview.changed_cells).toBeGreaterThan(20)
    expect(readRange(wb, 'Vendor Quotes', 'Q1:Q2')).toEqual([['Notes'], ['']])

    applyWorkbookPatch(wb, patch, { approved: true })
    expect(getWorkbookOverview(wb).sheets.map((sheet) => sheet.name)).toContain('Quote Summary')
    expect(findColumn(wb, 'Vendor Quotes', 'Recommendation')[0]).toMatchObject({ label: 'Recommendation' })
    expect(searchWorkbook(wb, 'BuildCo: Lowest valid price $500')).toHaveLength(1)
  })

  it('answers broad anomaly and stats queries across missing quotes, outliers, unit mismatches, and package totals', () => {
    const wb = workbook()

    expect(computeBasicStats(wb, { sheet: 'Vendor Quotes', column: 'Acme Price' })).toMatchObject({
      column: 'Acme Price',
      count: 6,
      sum: 14910,
      min: 300,
      max: 9500,
      median: 1080,
    })

    expect(analyzeWorkbookAnomalies(wb, {
      sheet: 'Vendor Quotes',
      expectedUnits: ['LF', 'linear ft', 'ft'],
      outlierPercentAboveMedian: 20,
    })).toMatchObject({
      missingQuotes: [
        { row: 3, item: 'Metal studs 20ga', vendorName: 'BuildCo' },
        { row: 5, item: 'Fasteners', vendorName: 'L n W' },
      ],
      priceOutliers: [
        { row: 2, item: 'Drywall 5/8 Type X', vendorName: 'BuildCo', price: 1500, median: 1200 },
      ],
      unitMismatches: [
        { row: 5, item: 'Fasteners', unit: 'EA' },
        { row: 6, item: 'Insulation rolls', unit: 'rolls' },
        { row: 7, item: 'Project lump sum quote', unit: 'LS' },
      ],
      totalQuoteRows: [{ row: 7, item: 'Project lump sum quote', classification: 'total' }],
    })
  })

  it('creates large-scale generated patches for recommendations, normalized currency, and formula fill', () => {
    const wb = workbook()
    const recommendationPatch = createRecommendationColumnPatch(wb, {
      sheet: 'Vendor Quotes',
      ignoreMissingLeadTimes: true,
      patchId: 'patch-recommendations',
    })
    const normalizedPatch = createNormalizeCurrencyPatch(wb, {
      sheet: 'Vendor Quotes',
      columns: ['Acme Price', 'L n W Price'],
      patchId: 'patch-normalize-currency',
    })

    expect(recommendationPatch).toMatchObject({
      patch_id: 'patch-recommendations',
      risk_level: 'medium',
      requires_approval: true,
      preview: { changed_cells: 5 },
    })
    expect(normalizedPatch.operations).toMatchObject([
      { op: 'add_column', name: 'Acme Price Numeric', values: [1200, 960, 550, 300, 2400, 9500] },
      { op: 'add_column', name: 'L n W Price Numeric', values: [1150, 940, 575, null, 2200, 8900] },
    ])

    applyWorkbookPatch(wb, normalizedPatch, { approved: true })
    const formulaPatch = createFormulaFillPatch(wb, {
      sheet: 'Vendor Quotes',
      column: 'Acme Price Numeric',
      startRow: 2,
      endRow: 7,
      formulaForRow: (row) => `=VALUE(SUBSTITUTE(E${row},"$",""))`,
      patchId: 'patch-formula-fill',
    })

    expect(formulaPatch).toMatchObject({
      patch_id: 'patch-formula-fill',
      risk_level: 'medium',
      requires_approval: true,
      preview: {
        changed_cells: 6,
        sample_before_after: [{ sheet: 'Vendor Quotes', row: 2, column: 'Acme Price Numeric', before: 1200, after: '=VALUE(SUBSTITUTE(E2,"$",""))' }],
      },
    })
  })
})
