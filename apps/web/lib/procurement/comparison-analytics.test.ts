import { describe, expect, it } from 'vitest'
import {
  buildQuoteComparisonSummaryAnswer,
  buildQuoteImportAnalyticsHighlights,
  buildQuoteImportReviewHighlights,
  EMAIL_REVIEW_HIGHLIGHT,
  IMPORT_REVIEW_HIGHLIGHT,
  importReviewCategoryFromHighlightId,
  importReviewCategoryLabel,
  PRICING_MISTAKE_HIGHLIGHT,
} from './comparison-analytics'
import type { ContractorBid, ContractorRFQ } from '@/lib/types/contractor'
import type { ComparisonSheetSnapshot } from './comparison-sheet-snapshot'

const rfq: ContractorRFQ = {
  id: 'rfq-1',
  project_id: 'project-1',
  title: 'Drywall comparison',
  status: 'active',
  line_items: [
    { id: 'line-drywall', sku: 'GWB-58', description: '5/8 Type X Drywall', quantity: 100, unit: 'sheet' },
    { id: 'line-screws', sku: 'SCREW', description: 'Drywall screws', quantity: 10, unit: 'box' },
  ],
  invited_vendor_ids: [],
  invited_vendor_emails: [],
  visibility: 'invited_only',
  created_at: '2026-05-14T12:00:00.000Z',
}

function bid(id: string, vendorName: string, unitPrices: Record<string, number>): ContractorBid {
  const itemById = new Map(rfq.line_items.map((item) => [item.id, item]))
  const responses = Object.entries(unitPrices).map(([lineItemId, unitPrice]) => {
    const item = itemById.get(lineItemId)!
    return {
      line_item_id: lineItemId,
      sku: lineItemId,
      description: lineItemId,
      quantity: item.quantity,
      quoted_quantity: item.quantity,
      unit: item.unit,
      unit_price: unitPrice,
      total_price: Number((unitPrice * item.quantity).toFixed(2)),
      lead_time_days: 0,
      availability: 'can_source' as const,
      is_alternate: false,
    }
  })
  return {
    id,
    rfq_id: rfq.id,
    vendor_name: vendorName,
    is_invited: true,
    is_on_platform: false,
    submitted_at: '2026-05-14T12:00:00.000Z',
    total_price: responses.reduce((sum, response) => sum + response.total_price, 0),
    currency: 'USD',
    lead_time_days: 0,
    line_item_responses: responses,
    status: 'pending',
    source: 'external_workbook',
  }
}

describe('comparison analytics', () => {
  it('builds light red import review highlights from importer normalization metadata', () => {
    const reviewedBid = bid('vendor-review', 'Review Supply', { 'line-drywall': 1.1 })
    reviewedBid.line_item_responses[0].response_attributes = [{
      key: 'import_review:unit_price:price_basis_conversion',
      label: 'Import Review: Price Basis Conversion',
      value: JSON.stringify({
        metric: 'unit_price',
        category: 'price_basis_conversion',
        originalValue: '$1,100.00 per 1,000 lf',
        normalizedValue: '$1.10 per lf',
        reason: 'Rialto normalized the quoted unit price.',
      }),
      source: 'system',
    }]

    const highlights = buildQuoteImportReviewHighlights(rfq, [reviewedBid])

    expect(highlights).toEqual([expect.objectContaining({
      id: expect.stringContaining('import-review-price_basis_conversion-line-drywall-vendor-review-unit_price'),
      selector: { kind: 'cell', rowKey: 'line-drywall', colKey: 'vendor:vendor-review:unit_price' },
      color: IMPORT_REVIEW_HIGHLIGHT,
      note: expect.stringContaining('Original: $1,100.00 per 1,000 lf.'),
    })])
  })

  it('builds light red review highlights from uncertain email reply extraction metadata', () => {
    const reviewedBid = bid('vendor-email', 'Email Supply', { 'line-drywall': 12.5 })
    reviewedBid.source = 'email'
    reviewedBid.status = 'under_review'
    reviewedBid.line_item_responses[0].response_attributes = [{
      key: 'email_review:line_match',
      label: 'Email Reply Review',
      value: JSON.stringify({
        category: 'line_match',
        confidence: 0.71,
        reason: 'Confirm this reply attachment matched the requested drywall line.',
      }),
      source: 'system',
    }]

    const highlights = buildQuoteImportReviewHighlights(rfq, [reviewedBid])

    expect(highlights).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'email-review-line_match-line-drywall-vendor-email-unit_price',
        selector: { kind: 'cell', rowKey: 'line-drywall', colKey: 'vendor:vendor-email:unit_price' },
        color: EMAIL_REVIEW_HIGHLIGHT,
        note: expect.stringContaining('Confirm this reply attachment matched the requested drywall line.'),
      }),
      expect.objectContaining({
        id: 'email-review-line_match-line-drywall-vendor-email-total',
        selector: { kind: 'cell', rowKey: 'line-drywall', colKey: 'vendor:vendor-email:total' },
      }),
    ]))
    expect(importReviewCategoryFromHighlightId('email-review-line_match-line-drywall-vendor-email-unit_price')).toBe('email_line_match')
    expect(importReviewCategoryLabel('email_line_match')).toBe('Email reply line matches')
  })

  it('does not build purple pricing mistake highlights for different-unit price basis metadata', () => {
    const reviewedBid = bid('vendor-review', 'Review Supply', { 'line-drywall': 24 })
    reviewedBid.line_item_responses[0].response_attributes = [
      {
        key: 'source_row',
        label: 'Source Row',
        value: '337',
        source: 'spreadsheet',
      },
      {
        key: 'price_basis',
        label: 'Price Basis',
        value: '24 per 1 box',
        source: 'spreadsheet',
      },
      {
        key: 'import_review:unit_price:price_basis_conversion',
        label: 'Import Review: Price Basis Conversion',
        value: JSON.stringify({
          metric: 'unit_price',
          category: 'price_basis_conversion',
          originalValue: '$24.00 per 1 box',
          normalizedValue: '$24.00 per sheet',
          reason: 'The imported quote used a different price basis unit.',
        }),
        source: 'system',
      },
    ]

    expect(buildQuoteImportReviewHighlights(rfq, [reviewedBid])).toEqual([expect.objectContaining({
      color: IMPORT_REVIEW_HIGHLIGHT,
      note: expect.stringContaining('different price basis unit'),
    })])
    expect(buildQuoteImportAnalyticsHighlights(rfq, [reviewedBid])).toEqual([])
  })

  it('builds purple import highlights for severe unit price outliers', () => {
    const highlights = buildQuoteImportAnalyticsHighlights(rfq, [
      bid('vendor-a', 'A Supply', { 'line-drywall': 18, 'line-screws': 40 }),
      bid('vendor-b', 'B Supply', { 'line-drywall': 19, 'line-screws': 42 }),
      bid('vendor-c', 'C Supply', { 'line-drywall': 1.75, 'line-screws': 41 }),
    ])

    expect(highlights).toEqual(expect.arrayContaining([
      expect.objectContaining({
        selector: { kind: 'cell', rowKey: 'line-drywall', colKey: 'vendor:vendor-c:unit_price' },
        color: PRICING_MISTAKE_HIGHLIGHT,
        note: expect.stringContaining('default major-difference threshold is 30%'),
      }),
      expect.objectContaining({
        selector: { kind: 'cell', rowKey: 'line-drywall', colKey: 'vendor:vendor-c:total' },
        color: PRICING_MISTAKE_HIGHLIGHT,
      }),
    ]))
    expect(highlights.some((highlight) => highlight.selector.kind === 'cell' && highlight.selector.rowKey === 'line-screws')).toBe(false)
  })

  it('flags major vendor differences on large quantity or high dollar line items', () => {
    const highlights = buildQuoteImportAnalyticsHighlights(rfq, [
      bid('vendor-a', 'A Supply', { 'line-drywall': 18, 'line-screws': 40 }),
      bid('vendor-b', 'B Supply', { 'line-drywall': 26, 'line-screws': 42 }),
    ])

    expect(highlights).toEqual(expect.arrayContaining([
      expect.objectContaining({
        selector: { kind: 'cell', rowKey: 'line-drywall', colKey: 'vendor:vendor-a:total' },
        color: PRICING_MISTAKE_HIGHLIGHT,
        note: expect.stringContaining('major vendor price difference'),
      }),
      expect.objectContaining({
        selector: { kind: 'cell', rowKey: 'line-drywall', colKey: 'vendor:vendor-b:total' },
        color: PRICING_MISTAKE_HIGHLIGHT,
        note: expect.stringContaining('major vendor price difference'),
      }),
    ]))
    expect(highlights.some((highlight) => highlight.selector.kind === 'cell' && highlight.selector.rowKey === 'line-screws')).toBe(false)
  })

  it('summarizes gaps, best complete price, and purple review flags from a snapshot', () => {
    const snapshot: ComparisonSheetSnapshot = {
      sheetId: 'sheet-1',
      quoteRequestId: rfq.id,
      columns: [
        { key: '__description', label: 'Description', hidden: false },
        { key: 'vendor:a:total', label: 'A Total', kind: 'vendor', vendorId: 'a', vendorName: 'A Supply', metric: 'total', hidden: false },
        { key: 'vendor:b:total', label: 'B Total', kind: 'vendor', vendorId: 'b', vendorName: 'B Supply', metric: 'total', hidden: false },
      ],
      rows: [
        { id: 'line-drywall', description: 'Drywall', hidden: false, values: { 'vendor:a:total': '100', 'vendor:b:total': '90' } },
        { id: 'line-screws', description: 'Screws', hidden: false, values: { 'vendor:a:total': '50', 'vendor:b:total': '' } },
      ],
      vendors: [
        { id: 'a', name: 'A Supply' },
        { id: 'b', name: 'B Supply' },
      ],
      highlights: [{
        id: 'pricing-mistake-line-drywall-b-total',
        selector: { kind: 'cell', rowKey: 'line-drywall', colKey: 'vendor:b:total' },
        color: PRICING_MISTAKE_HIGHLIGHT,
      }],
      hiddenState: { columnKeys: [], rowIds: [] },
      deletedState: { columnKeys: [], rowIds: [] },
    }

    const answer = buildQuoteComparisonSummaryAnswer(snapshot)

    expect(answer).toContain('Gaps: 1/4 vendor price cells are empty')
    expect(answer).toContain('Best complete price: A Supply at $150.00')
    expect(answer).toContain('1 purple pricing-mistake flag')
  })
})
