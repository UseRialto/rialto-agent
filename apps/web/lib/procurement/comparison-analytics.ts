import type { ContractorBid, ContractorRFQ } from '@/lib/types/contractor'
import type { ComparisonHighlight } from './comparison-sheet-state'
import type { ComparisonSheetSnapshot } from './comparison-sheet-snapshot'

export const PRICING_MISTAKE_HIGHLIGHT = '#e9d5ff'
export const IMPORT_REVIEW_HIGHLIGHT = '#fee2e2'
export const EMAIL_REVIEW_HIGHLIGHT = '#fee2e2'
export const DEFAULT_MAJOR_UNIT_PRICE_DIFFERENCE_PCT = 30

interface PricePoint {
  bid: ContractorBid
  lineItemId: string
  unitPrice: number
  totalPrice: number
}

function median(values: number[]) {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)
  if (sorted.length === 0) return 0
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function sourceRow(response: PricePoint) {
  const attribute = response.bid.line_item_responses
    .find((line) => line.line_item_id === response.lineItemId)
    ?.response_attributes
    ?.find((item) => item.key === 'source_row')
  return attribute?.value ? ` Source row ${attribute.value}.` : ''
}

function highlight(point: PricePoint, metric: 'unit_price' | 'total', note: string): ComparisonHighlight {
  return {
    id: `pricing-mistake-${point.lineItemId}-${point.bid.id}-${metric}`,
    selector: { kind: 'cell', rowKey: point.lineItemId, colKey: `vendor:${point.bid.id}:${metric}` },
    color: PRICING_MISTAKE_HIGHLIGHT,
    note,
  }
}

export interface ImportReviewMetadata {
  metric: 'unit_price' | 'total'
  category: 'price_basis_conversion' | 'negative_price'
  originalValue: string
  normalizedValue: string
  reason: string
}

interface EmailReviewMetadata {
  category: 'line_match'
  confidence: number
  reason: string
}

export type ReviewHighlightCategory = ImportReviewMetadata['category'] | 'email_line_match'

export function importReviewCategoryLabel(category: ReviewHighlightCategory) {
  if (category === 'price_basis_conversion') return 'Price basis conversions'
  if (category === 'negative_price') return 'Negative price corrections'
  if (category === 'email_line_match') return 'Email reply line matches'
  return category
}

export function parseImportReviewMetadata(value: string | undefined): ImportReviewMetadata | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value) as Partial<ImportReviewMetadata>
    if (
      (parsed.metric === 'unit_price' || parsed.metric === 'total') &&
      (parsed.category === 'price_basis_conversion' || parsed.category === 'negative_price') &&
      typeof parsed.originalValue === 'string' &&
      typeof parsed.normalizedValue === 'string' &&
      typeof parsed.reason === 'string'
    ) {
      return parsed as ImportReviewMetadata
    }
  } catch {
    return undefined
  }
  return undefined
}

function importReviewHighlightId(input: { lineItemId: string; bidId: string; metric: ImportReviewMetadata['metric']; category: ImportReviewMetadata['category'] }) {
  return `import-review-${input.category}-${input.lineItemId}-${input.bidId}-${input.metric}`
}

export function importReviewCategoryFromHighlightId(id: string): ReviewHighlightCategory | undefined {
  if (id.startsWith('import-review-price_basis_conversion-')) return 'price_basis_conversion'
  if (id.startsWith('import-review-negative_price-')) return 'negative_price'
  if (id.startsWith('email-review-line_match-')) return 'email_line_match'
  return undefined
}

function parseEmailReviewMetadata(value: string | undefined): EmailReviewMetadata | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value) as Partial<EmailReviewMetadata>
    if (
      parsed.category === 'line_match' &&
      typeof parsed.confidence === 'number' &&
      typeof parsed.reason === 'string'
    ) {
      return parsed as EmailReviewMetadata
    }
  } catch {
    return undefined
  }
  return undefined
}

export function buildQuoteImportReviewHighlights(_rfq: ContractorRFQ, bids: ContractorBid[]): ComparisonHighlight[] {
  const highlights: ComparisonHighlight[] = []
  for (const bid of bids) {
    for (const response of bid.line_item_responses) {
      for (const attribute of response.response_attributes ?? []) {
        if (attribute.key.startsWith('import_review:')) {
          const metadata = parseImportReviewMetadata(attribute.value)
          if (!metadata) continue
          highlights.push({
            id: importReviewHighlightId({
              lineItemId: response.line_item_id,
              bidId: bid.id,
              metric: metadata.metric,
              category: metadata.category,
            }),
            selector: { kind: 'cell', rowKey: response.line_item_id, colKey: `vendor:${bid.id}:${metadata.metric}` },
            color: IMPORT_REVIEW_HIGHLIGHT,
            note: [
              `${importReviewCategoryLabel(metadata.category)}: ${metadata.reason}`,
              `Original: ${metadata.originalValue}.`,
              `Imported comparison value: ${metadata.normalizedValue}.`,
            ].join(' '),
          })
        }
        if (attribute.key.startsWith('email_review:')) {
          const metadata = parseEmailReviewMetadata(attribute.value)
          if (!metadata) continue
          for (const metric of ['unit_price', 'total'] as const) {
            highlights.push({
              id: `email-review-${metadata.category}-${response.line_item_id}-${bid.id}-${metric}`,
              selector: { kind: 'cell', rowKey: response.line_item_id, colKey: `vendor:${bid.id}:${metric}` },
              color: EMAIL_REVIEW_HIGHLIGHT,
              note: `Email reply review: ${metadata.reason} Confidence ${(metadata.confidence * 100).toFixed(0)}%.`,
            })
          }
        }
      }
    }
  }
  return highlights
}

export function buildQuoteImportAnalyticsHighlights(
  rfq: ContractorRFQ,
  bids: ContractorBid[],
  options: { majorUnitPriceDifferencePct?: number } = {},
): ComparisonHighlight[] {
  const majorDifferenceRatio = Math.max(0, (options.majorUnitPriceDifferencePct ?? DEFAULT_MAJOR_UNIT_PRICE_DIFFERENCE_PCT) / 100)
  const highlights = new Map<string, ComparisonHighlight>()
  for (const item of rfq.line_items) {
    const points: PricePoint[] = bids.flatMap((bid) => {
      const response = bid.line_item_responses.find((line) => line.line_item_id === item.id)
      if (!response || response.availability === 'unavailable' || response.unit_price <= 0) return []
      return [{
        bid,
        lineItemId: item.id,
        unitPrice: response.unit_price,
        totalPrice: response.total_price,
      }]
    })

    const rowMedian = median(points.map((point) => point.unitPrice))
    const rowHasMajorSpread = points.length >= 2 && rowMedian > 0 && (
      Math.max(...points.map((point) => point.unitPrice)) / Math.min(...points.map((point) => point.unitPrice)) >= (1 + majorDifferenceRatio)
    )

    for (const point of points) {
      const differenceFromMedian = rowMedian > 0 ? Math.abs(point.unitPrice - rowMedian) / rowMedian : 0
      const highOutlier = rowMedian > 0 && point.unitPrice > rowMedian && differenceFromMedian >= majorDifferenceRatio
      const lowOutlier = rowMedian > 0 && point.unitPrice < rowMedian && differenceFromMedian >= majorDifferenceRatio
      if (rowHasMajorSpread && (highOutlier || lowOutlier)) {
        const note = `Pricing mistake candidate: ${point.bid.vendor_name} unit price ${point.unitPrice.toLocaleString()} is ${(differenceFromMedian * 100).toFixed(0)}% ${highOutlier ? 'above' : 'below'} the row median ${rowMedian.toLocaleString()}. The default major-difference threshold is ${Math.round(majorDifferenceRatio * 100)}%.${sourceRow(point)} Check quantity, price basis, and product equivalency before ranking.`
        for (const metric of ['unit_price', 'total'] as const) {
          const next = highlight(point, metric, note)
          highlights.set(next.id, next)
        }
      }

    }

    if (points.length >= 2) {
      const sortedByTotal = points
        .filter((point) => Number.isFinite(point.totalPrice) && point.totalPrice > 0)
        .sort((a, b) => a.totalPrice - b.totalPrice)
      const low = sortedByTotal[0]
      const high = sortedByTotal[sortedByTotal.length - 1]
      if (low && high && high.totalPrice > low.totalPrice) {
        const spread = high.totalPrice - low.totalPrice
        const spreadRatio = high.totalPrice / low.totalPrice
        const medianTotal = median(sortedByTotal.map((point) => point.totalPrice))
        const bigQuantitySpread = item.quantity >= 100 && spread >= 500 && spreadRatio >= (1 + majorDifferenceRatio)
        const bigDollarSpread = medianTotal >= 1000 && spread >= 1000 && spreadRatio >= (1 + majorDifferenceRatio)
        if (bigQuantitySpread || bigDollarSpread) {
          const note = `Pricing mistake candidate: major vendor price difference on ${item.description}; ${high.bid.vendor_name} is ${spread.toLocaleString(undefined, { style: 'currency', currency: 'USD' })} above ${low.bid.vendor_name} for a ${item.quantity.toLocaleString()} ${item.unit} line. Confirm quantity, package basis, and product equivalency before ranking.`
          for (const point of [low, high]) {
            const next = highlight(point, 'total', note)
            if (!highlights.has(next.id)) highlights.set(next.id, next)
          }
        }
      }
    }
  }
  return [...highlights.values()]
}

function numericCell(value: string | undefined) {
  const text = String(value ?? '').trim()
  if (!text || /^(?:n\/a|na|tbd|no bid|no-bid|-)$/i.test(text)) return undefined
  const parsed = Number.parseFloat(text.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : undefined
}

export function buildQuoteComparisonSummaryAnswer(snapshot: ComparisonSheetSnapshot): string {
  const rows = snapshot.rows.filter((row) => !row.hidden)
  const priceColumns = snapshot.columns.filter((column) =>
    !column.hidden &&
    column.kind === 'vendor' &&
    (column.metric === 'total' || column.metric === 'unit_price') &&
    column.vendorId
  )
  const vendorIds = [...new Set(priceColumns.map((column) => column.vendorId!).filter(Boolean))]
  const preferredPriceColumnByVendor = new Map<string, typeof priceColumns[number]>()
  for (const vendorId of vendorIds) {
    preferredPriceColumnByVendor.set(
      vendorId,
      priceColumns.find((column) => column.vendorId === vendorId && column.metric === 'total') ??
        priceColumns.find((column) => column.vendorId === vendorId)!,
    )
  }

  const vendorTotals = vendorIds.map((vendorId) => {
    const column = preferredPriceColumnByVendor.get(vendorId)
    const vendorName = snapshot.vendors.find((vendor) => vendor.id === vendorId)?.name ?? column?.vendorName ?? vendorId
    let missing = 0
    let total = 0
    for (const row of rows) {
      const value = numericCell(column ? row.values[column.key] : undefined)
      if (value == null) missing += 1
      else total += value
    }
    return { vendorId, vendorName, missing, total }
  })

  const missingCells = vendorTotals.reduce((sum, vendor) => sum + vendor.missing, 0)
  const possibleCells = rows.length * vendorIds.length
  const completeVendors = vendorTotals.filter((vendor) => vendor.missing === 0)
  const best = completeVendors.sort((a, b) => a.total - b.total)[0]
  const purpleFlags = snapshot.highlights.filter((highlight) => highlight.color.toLowerCase() === PRICING_MISTAKE_HIGHLIGHT).length
  const gapLine = possibleCells
    ? `Gaps: ${missingCells}/${possibleCells} vendor price cells are empty across ${rows.length} item${rows.length === 1 ? '' : 's'}.`
    : 'Gaps: no vendor price columns are visible in this comparison.'
  const bestLine = best
    ? `Best complete price: ${best.vendorName} at ${best.total.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}.`
    : 'Best complete price: no vendor has a fully priced visible quote yet.'
  const reviewLine = purpleFlags
    ? `Review: ${purpleFlags} purple pricing-mistake flag${purpleFlags === 1 ? '' : 's'} need unit-of-measure or outlier review before relying on the ranking.`
    : 'Review: no purple pricing-mistake flags are currently shown.'

  return `${gapLine}\n${bestLine}\n${reviewLine}`
}

export function isQuoteComparisonSummaryRequest(message: string) {
  return /\bsummary\b/i.test(message) ||
    /\bwhat'?s?\s+the\s+gaps?\b/i.test(message) ||
    /\bbest\s+choice\b/i.test(message) ||
    /\bquick\s+summary\b/i.test(message)
}
