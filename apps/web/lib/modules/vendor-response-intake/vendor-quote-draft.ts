import type { ContractorBid, ContractorBidLineItemResponse, ContractorRFQ, ContractorRFQLineItem } from '../../types/contractor'
import { createExternalQuoteImport, type ExternalQuoteImportSourceKind } from '../../procurement/external-quote-import'
import type { ProcurementLineItemAttribute } from '../../types/procurement'

export interface VendorQuoteDraftInput {
  rfq: ContractorRFQ
  vendorName?: string
  filename: string
  sourceKind: ExternalQuoteImportSourceKind
  text: string
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
) {
  const importedSku = key(imported.sku)
  if (importedSku) {
    const skuMatch = requested.find((item) => !alreadyMatched.has(item.id) && key(item.sku) === importedSku)
    if (skuMatch) return skuMatch
  }

  const candidates = requested
    .filter((item) => !alreadyMatched.has(item.id))
    .map((item) => ({
      item,
      score: Math.max(
        overlapScore(item.description, imported.description),
        overlapScore(`${item.sku} ${item.description}`, `${imported.sku} ${imported.description}`),
      ),
    }))
    .sort((a, b) => b.score - a.score)

  return candidates[0]?.score >= 0.35 ? candidates[0].item : undefined
}

function sourceAttributes(filename: string, imported: ContractorBidLineItemResponse): ProcurementLineItemAttribute[] {
  return [
    ...(imported.response_attributes ?? []),
    {
      key: 'vendor_quote_source',
      label: 'Vendor Quote Source',
      value: filename,
      source: 'spreadsheet' as const,
      order: 9_000,
    },
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
      const requested = matchRequestedLine(input.rfq.line_items, {
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
      if (!requested) {
        warnings.push({ message: `Could not match "${sourceName || line}" from ${input.filename} to a requested line item.` })
        unmatchedRows.push(unmatchedRowFromInlineLine(
          input.filename,
          line,
          sourceName,
          unmatchedRows.length,
          quantity,
          unit,
          unitPrice,
          parseLeadTimeDays(line),
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
        }),
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
    const requested = matchRequestedLine(input.rfq.line_items, line, matchedIds)
    if (!requested) {
      warnings.push({ message: `Could not match "${line.description || line.sku}" from ${input.filename} to a requested line item.` })
      unmatchedRows.push(unmatchedRowFromImportedLine(input.filename, line, unmatchedRows.length))
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
      response_attributes: sourceAttributes(input.filename, line),
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
