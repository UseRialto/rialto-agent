import type { ContractorBid, ContractorRFQ, ContractorRFQLineItem } from '@/lib/types/contractor'

export type ExternalQuoteImportSourceKind = 'pdf' | 'spreadsheet'

export interface ExternalQuoteImportWarning {
  row?: number
  message: string
}

export interface ExternalQuoteImportInput {
  projectId: string
  projectName: string
  filename: string
  sourceKind: ExternalQuoteImportSourceKind
  text: string
  now?: string
}

export interface ExternalQuoteImportResult {
  rfq: ContractorRFQ
  bid: ContractorBid
  warnings: ExternalQuoteImportWarning[]
}

interface ParsedQuoteLine {
  sourceRow: number
  itemNumber: string
  sku: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  pricePerQuantity?: number
  pricePerUnit?: string
  totalPrice: number
  rawText: string
}

function compact(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function idPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 44) || 'import'
}

function numberFromText(value: string) {
  const negative = /^\s*-/.test(value)
  const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(parsed)) return 0
  return negative ? -parsed : parsed
}

function moneyFromText(value: string) {
  return numberFromText(value.replace(/\$\s*/g, ''))
}

function normalizeSku(value: string) {
  return compact(value)
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, '')
}

function normalizeUnit(value: string) {
  const unit = value.trim().toLowerCase()
  if (unit === 'each') return 'ea'
  if (unit === 'tube') return 'tube'
  if (unit === 'bundle') return 'bundle'
  return unit
}

function titleFromFilename(filename: string) {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/^\d+\s*-\s*/, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Imported Quote Comparison'
}

function extractSupplier(text: string) {
  const match = text.match(/\bSupplier\s*:\s*(.+?)\s+Expected\s+Delivery\s+Date\s*:/i)
  return compact(match?.[1] ?? '') || 'Imported Vendor'
}

function extractQuoteTitle(text: string, filename: string) {
  const projectMatch = text.match(/\b(\d+\s*-\s*MCRD\s+P\s*-\s*\d+)\s+Company\s*:/i)
  const bidMatch = text.match(/\bBid\s*:\s*(.+?)\s+Job\s+Site\s*:/i)
  const project = compact(projectMatch?.[1] ?? '')
  const bid = compact(bidMatch?.[1] ?? '')
  if (project && bid) return `${project} - ${bid}`
  return titleFromFilename(filename)
}

function extractExpectedDate(text: string) {
  const match = text.match(/Expected\s+Delivery\s+Date\s*:\s*([0-9]{1,2})\s*\/\s*([0-9]{1,2})\s*\/\s*([0-9]{4})/i)
  if (!match) return undefined
  const [, month, day, year] = match
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function parseQuoteLine(rawLine: string, sourceRow: number): ParsedQuoteLine | null {
  const line = compact(rawLine)
  const prefix = line.match(/^(\d+)\s+([A-Z0-9]+(?:\s*-\s*[A-Z0-9]+)?[A-Z0-9]*)\s+(.+)$/i)
  if (!prefix) return null

  const rest = prefix[3]
  const priced = rest.match(/^(.*?)\s+(-?\s*[0-9][0-9,]*\.[0-9]+)\s+([A-Za-z]+)\s+([0-9][0-9,]*\.[0-9]+)\s+(.+?)\s+(-?\s*\$?\s*[0-9][0-9,]*\.[0-9]{2})$/)
  if (!priced) return null

  const [, descriptionChunk, quantityText, unit, unitPriceText, priceBasisText, totalText] = priced
  const priceBasis = compact(priceBasisText).match(/([0-9][0-9,]*\.[0-9]+)\s+([A-Za-z]+)$/)
  return {
    sourceRow,
    itemNumber: prefix[1],
    sku: normalizeSku(prefix[2]),
    description: compact(descriptionChunk),
    quantity: numberFromText(quantityText),
    unit: normalizeUnit(unit),
    unitPrice: numberFromText(unitPriceText),
    pricePerQuantity: priceBasis ? numberFromText(priceBasis[1]) : undefined,
    pricePerUnit: priceBasis ? normalizeUnit(priceBasis[2]) : undefined,
    totalPrice: moneyFromText(totalText),
    rawText: line,
  }
}

function parseQuoteLines(text: string) {
  const lines = text
    .split('\n')
    .map(compact)
    .filter(Boolean)

  return lines
    .map((line, index) => {
      const direct = parseQuoteLine(line, index + 1)
      if (direct) return direct

      const prefix = line.match(/^(\d+)\s+([A-Z0-9]+(?:\s*-\s*[A-Z0-9]+)?[A-Z0-9]*)\s+(.+)$/i)
      if (!prefix) return null
      const sku = normalizeSku(prefix[2])
      const previous = lines[index - 1] ?? ''
      const next = lines[index + 1] ?? ''
      const previousPrefix = previous.match(/^([A-Z0-9]+(?:\s*-\s*[A-Z0-9]+)?[A-Z0-9]*)\s+(.+)$/i)
      const previousDescription = previousPrefix && normalizeSku(previousPrefix[1]) === sku ? previousPrefix[2] : ''
      const nextContinuation = next && !/^\d+\s+/.test(next) && !/^\d{3}\s+-\s+/.test(next) && !/^L n W Supply/i.test(next)
        ? next
        : ''
      const candidates = [
        `${prefix[1]} ${prefix[2]} ${previousDescription} ${prefix[3]}`,
        `${prefix[1]} ${prefix[2]} ${prefix[3]} ${nextContinuation}`,
        `${prefix[1]} ${prefix[2]} ${previousDescription} ${prefix[3]} ${nextContinuation}`,
      ]
      for (const candidate of candidates) {
        const parsed = parseQuoteLine(compact(candidate), index + 1)
        if (parsed) return parsed
      }
      return null
    })
    .filter((line): line is ParsedQuoteLine => Boolean(line))
}

function lineItemFromParsed(rfqId: string, parsed: ParsedQuoteLine): ContractorRFQLineItem {
  return {
    id: `${rfqId}-line-${parsed.itemNumber}`,
    sku: parsed.sku,
    description: parsed.description,
    quantity: parsed.quantity,
    unit: parsed.unit,
    notes: parsed.pricePerQuantity && parsed.pricePerUnit
      ? `Imported quote price basis: ${parsed.unitPrice.toLocaleString()} per ${parsed.pricePerQuantity.toLocaleString()} ${parsed.pricePerUnit}.`
      : undefined,
  }
}

export function createExternalQuoteImport(input: ExternalQuoteImportInput): ExternalQuoteImportResult {
  const now = input.now ?? new Date().toISOString()
  const supplier = extractSupplier(input.text)
  const title = extractQuoteTitle(input.text, input.filename)
  const rfqId = `rfq-import-${idPart(title)}-${idPart(now)}`
  const bidId = `bid-import-${idPart(supplier)}-${idPart(now)}`
  const parsedLines = parseQuoteLines(input.text)

  if (parsedLines.length === 0) {
    throw new Error('No priced quote rows were found in this import.')
  }

  const lineItems = parsedLines.map((line) => lineItemFromParsed(rfqId, line))
  const lineByItemNumber = new Map(parsedLines.map((line, index) => [line.itemNumber, lineItems[index]]))
  const bidLines = parsedLines.map((line) => {
    const item = lineByItemNumber.get(line.itemNumber)!
    return {
      line_item_id: item.id,
      sku: line.sku,
      description: line.description,
      quantity: line.quantity,
      quoted_quantity: line.quantity,
      unit: line.unit,
      unit_price: line.unitPrice,
      total_price: line.totalPrice,
      lead_time_days: 0,
      availability: 'can_source' as const,
      notes: `Imported from ${input.filename}, source row ${line.sourceRow}.`,
      response_attributes: [
        {
          key: 'source_row',
          label: 'Source Row',
          value: String(line.sourceRow),
          source: 'spreadsheet' as const,
          order: 1,
        },
        ...(line.pricePerQuantity && line.pricePerUnit ? [{
          key: 'price_basis',
          label: 'Price Basis',
          value: `${line.unitPrice} per ${line.pricePerQuantity} ${line.pricePerUnit}`,
          source: 'spreadsheet' as const,
          order: 2,
        }] : []),
      ],
    }
  })

  const rfq: ContractorRFQ = {
    id: rfqId,
    project_id: input.projectId,
    title,
    request_type: 'rfq',
    status: 'active',
    category: undefined,
    rfp_details: {
      attachments_summary: `Created by External Quote Import from ${input.filename}.`,
      delivery_window: extractExpectedDate(input.text),
    },
    procurement_requirements: [],
    commodity_watch: [],
    risk_flags: [],
    vendor_response_fields: [],
    attachment_urls: [],
    line_items: lineItems,
    invites: [{
      vendor_email: '',
      vendor_name: supplier,
      on_platform: false,
    }],
    invited_vendor_ids: [],
    invited_vendor_emails: [],
    visibility: 'invited_only',
    bid_deadline: extractExpectedDate(input.text),
    created_at: now,
    published_at: now,
  }

  const bid: ContractorBid = {
    id: bidId,
    rfq_id: rfqId,
    vendor_name: supplier,
    is_invited: true,
    is_on_platform: false,
    submitted_at: now,
    total_price: Number(bidLines.reduce((sum, line) => sum + line.total_price, 0).toFixed(2)),
    currency: 'USD',
    lead_time_days: 0,
    line_item_responses: bidLines,
    notes: `Imported from ${input.filename}.`,
    status: 'pending',
    source: 'external_workbook',
  }

  return {
    rfq,
    bid,
    warnings: [
      {
        message: 'Imported as a single vendor quote comparison. Review extracted quantities, pricing, and price basis before relying on totals.',
      },
    ],
  }
}
