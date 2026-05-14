import type { ContractorBid, ContractorRFQ } from '@/lib/types/contractor'
import type { ComparisonHighlight } from './comparison-sheet-state'
import type { ComparisonSheetSnapshot } from './comparison-sheet-snapshot'

export const PRICING_MISTAKE_HIGHLIGHT = '#e9d5ff'

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

function normalizeUnit(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function sourceRow(response: PricePoint) {
  const attribute = response.bid.line_item_responses
    .find((line) => line.line_item_id === response.lineItemId)
    ?.response_attributes
    ?.find((item) => item.key === 'source_row')
  return attribute?.value ? ` Source row ${attribute.value}.` : ''
}

function hasDifferentPriceBasisUnit(point: PricePoint) {
  const response = point.bid.line_item_responses.find((line) => line.line_item_id === point.lineItemId)
  const priceBasis = response?.response_attributes?.find((item) => item.key === 'price_basis')?.value
  if (!priceBasis || !response?.unit) return false
  const match = String(priceBasis).match(/\bper\s+[0-9,.]+\s+([A-Za-z][A-Za-z ]*)$/i)
  if (!match) return false
  return normalizeUnit(match[1]) !== normalizeUnit(response.unit)
}

function highlight(point: PricePoint, metric: 'unit_price' | 'total', note: string): ComparisonHighlight {
  return {
    id: `pricing-mistake-${point.lineItemId}-${point.bid.id}-${metric}`,
    selector: { kind: 'cell', rowKey: point.lineItemId, colKey: `vendor:${point.bid.id}:${metric}` },
    color: PRICING_MISTAKE_HIGHLIGHT,
    note,
  }
}

export function buildQuoteImportAnalyticsHighlights(rfq: ContractorRFQ, bids: ContractorBid[]): ComparisonHighlight[] {
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
    const rowHasSevereSpread = points.length >= 2 && rowMedian > 0 && (
      Math.max(...points.map((point) => point.unitPrice)) / Math.min(...points.map((point) => point.unitPrice)) >= 3
    )

    for (const point of points) {
      const highOutlier = rowMedian > 0 && point.unitPrice / rowMedian >= 3
      const lowOutlier = rowMedian > 0 && rowMedian / point.unitPrice >= 3
      if (rowHasSevereSpread && (highOutlier || lowOutlier)) {
        const note = `Pricing mistake candidate: ${point.bid.vendor_name} unit price ${point.unitPrice.toLocaleString()} is a ${highOutlier ? 'high' : 'low'} outlier against the row median ${rowMedian.toLocaleString()}.${sourceRow(point)} Check whether this was quoted in the wrong unit of measure.`
        for (const metric of ['unit_price', 'total'] as const) {
          const next = highlight(point, metric, note)
          highlights.set(next.id, next)
        }
      }

      if (hasDifferentPriceBasisUnit(point)) {
        const note = `Pricing mistake candidate: imported price basis uses a different unit than the comparison row.${sourceRow(point)} Confirm whether the quote is per package, sheet, square foot, or another unit before comparing.`
        const next = highlight(point, 'unit_price', note)
        highlights.set(next.id, next)
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
