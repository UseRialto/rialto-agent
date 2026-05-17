import type { ContractorBid, ContractorBidLineItemResponse, ContractorRFQ, ContractorRFQLineItem } from '../../types/contractor'
import { createExternalQuoteImport, type ExternalQuoteImportSourceKind } from '../../procurement/external-quote-import'
import type { ProcurementLineItemAttribute } from '../../types/procurement'

export interface VendorQuoteDraftInput {
  rfq: ContractorRFQ
  vendorName?: string
  filename: string
  sourceKind: ExternalQuoteImportSourceKind
  text: string
  sourceUrl?: string
  now?: string
}

export interface VendorQuoteDraftResult {
  lineItemResponses: ContractorBidLineItemResponse[]
  warnings: Array<{ message: string }>
  unmatchedRows: VendorQuoteDraftUnmatchedRow[]
}

export interface VendorQuoteDraftUnmatchedRow {
  id: string
  filename: string
  sourceRow?: number
  sku: string
  description: string
  quantity?: number
  unit?: string
  unitPrice?: number
  totalPrice?: number
  leadTimeDays?: number
  notes?: string
  matchReviewReason?: string
}

function key(value: string | undefined) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function textTokens(value: string | undefined) {
  return new Set(String(value ?? '').toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])
}

function overlapScore(left: string | undefined, right: string | undefined) {
  const leftTokens = textTokens(left)
  const rightTokens = textTokens(right)
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0
  let shared = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1
  }
  return shared / Math.max(leftTokens.size, rightTokens.size)
}

function requestedCoverageScore(requested: string | undefined, imported: string | undefined) {
  const requestedTokens = textTokens(requested)
  const importedTokens = textTokens(imported)
  if (requestedTokens.size === 0 || importedTokens.size === 0) return 0
  let shared = 0
  for (const token of requestedTokens) {
    if (importedTokens.has(token)) shared += 1
  }
  return shared / requestedTokens.size
}

function normalizeDetailValue(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/feet|foot/g, 'ft')
    .replace(/inches|inch/g, 'in')
    .replace(/^0+(\d)/, '$1')
}

function productDetailTokens(value: string | undefined) {
  const normalized = String(value ?? '')
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/\bfeet\b|\bfoot\b/g, 'ft')
    .replace(/\binches\b|\binch\b/g, 'in')

  const tokens = new Set<string>()
  const addMatches = (pattern: RegExp, prefix: string, valueIndex = 1) => {
    for (const match of normalized.matchAll(pattern)) {
      const raw = match[valueIndex]
      if (raw) tokens.add(`${prefix}:${normalizeDetailValue(raw)}`)
    }
  }

  const numberOrFraction = String.raw`\d+(?:\.\d+)?(?:-\d+\/\d+)?|\d+\/\d+`
  addMatches(new RegExp(`\\b(${numberOrFraction})\\s*(?:ft|')\\b`, 'g'), 'ft')
  addMatches(new RegExp(`\\b(${numberOrFraction})\\s*(?:in|")\\b`, 'g'), 'in')
  addMatches(/\b(\d+-\d+\/\d+|\d+\/\d+)\b/g, 'in')
  addMatches(/\b(\d+)\s*(?:ga|gauge)\b/g, 'gauge')
  addMatches(/\b(\d+)\s*awg\b/g, 'awg')
  addMatches(/\b(\d+)\s*mil\b/g, 'mil')
  addMatches(/\b(\d+)\s*gal\b/g, 'gal')
  addMatches(/\b(\d+)\s*lb\b/g, 'lb')
  addMatches(/#\s*(\d+)\b/g, 'rebar')
  addMatches(/\bgrade\s*(\d+)\b/g, 'grade')
  addMatches(/\b(\d+\s*x\s*\d+)\b/g, 'grid')
  addMatches(/\bw\s*(\d+)\b/g, 'wire')

  return tokens
}

function missingRequestedProductDetails(requested: ContractorRFQLineItem, imported: ContractorBidLineItemResponse) {
  const requestedDetails = productDetailTokens(requested.description)
  if (requestedDetails.size === 0) return []

  const importedDetails = productDetailTokens(`${imported.description} ${imported.quoted_product_details ?? ''}`)
  const missing: string[] = []
  for (const detail of requestedDetails) {
    if (!importedDetails.has(detail)) missing.push(detail)
  }
  return missing
}

function formatMissingProductDetail(detail: string) {
  const [kind, value] = detail.split(':')
  if (!kind || !value) return detail
  if (kind === 'ft') return `${value} ft`
  if (kind === 'in') return `${value} in`
  if (kind === 'gauge') return `${value} gauge`
  if (kind === 'awg') return `${value} AWG`
  if (kind === 'mil') return `${value} mil`
  if (kind === 'gal') return `${value} gal`
  if (kind === 'lb') return `${value} lb`
  if (kind === 'rebar') return `#${value}`
  if (kind === 'grade') return `grade ${value}`
  if (kind === 'grid') return value.replace('x', ' x ')
  if (kind === 'wire') return `W${value}`
  return value
}

function reviewReasonForAlmostMatch(requested: ContractorRFQLineItem, missingDetails: string[]) {
  const label = requested.sku ? `${requested.sku} - ${requested.description}` : requested.description
  return `Possible match to "${label}", but the quote row is missing requested detail${missingDetails.length === 1 ? '' : 's'}: ${missingDetails.map(formatMissingProductDetail).join(', ')}. Review before applying.`
}

function scoreRequestedLine(item: ContractorRFQLineItem, imported: ContractorBidLineItemResponse) {
  return Math.max(
    overlapScore(item.description, imported.description),
    overlapScore(`${item.sku} ${item.description}`, `${imported.sku} ${imported.description}`),
    requestedCoverageScore(item.description, imported.description),
    requestedCoverageScore(`${item.sku} ${item.description}`, `${imported.sku} ${imported.description}`),
  )
}

function importedBidForVendor(bids: ContractorBid[], vendorName?: string) {
  const wanted = key(vendorName)
  if (wanted) {
    const exact = bids.find((bid) => key(bid.vendor_name) === wanted)
    if (exact) return exact
    const loose = bids.find((bid) => key(bid.vendor_name).includes(wanted) || wanted.includes(key(bid.vendor_name)))
    if (loose) return loose
  }
  return bids[0]
}

function matchRequestedLine(
  requested: ContractorRFQLineItem[],
  imported: ContractorBidLineItemResponse,
  alreadyMatched: Set<string>,
): { item: ContractorRFQLineItem, reviewReason?: undefined } | { item?: undefined, reviewReason?: string } {
  const importedSku = key(imported.sku)
  if (importedSku) {
    const skuMatch = requested.find((item) => !alreadyMatched.has(item.id) && key(item.sku) === importedSku)
    if (skuMatch) return { item: skuMatch }
  }

  const candidates = requested
    .filter((item) => !alreadyMatched.has(item.id))
    .map((item) => ({
      item,
      score: scoreRequestedLine(item, imported),
      missingDetails: missingRequestedProductDetails(item, imported),
    }))
    .sort((a, b) => b.score - a.score)

  const best = candidates[0]
  if (!best || best.score < 0.55) return {}
  if (best.missingDetails.length > 0) {
    return { reviewReason: reviewReasonForAlmostMatch(best.item, best.missingDetails) }
  }
  return { item: best.item }
}

function sourceAttributes(filename: string, imported: ContractorBidLineItemResponse, sourceUrl?: string): ProcurementLineItemAttribute[] {
  return [
    ...(imported.response_attributes ?? []),
    {
      key: 'vendor_quote_source',
      label: 'Vendor Quote Source',
      value: filename,
      source: 'spreadsheet' as const,
      order: 9_000,
    },
    ...(sourceUrl ? [{
      key: 'source_url',
      label: 'Source URL',
      value: sourceUrl,
      source: 'spreadsheet' as const,
      order: 9_001,
    }] : []),
  ]
}

function parseLeadTimeDays(value: string) {
  const match = value.match(/(\d+)\s*(day|days|week|weeks|business days)/i)
  if (!match) return 0
  const qty = Number(match[1])
  if (!Number.isFinite(qty)) return 0
  return match[2].toLowerCase().startsWith('week') ? qty * 7 : qty
}

function unmatchedRowFromImportedLine(
  filename: string,
  imported: ContractorBidLineItemResponse,
  index: number,
  matchReviewReason?: string,
): VendorQuoteDraftUnmatchedRow {
  return {
    id: `unmatched-${index + 1}`,
    filename,
    sku: imported.sku,
    description: imported.description || imported.sku || 'Unmatched quote row',
    quantity: imported.quoted_quantity ?? imported.quantity,
    unit: imported.unit,
    unitPrice: imported.unit_price,
    totalPrice: imported.total_price,
    leadTimeDays: imported.lead_time_days,
    notes: imported.notes,
    matchReviewReason,
  }
}

function unmatchedRowFromInlineLine(
  filename: string,
  line: string,
  sourceName: string,
  index: number,
  quantity: number,
  unit: string,
  unitPrice: number,
  leadTimeDays: number,
  matchReviewReason?: string,
): VendorQuoteDraftUnmatchedRow {
  return {
    id: `unmatched-inline-${index + 1}`,
    filename,
    sku: '',
    description: sourceName || line,
    quantity: quantity || undefined,
    unit: unit || undefined,
    unitPrice,
    totalPrice: quantity > 0 ? Number((quantity * unitPrice).toFixed(2)) : unitPrice,
    leadTimeDays,
    notes: line,
    matchReviewReason,
  }
}

function moneyValue(value: string | undefined) {
  const parsed = Number.parseFloat(String(value ?? '').replace(/[^0-9.]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function parseInlineQuoteResponses(input: VendorQuoteDraftInput): VendorQuoteDraftResult {
  const matchedIds = new Set<string>()
  const warnings: Array<{ message: string }> = [{ message: 'Read quote values from inline email-style text.' }]
  const unmatchedRows: VendorQuoteDraftUnmatchedRow[] = []
  const lineItemResponses = input.text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line && /\$|unit price|qty|quantity/i.test(line))
    .flatMap((line) => {
      const quantity = moneyValue(line.match(/\b(?:qty|quantity)\s*:?\s*([0-9,.]+)/i)?.[1] ?? line.match(/\b([0-9,.]+)\s+(?:ea|each|pcs|pc|ft|lf|sf|yd|bag|box|roll|sheet|lb|lbs|ton|tons|gal|gallon)\b/i)?.[1])
      const unit = (line.match(/\b(?:qty|quantity)\s*:?\s*[0-9,.]+\s*(ea|each|pcs|pc|ft|lf|sf|yd|bag|box|roll|sheet|lb|lbs|ton|tons|gal|gallon)\b/i)?.[1] ??
        line.match(/\b(ea|each|pcs|pc|ft|lf|sf|yd|bag|box|roll|sheet|lb|lbs|ton|tons|gal|gallon)\b/i)?.[1] ??
        '').toLowerCase()
      const unitPrice = moneyValue(line.match(/\bunit price\s*:?\s*\$?\s*([0-9,.]+)/i)?.[1] ?? line.match(/\$\s*([0-9,.]+)/)?.[1])
      if (unitPrice <= 0) return []

      const sourceName = line
        .replace(/\b(?:qty|quantity)\s*:?\s*[0-9,.]+\s*(?:ea|each|pcs|pc|ft|lf|sf|yd|bag|box|roll|sheet|lb|lbs|ton|tons|gal|gallon)?/gi, ' ')
        .replace(/\bunit price\s*:?\s*\$?\s*[0-9,.]+/gi, ' ')
        .replace(/\$?\s*[0-9,.]+/g, ' ')
        .replace(/\b\d+\s*(?:day|days|week|weeks|business days)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[,;:-]+|[,;:-]+$/g, '')
        .trim()
      const match = matchRequestedLine(input.rfq.line_items, {
        line_item_id: '',
        sku: '',
        description: sourceName || line,
        quantity,
        quoted_quantity: quantity,
        unit,
        unit_price: unitPrice,
        total_price: quantity > 0 ? Number((quantity * unitPrice).toFixed(2)) : unitPrice,
        lead_time_days: parseLeadTimeDays(line),
        availability: 'can_source',
      }, matchedIds)
      const requested = match.item
      if (!requested) {
        warnings.push({ message: match.reviewReason ?? `Could not match "${sourceName || line}" from ${input.filename} to a requested line item.` })
        unmatchedRows.push(unmatchedRowFromInlineLine(
          input.filename,
          line,
          sourceName,
          unmatchedRows.length,
          quantity,
          unit,
          unitPrice,
          parseLeadTimeDays(line),
          match.reviewReason,
        ))
        return []
      }
      matchedIds.add(requested.id)
      return [{
        line_item_id: requested.id,
        sku: '',
        description: sourceName || requested.description,
        quantity: requested.quantity,
        quoted_quantity: quantity || requested.quantity,
        unit: unit || requested.unit,
        unit_price: unitPrice,
        total_price: quantity > 0 ? Number((quantity * unitPrice).toFixed(2)) : Number((requested.quantity * unitPrice).toFixed(2)),
        lead_time_days: parseLeadTimeDays(line),
        availability: 'can_source' as const,
        is_alternate: false,
        notes: line,
        quoted_product_details: sourceName || undefined,
        response_attributes: sourceAttributes(input.filename, {
          line_item_id: requested.id,
          sku: '',
          description: sourceName || requested.description,
          quantity: requested.quantity,
          unit: unit || requested.unit,
          unit_price: unitPrice,
          total_price: quantity > 0 ? Number((quantity * unitPrice).toFixed(2)) : Number((requested.quantity * unitPrice).toFixed(2)),
          lead_time_days: parseLeadTimeDays(line),
          availability: 'can_source',
        }, input.sourceUrl),
      }]
    })

  return {
    lineItemResponses,
    unmatchedRows,
    warnings: [
      ...warnings,
      { message: `Read ${lineItemResponses.length} quote line${lineItemResponses.length === 1 ? '' : 's'} from ${input.filename}. Review extracted product details, quantities, and pricing before submitting.` },
    ],
  }
}

export function buildVendorQuoteDraft(input: VendorQuoteDraftInput): VendorQuoteDraftResult {
  let imported: ReturnType<typeof createExternalQuoteImport>
  try {
    imported = createExternalQuoteImport({
      projectId: input.rfq.project_id,
      projectName: input.rfq.title,
      filename: input.filename,
      sourceKind: input.sourceKind,
      text: input.text,
      sourceUrl: input.sourceUrl,
      now: input.now,
    })
  } catch {
    return parseInlineQuoteResponses(input)
  }
  const bid = importedBidForVendor(imported.bids, input.vendorName)
  if (!bid) {
    return {
      lineItemResponses: [],
      unmatchedRows: [],
      warnings: [{ message: 'No vendor quote lines were found in the uploaded file.' }],
    }
  }

  const matchedIds = new Set<string>()
  const warnings: Array<{ message: string }> = [...imported.warnings]
  const unmatchedRows: VendorQuoteDraftUnmatchedRow[] = []
  const lineItemResponses = bid.line_item_responses.flatMap((line) => {
    const match = matchRequestedLine(input.rfq.line_items, line, matchedIds)
    const requested = match.item
    if (!requested) {
      warnings.push({ message: match.reviewReason ?? `Could not match "${line.description || line.sku}" from ${input.filename} to a requested line item.` })
      unmatchedRows.push(unmatchedRowFromImportedLine(input.filename, line, unmatchedRows.length, match.reviewReason))
      return []
    }
    matchedIds.add(requested.id)
    return [{
      ...line,
      line_item_id: requested.id,
      quantity: requested.quantity,
      quoted_quantity: line.quoted_quantity ?? line.quantity,
      sku: line.sku,
      description: line.description || requested.description,
      quoted_product_details: line.description && line.description !== requested.description ? line.description : line.quoted_product_details,
      response_attributes: sourceAttributes(input.filename, line, input.sourceUrl),
      is_alternate: false,
    }]
  })

  return {
    lineItemResponses,
    unmatchedRows,
    warnings: [
      ...warnings,
      { message: `Read ${lineItemResponses.length} quote line${lineItemResponses.length === 1 ? '' : 's'} from ${input.filename}. Review extracted product details, quantities, and pricing before submitting.` },
    ],
  }
}
