import type { ContractorBid, ContractorRFQ, ContractorRFQLineItem } from '@/lib/types/contractor'
import type { ExternalQuoteSemanticMatch } from './external-quote-semantic-match'
import { z } from 'zod'

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
  sourceUrl?: string
  now?: string
}

export interface ExternalQuoteImportResult {
  rfq: ContractorRFQ
  bid: ContractorBid
  bids: ContractorBid[]
  warnings: ExternalQuoteImportWarning[]
}

export interface ExternalQuoteImportFileInput {
  filename: string
  sourceKind: ExternalQuoteImportSourceKind
  text: string
  sourceUrl?: string
}

export interface ExternalQuoteImportBatchInput {
  projectId: string
  projectName: string
  title: string
  files: ExternalQuoteImportFileInput[]
  now?: string
}

export interface ExternalQuoteImportMergeInput {
  targetRfq: ContractorRFQ
  existingBids: ContractorBid[]
  imported: ExternalQuoteImportResult
  semanticMatches?: ExternalQuoteSemanticMatch[]
  now?: string
}

export interface ExternalQuoteImportMergeResult {
  rfq: ContractorRFQ
  addedLineItems: ContractorRFQLineItem[]
  bids: ContractorBid[]
  warnings: ExternalQuoteImportWarning[]
}

interface ParsedQuoteLine {
  sourceRow: number
  itemNumber: string
  sku: string
  description: string
  descriptionFromSourceColumn?: boolean
  quantity: number
  unit: string
  unitPrice: number
  pricePerQuantity?: number
  pricePerUnit?: string
  totalPrice: number
  leadTimeDays?: number
  rawText: string
}

interface GenericParsedLineItem {
  itemNumber: string
  sku: string
  description: string
  quantity: number
  unit: string
}

interface GenericParsedBidLine {
  lineItemKey: string
  sku: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  totalPrice: number
  leadTimeDays: number
  sourceRow: number
  notes?: string
}

interface GenericParsedBid {
  vendorName: string
  lines: GenericParsedBidLine[]
}

interface GenericParsedImport {
  lineItems: GenericParsedLineItem[]
  bids: GenericParsedBid[]
  warnings: ExternalQuoteImportWarning[]
}

const signedMoneyTokenPattern = String.raw`(?:[-+]?\s*\$?\s*[0-9][0-9,.]*|\$\s*[-+]?\s*[0-9][0-9,.]*|\(\s*\$?\s*[0-9][0-9,.]*\s*\))`
const compactQuoteLinePattern = new RegExp(
  String.raw`^(.+)\s+(-?\s*[0-9][0-9,.]*)\s+([A-Za-z]+)\s+(${signedMoneyTokenPattern})\s+(${signedMoneyTokenPattern})\s+([0-9]+\s*d|[0-9]+(?:-[0-9]+)?\s+(?:days?|weeks?))\b`,
  'i',
)
const extractedPdfQuoteLinePattern = new RegExp(
  String.raw`^(.+?)\s*(-?\s*[0-9][0-9,]*(?:\.[0-9]+)?)\s+([A-Za-z]+)\s+(${signedMoneyTokenPattern})\s+(${signedMoneyTokenPattern})\s+([0-9]+\s*d|[0-9]+(?:-[0-9]+)?\s+(?:days?|weeks?))\b`,
  'i',
)

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

function signedNumberFromText(value: string) {
  const text = String(value ?? '').trim()
  const compactText = text.replace(/\s+/g, '')
  const negative = /^-/.test(compactText) || /^\$-/.test(compactText) || /^\(/.test(compactText)
  const parsed = Number.parseFloat(text.replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(parsed)) return undefined
  return negative ? -parsed : parsed
}

function numberFromText(value: string) {
  return signedNumberFromText(value) ?? 0
}

function quoteRowNumberFromText(value: string) {
  return Math.abs(numberFromText(value))
}

function optionalNumberFromText(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const text = String(value ?? '').trim()
  if (!text || /^(?:n\/a|na|tbd|no bid|no-bid)$/i.test(text)) return undefined
  return signedNumberFromText(text)
}

function optionalTableQuantityFromText(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const text = String(value ?? '').trim()
  if (/[A-Za-z]/.test(text)) return undefined
  return optionalNumberFromText(text)
}

function normalizeSku(value: string) {
  return compact(value)
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, '')
}

function normalizeSourceItemCode(value: string) {
  return compact(value)
    .replace(/\s*-\s*/g, '-')
}

function stripLeadingRepeatedSku(description: string, sku: string) {
  const normalizedSkuValue = normalizeSku(sku).toLowerCase()
  const text = compact(description)
  if (!normalizedSkuValue || !text) return text
  const tokens = text.split(/\s+/)
  for (let length = 1; length <= Math.min(tokens.length - 1, 5); length += 1) {
    const prefix = tokens.slice(0, length).join(' ')
    if (normalizeSku(prefix).toLowerCase() === normalizedSkuValue) {
      return compact(tokens.slice(length).join(' '))
    }
  }
  return text
}

function skuLooksLikeSameItem(left: string, right: string) {
  const a = normalizeSku(left)
  const b = normalizeSku(right)
  return Boolean(a && b && (a === b || a.startsWith(b) || b.startsWith(a)))
}

function normalizeUnit(value: string) {
  const unit = value.trim().toLowerCase()
  if (unit === 'each') return 'ea'
  if (unit === 'tube') return 'tube'
  if (unit === 'bundle') return 'bundle'
  if (unit === 'carton') return 'carton'
  if (unit === 'sausage') return 'sausage'
  return unit
}

function unitKey(value: string) {
  return normalizeUnit(value).replace(/[^a-z0-9]+/g, '')
}

function comparisonUnitPrice(parsed: ParsedQuoteLine) {
  if (
    parsed.pricePerQuantity &&
    parsed.pricePerQuantity > 1 &&
    parsed.pricePerUnit &&
    unitKey(parsed.pricePerUnit) === unitKey(parsed.unit)
  ) {
    return Number((parsed.unitPrice / parsed.pricePerQuantity).toFixed(6))
  }
  return parsed.unitPrice
}

function formatImportedMoney(value: number) {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })
}

function importReviewAttribute(input: {
  metric: 'unit_price' | 'total'
  category: 'price_basis_conversion' | 'negative_price'
  originalValue: string
  normalizedValue: string
  reason: string
}) {
  return {
    key: `import_review:${input.metric}:${input.category}`,
    label: input.category === 'negative_price' ? 'Import Review: Negative Price' : 'Import Review: Price Basis Conversion',
    value: JSON.stringify(input),
    source: 'system' as const,
    order: input.category === 'negative_price' ? 8_000 : 8_010,
  }
}

function normalizeImportedPriceValues(input: {
  unitPrice: number
  totalPrice: number
  unit: string
  sourceKind?: 'generic' | 'parsed'
  pricePerQuantity?: number
  pricePerUnit?: string
}) {
  const rawComparisonUnitPrice = input.sourceKind === 'parsed'
    ? comparisonUnitPrice({
        sourceRow: 0,
        itemNumber: '',
        sku: '',
        description: '',
        quantity: 0,
        unit: input.unit,
        unitPrice: input.unitPrice,
        pricePerQuantity: input.pricePerQuantity,
        pricePerUnit: input.pricePerUnit,
        totalPrice: input.totalPrice,
        rawText: '',
      })
    : input.unitPrice
  const attributes: ReturnType<typeof importReviewAttribute>[] = []
  let unitPrice = rawComparisonUnitPrice
  let totalPrice = input.totalPrice

  if (input.sourceKind === 'parsed' && input.pricePerQuantity && input.pricePerUnit) {
    if (
      input.pricePerQuantity > 1 &&
      unitKey(input.pricePerUnit) === unitKey(input.unit) &&
      Math.abs(rawComparisonUnitPrice - input.unitPrice) > 0.000001
    ) {
      attributes.push(importReviewAttribute({
        metric: 'unit_price',
        category: 'price_basis_conversion',
        originalValue: `${formatImportedMoney(input.unitPrice)} per ${input.pricePerQuantity.toLocaleString()} ${input.pricePerUnit}`,
        normalizedValue: `${formatImportedMoney(rawComparisonUnitPrice)} per ${input.unit}`,
        reason: `Rialto normalized the quoted unit price from per ${input.pricePerQuantity.toLocaleString()} ${input.pricePerUnit} to per ${input.unit} so all comparison rows use the requested unit.`,
      }))
    } else if (unitKey(input.pricePerUnit) !== unitKey(input.unit)) {
      attributes.push(importReviewAttribute({
        metric: 'unit_price',
        category: 'price_basis_conversion',
        originalValue: `${formatImportedMoney(input.unitPrice)} per ${input.pricePerQuantity.toLocaleString()} ${input.pricePerUnit}`,
        normalizedValue: `${formatImportedMoney(rawComparisonUnitPrice)} per ${input.unit}`,
        reason: `The imported quote used a different price basis unit (${input.pricePerUnit}) than the comparison row unit (${input.unit}). Rialto preserved the imported comparison value and flagged it for estimator approval.`,
      }))
    }
  }

  if (unitPrice < 0) {
    attributes.push(importReviewAttribute({
      metric: 'unit_price',
      category: 'negative_price',
      originalValue: formatImportedMoney(unitPrice),
      normalizedValue: formatImportedMoney(Math.abs(unitPrice)),
      reason: 'The imported quote showed a negative unit price. Rialto converted it to a positive comparison value and flagged it for estimator review.',
    }))
    unitPrice = Math.abs(unitPrice)
  }

  if (totalPrice < 0) {
    attributes.push(importReviewAttribute({
      metric: 'total',
      category: 'negative_price',
      originalValue: formatImportedMoney(totalPrice),
      normalizedValue: formatImportedMoney(Math.abs(totalPrice)),
      reason: 'The imported quote showed a negative total price. Rialto converted it to a positive comparison value and flagged it for estimator review.',
    }))
    totalPrice = Math.abs(totalPrice)
  }

  return {
    unitPrice: Number(unitPrice.toFixed(6)),
    totalPrice: Number(totalPrice.toFixed(2)),
    attributes,
  }
}

function titleFromFilename(filename: string) {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/^\d+\s*-\s*/, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Imported Quote Comparison'
}

function comparisonKeyForLineItem(
  line: Pick<ContractorRFQLineItem, 'sku' | 'description' | 'quantity' | 'unit'>,
  options: { preserveRepeatedSourceRows?: boolean } = {},
) {
  const sku = normalizeSku(line.sku ?? '').toLowerCase()
  const description = compact(line.description).toLowerCase()
  if (sku && options.preserveRepeatedSourceRows) {
    const quantity = Number.isFinite(line.quantity) ? Number(line.quantity).toFixed(6) : String(line.quantity)
    return `sku:${sku}|desc:${description}|qty:${quantity}|unit:${normalizeUnit(line.unit)}`
  }
  if (sku) return `sku:${sku}|unit:${normalizeUnit(line.unit)}`
  return `desc:${description}|unit:${normalizeUnit(line.unit)}`
}

function textTokens(value: string | undefined) {
  return new Set(String(value ?? '').toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])
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

function importedCoverageScore(requested: string | undefined, imported: string | undefined) {
  const requestedTokens = textTokens(requested)
  const importedTokens = textTokens(imported)
  if (requestedTokens.size === 0 || importedTokens.size === 0) return 0
  let shared = 0
  for (const token of importedTokens) {
    if (requestedTokens.has(token)) shared += 1
  }
  return shared / importedTokens.size
}

function semanticLineMatchScore(existing: ContractorRFQLineItem, imported: ContractorRFQLineItem) {
  if (normalizeUnit(existing.unit) !== normalizeUnit(imported.unit)) return 0
  const existingText = `${existing.sku ?? ''} ${existing.description}`
  const importedText = `${imported.sku ?? ''} ${imported.description}`
  const skuScore = existing.sku && imported.sku && normalizeSku(existing.sku).toLowerCase() === normalizeSku(imported.sku).toLowerCase() ? 1 : 0
  return Math.max(
    skuScore,
    requestedCoverageScore(existing.description, imported.description),
    importedCoverageScore(existing.description, imported.description),
    requestedCoverageScore(existingText, importedText),
    importedCoverageScore(existingText, importedText),
  )
}

function sourceFileAttributes(input: Pick<ExternalQuoteImportInput, 'filename' | 'sourceUrl'>, order = 8_900) {
  return [
    {
      key: 'source_file',
      label: 'Source File',
      value: input.filename,
      source: 'spreadsheet' as const,
      order,
    },
    ...(input.sourceUrl ? [{
      key: 'source_url',
      label: 'Source URL',
      value: input.sourceUrl,
      source: 'spreadsheet' as const,
      order: order + 1,
    }] : []),
  ]
}

function documentTotalFromText(text: string) {
  const matches = [...text.matchAll(/\bTotal\s*:?\s*\$?\s*([0-9][0-9,]*\.[0-9]{2})\b/gi)]
  const value = matches.at(-1)?.[1]
  if (!value) return undefined
  const parsed = Number.parseFloat(value.replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : undefined
}

function totalReconciliationWarnings(text: string, bid: ContractorBid, filename: string): ExternalQuoteImportWarning[] {
  const documentTotal = documentTotalFromText(text)
  if (documentTotal === undefined) return []
  const difference = Number((bid.total_price - documentTotal).toFixed(2))
  if (Math.abs(difference) <= Math.max(1, documentTotal * 0.002)) return []
  return [{
    message: `${filename}: imported bid total ${bid.total_price.toLocaleString(undefined, { style: 'currency', currency: 'USD' })} differs from document total ${documentTotal.toLocaleString(undefined, { style: 'currency', currency: 'USD' })} by ${difference.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}. Review source rows before ranking this quote.`,
  }]
}

function sourceUrlsFromFiles(files: ExternalQuoteImportFileInput[]) {
  return [...new Set(files.map((file) => file.sourceUrl).filter((url): url is string => Boolean(url)))]
}

function uniqueId(base: string, used: Set<string>) {
  let id = base
  let suffix = 2
  while (used.has(id)) {
    id = `${base}-${suffix}`
    suffix += 1
  }
  used.add(id)
  return id
}

function uniqueBidId(base: string, used: Set<string>) {
  return uniqueId(base, used)
}

function extractSupplier(text: string) {
  const match = text.match(/\bSupplier\s*:\s*(.+?)\s+Expected\s+Delivery\s+Date\s*:/i)
  if (match) return compact(match[1]) || 'Imported Vendor'
  const compactPdfVendorMatch = text.match(/\bQty\s+(.+?)\s+Unit\s+Pr\b/i)
  if (compactPdfVendorMatch) return compact(compactPdfVendorMatch[1]) || 'Imported Vendor'
  const rows = delimitedRows(text)
  const supplierHeader = rows.find((row) => headerKey(row.cells[0] ?? '') === 'supplier')
  const nextRow = supplierHeader ? rows.find((row) => row.sourceRow > supplierHeader.sourceRow && row.cells[0]) : undefined
  return compact(nextRow?.cells[0] ?? '') || 'Imported Vendor'
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
  const prefix = line.match(/^(\d+)\s+(\S+(?:\s*-\s*\S+)*)\s+(.+)$/i)
  if (!prefix) return null

  const rest = prefix[3]
  const priced = rest.match(/^(.*?)\s+(-?\s*[0-9][0-9,]*\.[0-9]+)\s+([A-Za-z]+)\s+([0-9][0-9,]*\.[0-9]+)\s+(.+?)\s+(-?\s*\$?\s*[0-9][0-9,]*\.[0-9]{2})$/)
  if (!priced) {
    const noPriceBasis = rest.match(/^(.*?)\s+(-?\s*[0-9][0-9,]*\.[0-9]+)\s+([A-Za-z]+)\s+([0-9][0-9,]*\.[0-9]+)\s+(-?\s*\$?\s*[0-9][0-9,]*\.[0-9]{2})$/)
    if (!noPriceBasis) {
      const noDescription = rest.match(/^(-?\s*[0-9][0-9,]*\.[0-9]+)\s+([A-Za-z]+)\s+([0-9][0-9,]*\.[0-9]+)\s+(.+?)\s+(-?\s*\$?\s*[0-9][0-9,]*\.[0-9]{2})$/)
      if (noDescription) {
        const [, quantityText, unit, unitPriceText, priceBasisText, totalText] = noDescription
        const priceBasis = compact(priceBasisText).match(/([0-9][0-9,]*\.[0-9]+)\s+([A-Za-z]+)$/)
        return {
          sourceRow,
          itemNumber: prefix[1],
          sku: normalizeSku(prefix[2]),
          description: '',
          quantity: quoteRowNumberFromText(quantityText),
          unit: normalizeUnit(unit),
          unitPrice: numberFromText(unitPriceText),
          pricePerQuantity: priceBasis ? quoteRowNumberFromText(priceBasis[1]) : undefined,
          pricePerUnit: priceBasis ? normalizeUnit(priceBasis[2]) : undefined,
          totalPrice: numberFromText(totalText),
          rawText: line,
        }
      }
      const noDescriptionNoPriceBasis = rest.match(/^(-?\s*[0-9][0-9,]*\.[0-9]+)\s+([A-Za-z]+)\s+([0-9][0-9,]*\.[0-9]+)\s+(-?\s*\$?\s*[0-9][0-9,]*\.[0-9]{2})$/)
      if (noDescriptionNoPriceBasis) {
        const [, quantityText, unit, unitPriceText, totalText] = noDescriptionNoPriceBasis
        return {
          sourceRow,
          itemNumber: prefix[1],
          sku: normalizeSku(prefix[2]),
          description: '',
          quantity: quoteRowNumberFromText(quantityText),
          unit: normalizeUnit(unit),
          unitPrice: numberFromText(unitPriceText),
          totalPrice: numberFromText(totalText),
          rawText: line,
        }
      }
      const zeroTotalWithoutUnitPrice = rest.match(/^(.*?)\s+(-?\s*[0-9][0-9,]*\.[0-9]+)\s+([A-Za-z]+)\s+(.+?)\s+(-?\s*\$?\s*0(?:\.00)?)$/)
      if (!zeroTotalWithoutUnitPrice) return null
      const [, descriptionChunk, quantityText, unit, priceBasisText, totalText] = zeroTotalWithoutUnitPrice
      const priceBasis = compact(priceBasisText).match(/([0-9][0-9,]*\.[0-9]+)\s+([A-Za-z]+)$/)
      return {
        sourceRow,
        itemNumber: prefix[1],
        sku: normalizeSku(prefix[2]),
        description: compact(descriptionChunk),
        quantity: quoteRowNumberFromText(quantityText),
        unit: normalizeUnit(unit),
        unitPrice: 0,
        pricePerQuantity: priceBasis ? quoteRowNumberFromText(priceBasis[1]) : undefined,
        pricePerUnit: priceBasis ? normalizeUnit(priceBasis[2]) : undefined,
        totalPrice: numberFromText(totalText),
        rawText: line,
      }
    }
    const [, descriptionChunk, quantityText, unit, unitPriceText, totalText] = noPriceBasis
    return {
      sourceRow,
      itemNumber: prefix[1],
      sku: normalizeSku(prefix[2]),
      description: compact(descriptionChunk),
      quantity: quoteRowNumberFromText(quantityText),
      unit: normalizeUnit(unit),
      unitPrice: numberFromText(unitPriceText),
      totalPrice: numberFromText(totalText),
      rawText: line,
    }
  }

  const [, descriptionChunk, quantityText, unit, unitPriceText, priceBasisText, totalText] = priced
  const priceBasis = compact(priceBasisText).match(/([0-9][0-9,]*\.[0-9]+)\s+([A-Za-z]+)$/)
  return {
    sourceRow,
    itemNumber: prefix[1],
    sku: normalizeSku(prefix[2]),
    description: compact(descriptionChunk),
    quantity: quoteRowNumberFromText(quantityText),
    unit: normalizeUnit(unit),
    unitPrice: numberFromText(unitPriceText),
    pricePerQuantity: priceBasis ? quoteRowNumberFromText(priceBasis[1]) : undefined,
    pricePerUnit: priceBasis ? normalizeUnit(priceBasis[2]) : undefined,
    totalPrice: numberFromText(totalText),
    rawText: line,
  }
}

function parseQuoteLineWithContextQuantity(rawLine: string, sourceRow: number, quantityText: string, unitText: string): ParsedQuoteLine | null {
  const line = compact(rawLine)
  const prefix = line.match(/^(\d+)\s+(\S+(?:\s*-\s*\S+)*)\s+(.+)$/i)
  if (!prefix) return null
  const priced = prefix[3].match(/^(.*?)\s+([0-9][0-9,]*\.[0-9]+)\s+(.+?)\s+(-?\s*\$?\s*[0-9][0-9,]*\.[0-9]{2})$/)
    ?? prefix[3].match(/^([0-9][0-9,]*\.[0-9]+)\s+(.+?)\s+(-?\s*\$?\s*[0-9][0-9,]*\.[0-9]{2})$/)
  const noPriceBasis = priced ? null : prefix[3].match(/^(.*?)\s+([0-9][0-9,]*\.[0-9]+)\s+(-?\s*\$?\s*[0-9][0-9,]*\.[0-9]{2})$/)
  if (!priced && !noPriceBasis) return null
  const descriptionChunk = priced && priced.length === 5 ? priced[1] : ''
  const unitPriceText = priced && priced.length === 5 ? priced[2] : priced?.[1] ?? noPriceBasis?.[2] ?? ''
  const priceBasisText = priced && priced.length === 5 ? priced[3] : priced?.[2] ?? ''
  const totalText = priced && priced.length === 5 ? priced[4] : priced?.[3] ?? noPriceBasis?.[3] ?? ''
  const priceBasis = compact(priceBasisText).match(/([0-9][0-9,]*\.[0-9]+)\s+([A-Za-z]+)$/)
  return {
    sourceRow,
    itemNumber: prefix[1],
    sku: normalizeSku(prefix[2]),
    description: compact(descriptionChunk),
    quantity: quoteRowNumberFromText(quantityText),
    unit: normalizeUnit(unitText),
    unitPrice: numberFromText(unitPriceText),
    pricePerQuantity: priceBasis ? quoteRowNumberFromText(priceBasis[1]) : undefined,
    pricePerUnit: priceBasis ? normalizeUnit(priceBasis[2]) : undefined,
    totalPrice: numberFromText(totalText),
    rawText: compact(`${quantityText} ${unitText} ${line}`),
  }
}

function stripTrailingTableQuantity(value: string) {
  return compact(value.replace(/\s+-?\s*[0-9][0-9,]*\.[0-9]+$/, ''))
}

function stripTrailingUnit(value: string) {
  return compact(value.replace(/\s+(?:LF|EA|SF|SY|CY|Tube|Bundle|Box|Bag|Pail|Pal|Each|Roll|Gallon|Carton|Sausage)$/i, ''))
}

function trailingUnit(value: string) {
  return compact(value).match(/\b(LF|EA|SF|SY|CY|Tube|Bundle|Box|Bag|Pail|Pal|Each|Roll|Gallon|Carton|Sausage)$/i)?.[1]
}

function looksLikeStandaloneUnit(value: string) {
  return /^(?:LF|EA|SF|SY|CY|Tube|Bundle|Box|Bag|Pail|Pal|Each|Roll|Gallon|Carton|Sausage)$/i.test(compact(value))
}

function looksLikePriceBasisLine(value: string) {
  return /^[0-9][0-9,.]*(?:\.[0-9]+)?\s+[A-Za-z]+\s*\/\s*(?:[0-9][0-9,.]*(?:\.[0-9]+)?\s+)?[A-Za-z]+$/i.test(compact(value))
}

function descriptionLooksIncomplete(value: string) {
  const description = compact(value)
  if (!description) return true
  if (looksLikeStandaloneUnit(description)) return true
  if (/^(?:multi|varies?|n\/a|na)$/i.test(description)) return true
  if (/^(?:\d+\s*)?'\s*\d+\s*"$/i.test(description)) return true
  if (/^\d+\s*'\s*\d+\s*"$/i.test(description)) return true
  if (/^\d+(?:\s+\d+\/\d+)?\s*(?:"|in|inch|inches)$/i.test(description)) return true
  if (/^[0-9./\s'"-]+$/.test(description)) return true
  return false
}

function repairSplitPdfDescription(
  parsed: ParsedQuoteLine,
  context: { previousDescription?: string; nextContinuation?: string },
) {
  const previousDescription = stripTrailingTableQuantity(context.previousDescription ?? '')
  const nextContinuation = stripTrailingUnit(context.nextContinuation ?? '')
  if (!previousDescription && !nextContinuation) return parsed

  const parts = [
    previousDescription,
    looksLikeStandaloneUnit(parsed.description) ? '' : parsed.description,
    nextContinuation,
  ].filter(Boolean)
  const description = compact(parts.join(' '))
  if (!description || description === parsed.description) return parsed

  return {
    ...parsed,
    description,
  }
}

function repairMultiSizePdfLine(
  parsed: ParsedQuoteLine,
  context: { sizeText?: string; nextContinuation?: string },
) {
  if (parsed.unit !== 'multi' || !/^multi\b/i.test(compact(context.sizeText ?? ''))) return parsed
  const unit = trailingUnit(context.nextContinuation ?? '')
  if (!unit) return parsed
  const nextDescription = stripTrailingUnit(context.nextContinuation ?? '')
  return {
    ...parsed,
    description: compact([parsed.description, 'Multi', nextDescription].filter(Boolean).join(' ')),
    unit: normalizeUnit(unit),
  }
}

function isSectionOrPageArtifact(line: string) {
  if (!line) return true
  if (/^\d{3}\s+-\s+/.test(line)) return true
  if (/^L n W Supply/i.test(line)) return true
  if (/\b\d+\s*\/\s*\d+\s+\d{1,2}\/\d{1,2}\/\d{4}\b/.test(line)) return true
  if (/\b(?:supplier|expected delivery date|requester|company|job site)\b/i.test(line)) return true
  if (/\b(?:item description|quantity|price per|total)\b/i.test(line)) return true
  return false
}

function parseSourceTablePriceTail(line: string) {
  const priced = compact(line).match(new RegExp(
    String.raw`^(\d+)\s+(.+?)\s+(-?\s*[0-9][0-9,]*\.[0-9]+)\s+([A-Za-z]+)\s+([0-9][0-9,]*\.[0-9]+)\s+(.+?)\s+(${signedMoneyTokenPattern})$`,
    'i',
  ))
  if (priced) {
    const [, itemNumber, leftText, quantityText, unit, unitPriceText, priceBasisText, totalText] = priced
    const priceBasis = compact(priceBasisText).match(/([0-9][0-9,]*(?:\.[0-9]+)?)\s+([A-Za-z]+)$/)
    return {
      itemNumber,
      leftText: compact(leftText),
      quantity: quoteRowNumberFromText(quantityText),
      unit: normalizeUnit(unit),
      unitPrice: numberFromText(unitPriceText),
      pricePerQuantity: priceBasis ? quoteRowNumberFromText(priceBasis[1]) : undefined,
      pricePerUnit: priceBasis ? normalizeUnit(priceBasis[2]) : undefined,
      totalPrice: numberFromText(totalText),
    }
  }

  const noPriceBasis = compact(line).match(new RegExp(
    String.raw`^(\d+)\s+(.+?)\s+(-?\s*[0-9][0-9,]*\.[0-9]+)\s+([A-Za-z]+)\s+([0-9][0-9,]*\.[0-9]+)\s+(${signedMoneyTokenPattern})$`,
    'i',
  ))
  if (!noPriceBasis) return undefined
  const [, itemNumber, leftText, quantityText, unit, unitPriceText, totalText] = noPriceBasis
  return {
    itemNumber,
    leftText: compact(leftText),
    quantity: quoteRowNumberFromText(quantityText),
    unit: normalizeUnit(unit),
    unitPrice: numberFromText(unitPriceText),
    totalPrice: numberFromText(totalText),
  }
}

function sourceTableContinuationLines(lines: string[], index: number, direction: -1 | 1) {
  const continuations: string[] = []
  const maxLookaround = direction === 1 ? 1 : 3
  for (let offset = 1; offset <= maxLookaround; offset += 1) {
    const candidate = lines[index + direction * offset] ?? ''
    if (!candidate) continue
    if (isSectionOrPageArtifact(candidate)) break
    if (/^\d+\s+/.test(candidate)) break
    if (parseSourceTablePriceTail(candidate) || parseQuoteLine(candidate, 0) || parseCompactQuoteLine(candidate, 0)) break
    if (looksLikePriceBasisLine(candidate) || looksLikeStandaloneUnit(candidate)) continue
    continuations.push(candidate)
  }
  return direction === -1 ? continuations.reverse() : continuations
}

function normalizedWordPrefix(value: string, prefix: string) {
  const words = (input: string) => compact(input).toLowerCase().match(/[a-z0-9.]+/g) ?? []
  const valueWords = words(value)
  const prefixWords = words(prefix)
  if (prefixWords.length === 0 || valueWords.length < prefixWords.length) return false
  return prefixWords.every((word, index) => valueWords[index] === word)
}

function sourceTableSkuAndInlineDescription(leftText: string, continuationDescription: string) {
  const base = leftText.match(/^(\S+(?:\s*-\s*\S+)*)\s*(.*)$/i)
  if (!base) return { sku: normalizeSourceItemCode(leftText), inlineDescription: '' }
  let sku = normalizeSourceItemCode(base[1])
  let inlineDescription = compact(base[2] ?? '')
  const restTokens = inlineDescription.split(/\s+/).filter(Boolean)

  for (let count = Math.min(3, restTokens.length); count >= 1; count -= 1) {
    const candidateSku = normalizeSourceItemCode(`${sku} ${restTokens.slice(0, count).join(' ')}`)
    const candidateDescription = compact(restTokens.slice(count).join(' '))
    const continuationRepeatsCandidate = continuationDescription && normalizedWordPrefix(continuationDescription, candidateSku)
    const inlineRepeatsCandidate = candidateDescription && normalizedWordPrefix(candidateDescription, candidateSku)
    if ((continuationRepeatsCandidate && descriptionLooksIncomplete(candidateDescription)) || inlineRepeatsCandidate) {
      sku = candidateSku
      inlineDescription = candidateDescription
      break
    }
  }

  return {
    sku,
    inlineDescription: stripLeadingRepeatedSku(inlineDescription, sku),
  }
}

function sourceTableDescription(input: {
  sku: string
  inlineDescription: string
  before: string[]
  after: string[]
}) {
  const needsContinuation = descriptionLooksIncomplete(input.inlineDescription)
  const before = needsContinuation
    ? input.before.map((line) => (/\d/.test(input.sku) || input.sku.includes('-')) ? stripLeadingRepeatedSku(line, input.sku) : line)
    : []
  const after = needsContinuation ? input.after : []
  const inline = needsContinuation && (/^(?:n\/a|na|multi)$/i.test(input.inlineDescription) || looksLikeStandaloneUnit(input.inlineDescription))
    ? ''
    : input.inlineDescription
  const description = compact([...before, inline, ...after].filter(Boolean).join(' '))
  return description || input.inlineDescription
}

function parseSourceTableQuoteLines(text: string) {
  const lines = text
    .split('\n')
    .map(compact)
    .filter(Boolean)

  return lines
    .map((line, index): ParsedQuoteLine | null => {
      const priced = parseSourceTablePriceTail(line)
      if (!priced) return null
      const before = sourceTableContinuationLines(lines, index, -1)
      const after = sourceTableContinuationLines(lines, index, 1)
      const continuationDescription = compact([...before, ...after].join(' '))
      const { sku, inlineDescription } = sourceTableSkuAndInlineDescription(priced.leftText, continuationDescription)
      const description = sourceTableDescription({ sku, inlineDescription, before, after })
      if (!sku || !description) return null
      return {
        sourceRow: index + 1,
        itemNumber: priced.itemNumber,
        sku,
        description,
        descriptionFromSourceColumn: true,
        quantity: priced.quantity,
        unit: priced.unit,
        unitPrice: priced.unitPrice,
        pricePerQuantity: priced.pricePerQuantity,
        pricePerUnit: priced.pricePerUnit,
        totalPrice: priced.totalPrice,
        rawText: line,
      }
    })
    .filter((line): line is ParsedQuoteLine => Boolean(line))
}

function mergeSourceTableQuoteLines(parsedLines: ParsedQuoteLine[], sourceTableLines: ParsedQuoteLine[]) {
  if (sourceTableLines.length === 0) return parsedLines
  const sourceByRow = new Map(sourceTableLines.map((line) => [line.sourceRow, line]))
  const usedRows = new Set<number>()
  const merged = parsedLines.map((line) => {
    const sourceLine = sourceByRow.get(line.sourceRow)
    if (!sourceLine) return line
    usedRows.add(sourceLine.sourceRow)
    return sourceLine
  })
  for (const line of sourceTableLines) {
    if (!usedRows.has(line.sourceRow) && !merged.some((existing) => existing.sourceRow === line.sourceRow)) {
      merged.push(line)
    }
  }
  return merged.sort((a, b) => a.sourceRow - b.sourceRow)
}

function precedingPdfDescription(lines: string[], index: number, sku: string) {
  const maxLookback = 4
  for (let offset = 1; offset <= maxLookback; offset += 1) {
    const candidate = lines[index - offset] ?? ''
    if (!candidate) continue
    const previousPrefix = candidate.match(/^(\S+(?:\s*-\s*\S+)*)\s+(.+)$/i)
    if (previousPrefix && skuLooksLikeSameItem(previousPrefix[1], sku)) return previousPrefix[2]
    if (looksLikePrecedingDescriptionLine(candidate)) return candidate
  }
  return ''
}

function parseQuoteLines(text: string) {
  const lines = text
    .split('\n')
    .map(compact)
    .filter(Boolean)

  return lines
    .map((line, index) => {
      const prefix = line.match(/^(\d+)\s+(\S+(?:\s*-\s*\S+)*)\s+(.+)$/i)
      if (!prefix) return parseQuoteLine(line, index + 1)
      const sku = normalizeSku(prefix[2])
      const previous = lines[index - 1] ?? ''
      const next = lines[index + 1] ?? ''
      const previousQuantityUnitBasis = previous.match(/^([0-9][0-9,]*\.[0-9]+)\s+([A-Za-z]+)\s*\/\s*[0-9][0-9,]*\.[0-9]+(?:\s+[A-Za-z]+)?$/)
      const previousQuantityMatch = previousQuantityUnitBasis
        ?? previous.match(/^[0-9][0-9,]*\.[0-9]+$/)
        ?? previous.match(/^(.+?)\s+([0-9][0-9,]*\.[0-9]+)$/)
      const previousQuantity = previousQuantityUnitBasis?.[1] ?? previousQuantityMatch?.at(-1)
      const nextUnit = next.match(/^(LF|EA|SF|SY|CY|Tube|Bundle|Box|Bag|Pail|Pal|Each|Roll|Gallon|Carton|Sausage)$/i)?.[1]
        ?? next.match(/^(LF|EA|SF|SY|CY|Tube|Bundle|Box|Bag|Pail|Pal|Each|Roll|Gallon|Carton|Sausage)\s+(?:LF|EA|SF|SY|CY|Tube|Bundle|Box|Bag|Pail|Pal|Each|Roll|Gallon|Carton|Sausage)$/i)?.[1]
        ?? previousQuantityUnitBasis?.[2]
        ?? trailingUnit(next)
      const previousDescription = precedingPdfDescription(lines, index, sku)
      const previousQuantityDescription = !previousQuantityUnitBasis && previousQuantityMatch && previousQuantityMatch.length > 2 && !previousDescription
        ? stripTrailingTableQuantity(previous)
        : ''
      const nextContinuation = next && !/^\d+\s+/.test(next) && !/^\d{3}\s+-\s+/.test(next) && !/^L n W Supply/i.test(next)
        ? next
        : ''

      const direct = parseQuoteLine(line, index + 1)
      if (direct && descriptionLooksIncomplete(direct.description)) {
        return repairSplitPdfDescription(direct, { previousDescription, nextContinuation })
      }
      if (direct) return direct

      if (previousQuantity && nextUnit) {
        const contextualLine = previousQuantityDescription ? compact(`${prefix[1]} ${prefix[2]} ${previousQuantityDescription} ${prefix[3]}`) : line
        const contextual = parseQuoteLineWithContextQuantity(contextualLine, index + 1, previousQuantity, nextUnit)
        if (contextual) {
          const repaired = repairSplitPdfDescription(contextual, { previousDescription, nextContinuation })
          return repairMultiSizePdfLine(repaired, { sizeText: prefix[3], nextContinuation })
        }
      }

      const candidates = [
        `${prefix[1]} ${prefix[2]} ${previousDescription} ${prefix[3]}`,
        `${prefix[1]} ${prefix[2]} ${prefix[3]} ${nextContinuation}`,
        `${prefix[1]} ${prefix[2]} ${previousDescription} ${prefix[3]} ${nextContinuation}`,
      ]
      for (const candidate of candidates) {
        const parsed = parseQuoteLine(compact(candidate), index + 1)
        if (parsed) return repairMultiSizePdfLine(parsed, {
          sizeText: prefix[3],
          nextContinuation,
        })
      }
      return null
    })
    .filter((line): line is ParsedQuoteLine => Boolean(line))
}

function parseCompactQuoteLine(rawLine: string, sourceRow: number): ParsedQuoteLine | null {
  const line = compact(rawLine)
  const prefix = line.match(/^([A-Z]\d{3,})\s+(\S+)\s+(.+)$/)
  if (!prefix) return null
  const [, itemNumber, sku, rest] = prefix
  const item = rest.match(compactQuoteLinePattern)
  if (!item) return null
  const [, description, quantityText, unit, unitPriceText, totalText, leadText] = item
  return {
    sourceRow,
    itemNumber,
    sku: normalizeSku(sku),
    description: compact(description),
    quantity: quoteRowNumberFromText(quantityText),
    unit: normalizeUnit(unit),
    unitPrice: numberFromText(unitPriceText),
    totalPrice: numberFromText(totalText),
    leadTimeDays: leadTimeDays(leadText),
    rawText: line,
  }
}

function looksLikePrecedingDescriptionLine(line: string) {
  if (!line) return false
  if (/^\d+\s+/.test(line)) return false
  if (looksLikePriceBasisLine(line)) return false
  if (parseQuoteLine(line, 0)) return false
  if (parseCompactQuoteLine(line, 0)) return false
  if (/\b(?:supplier|expected delivery date)\b/i.test(line)) return false
  if (/\b(?:description\s*\/\s*line|sku|qty|unit price|ext total)\b/i.test(line)) return false
  if (/^(?:lead|total|unit|qty|sku)\b/i.test(line)) return false
  if (/^[A-Z]\d{3,}\s+\S+\s+/.test(line)) return false
  if (extractedPdfQuoteLinePattern.test(line)) return false
  return /[A-Za-z]/.test(line)
}

function compactQuoteRows(text: string) {
  const lines = text.split('\n')
  const rows: Array<{ text: string; sourceRow: number }> = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = compact(lines[index] ?? '')
    if (!line) continue
    const nextLine = compact(lines[index + 1] ?? '')
    const previousLine = compact(lines[index - 1] ?? '')
    const prefix = line.match(/^([A-Z]\d{3,})\s+(\S+)\s+(.+)$/)
    if (prefix && looksLikePrecedingDescriptionLine(previousLine)) {
      const [, itemNumber, sku, rest] = prefix
      const combined = compact(`${itemNumber} ${sku} ${previousLine} ${rest}`)
      if (parseCompactQuoteLine(combined, index)) {
        rows.push({ text: combined, sourceRow: index })
        continue
      }
    }
    const hasItemSkuDescription = /^([A-Z]\d{3,})\s+\S+\s+.+$/.test(line)
    if (hasItemSkuDescription && nextLine && !parseCompactQuoteLine(line, index + 1)) {
      const combined = compact(`${line} ${nextLine}`)
      if (parseCompactQuoteLine(combined, index + 1)) {
        rows.push({ text: combined, sourceRow: index + 1 })
        index += 1
        continue
      }
    }
    rows.push({ text: line, sourceRow: index + 1 })
  }
  return rows
}

function parseCompactQuoteLines(text: string) {
  return compactQuoteRows(text)
    .map((row) => parseCompactQuoteLine(row.text, row.sourceRow))
    .filter((line): line is ParsedQuoteLine => Boolean(line))
}

const extractedPdfQuoteRowSchema = z.object({
  sku: z.string().min(1),
  description: z.string().min(1),
  quantity: z.number(),
  unit: z.string().min(1),
  unitPrice: z.number(),
  totalPrice: z.number(),
  leadTimeDays: z.number(),
})

function totalMatchesPriceBasis(quantity: number, unitPrice: number, totalPrice: number, basis: number) {
  const expected = quantity * unitPrice / basis
  return Math.abs(Math.abs(totalPrice) - Math.abs(expected)) <= Math.max(2, Math.abs(expected) * 0.03)
}

function inferExtractedPdfPriceBasis(quantity: number, unit: string, unitPrice: number, totalPrice: number) {
  const normalizedUnit = normalizeUnit(unit)
  if (['lf', 'sf', 'sy'].includes(normalizedUnit) && totalMatchesPriceBasis(quantity, unitPrice, totalPrice, 1000)) {
    return { quantity: 1000, unit: normalizedUnit }
  }
  if (normalizedUnit === 'multi' && totalMatchesPriceBasis(quantity, unitPrice, totalPrice, 1000)) {
    return { quantity: 1000, unit: 'lf' }
  }
  return undefined
}

function skuDescriptionFromExtractedPdfLeft(value: string) {
  const text = compact(value)
  const parts = text.split(' ')
  if (parts.length < 2) return undefined

  const first = parts[0]
  let sku = first
  let descriptionStart = 1
  if (parts[1] && normalizeSku(parts[1]) === normalizeSku(first)) {
    descriptionStart = 2
  } else if (
    parts[1] &&
    /^[A-Z0-9]+(?:-[A-Z0-9]+)?$/.test(parts[1]) &&
    parts[2] &&
    !/^[A-Z0-9]+(?:-[A-Z0-9]+)?$/.test(parts[2])
  ) {
    sku = `${first}-${parts[1]}`
    descriptionStart = 2
  }

  const description = compact(parts.slice(descriptionStart).join(' '))
  if (!description) return undefined
  return { sku: normalizeSku(sku), description }
}

function parseExtractedPdfQuoteLine(rawLine: string, sourceRow: number): ParsedQuoteLine | null {
  const line = compact(rawLine)
  if (!line || /^item\s+description\s+qty\b/i.test(line)) return null
  const match = line.match(extractedPdfQuoteLinePattern)
  if (!match) return null
  const [, leftText, quantityText, rawUnit, unitPriceText, totalText, leadText] = match
  const skuDescription = skuDescriptionFromExtractedPdfLeft(leftText)
  if (!skuDescription) return null
  const quantity = quoteRowNumberFromText(quantityText)
  const unitPrice = numberFromText(unitPriceText)
  const totalPrice = numberFromText(totalText)
  const priceBasis = inferExtractedPdfPriceBasis(quantity, rawUnit, unitPrice, totalPrice)
  const row = extractedPdfQuoteRowSchema.safeParse({
    sku: skuDescription.sku,
    description: skuDescription.description,
    quantity: Math.abs(quantity),
    unit: priceBasis && normalizeUnit(rawUnit) === 'multi' ? priceBasis.unit : normalizeUnit(rawUnit),
    unitPrice,
    totalPrice,
    leadTimeDays: leadTimeDays(leadText),
  })
  if (!row.success) return null
  return {
    sourceRow,
    itemNumber: `${row.data.sku}-${sourceRow}`,
    sku: row.data.sku,
    description: row.data.description,
    quantity: row.data.quantity,
    unit: row.data.unit,
    unitPrice: row.data.unitPrice,
    pricePerQuantity: priceBasis?.quantity,
    pricePerUnit: priceBasis?.unit,
    totalPrice: row.data.totalPrice,
    leadTimeDays: row.data.leadTimeDays,
    rawText: line,
  }
}

function parseExtractedPdfQuoteLines(text: string) {
  return text
    .split('\n')
    .map((line, index) => parseExtractedPdfQuoteLine(line, index + 1))
    .filter((line): line is ParsedQuoteLine => Boolean(line))
}

function parseInlineEmailQuoteLine(rawLine: string, sourceRow: number): ParsedQuoteLine | null {
  const line = compact(rawLine)
  const match = line.match(/^(.+?),\s*qty\s+([0-9][0-9,.]*)\s+([A-Za-z]+),\s*unit\s+price\s+\$?\s*([0-9][0-9,.]*)(?:,\s*lead\s+time\s+(.+))?$/i)
  if (!match) return null
  const [, rawDescription, quantityText, unit, unitPriceText] = match
  const description = compact(rawDescription)
  const quantity = quoteRowNumberFromText(quantityText)
  const unitPrice = quoteRowNumberFromText(unitPriceText)
  if (!description || !quantity || !unitPrice) return null
  const skuMatch = description.match(/\b[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)+\b/)
  return {
    sourceRow,
    itemNumber: `email-${sourceRow}`,
    sku: skuMatch ? normalizeSku(skuMatch[0]) : '',
    description,
    quantity,
    unit: normalizeUnit(unit),
    unitPrice,
    totalPrice: Number((quantity * unitPrice).toFixed(2)),
    leadTimeDays: leadTimeDays(match[5] ?? ''),
    rawText: line,
  }
}

function parseInlineEmailQuoteLines(text: string) {
  return text
    .split('\n')
    .map((line, index) => parseInlineEmailQuoteLine(line, index + 1))
    .filter((line): line is ParsedQuoteLine => Boolean(line))
}

const fallbackCompactPdfMatrixVendorNames = [
  'L n W Supply - San Diego',
  'Acme Drywall Supply',
  'BuildCo Materials',
  'Metro Door Hardware',
]

type GenericParsedBidLineWithVendor = GenericParsedBidLine & { vendorName: string }

function compactPdfMatrixVendorNames(text: string) {
  const vendorsLine = text
    .split('\n')
    .map(compact)
    .find((line) => /^vendors\s*:/i.test(line))
  const vendors = compact(vendorsLine?.replace(/^vendors\s*:\s*/i, '') ?? '')
    .split(/\s*\|\s*/)
    .map(compact)
    .filter(Boolean)
  return vendors.length ? vendors : fallbackCompactPdfMatrixVendorNames
}

function parseCompactPdfMatrixLine(rawLine: string, sourceRow: number, vendorNames: string[]): { lineItem: GenericParsedLineItem; bidLines: GenericParsedBidLineWithVendor[] } | null {
  const line = compact(rawLine)
  const prefix = line.match(/^([A-Z]\d{3,})\s+(\S+)\s+(.+)$/)
  if (!prefix) return null
  const [, itemNumber, sku, rest] = prefix
  const boundaryPattern = /\s([0-9][0-9,.]*)\s+(LF|EA|SF|SY|CY|Sheet|Tube|Box|Bundle)\s+(.+)$/gi
  let boundary: { description: string; quantityText: string; unit: string; priceRest: string } | undefined
  for (const match of rest.matchAll(boundaryPattern)) {
    const priceRest = compact(match[3] ?? '')
    if (!/^(?:no\s+bid|[0-9][0-9,.]*\s+[0-9][0-9,.]*\s+[0-9]+(?:-[0-9]+)?\s+(?:days?|weeks?))/i.test(priceRest)) continue
    boundary = {
      description: compact(rest.slice(0, match.index)),
      quantityText: match[1],
      unit: match[2],
      priceRest,
    }
    break
  }
  if (!boundary) return null
  const lineItem: GenericParsedLineItem = {
    itemNumber,
    sku: normalizeSku(sku),
    description: boundary.description,
    quantity: quoteRowNumberFromText(boundary.quantityText),
    unit: normalizeUnit(boundary.unit),
  }
  if (!lineItem.description || !lineItem.quantity || !lineItem.unit) return null

  const groups: Array<{ unitPrice?: number; totalPrice?: number; lead?: string; notes?: string }> = []
  const pricePattern = /(?:^|\s)(no\s+bid|[0-9][0-9,.]*\s+[0-9][0-9,.]*\s+[0-9]+(?:-[0-9]+)?\s+(?:days?|weeks?))(.*?)(?=\s+(?:no\s+bid|[0-9][0-9,.]*\s+[0-9][0-9,.]*\s+[0-9]+(?:-[0-9]+)?\s+(?:days?|weeks?))|$)/gi
  for (const match of boundary.priceRest.matchAll(pricePattern)) {
    const value = compact(match[1] ?? '')
    const notes = compact(match[2] ?? '')
    if (/^no\s+bid$/i.test(value)) {
      groups.push({ notes: compact(['No bid.', notes].filter(Boolean).join(' ')) })
      continue
    }
    const price = value.match(/^([0-9][0-9,.]*)\s+([0-9][0-9,.]*)\s+([0-9]+(?:-[0-9]+)?\s+(?:days?|weeks?))$/i)
    if (!price) continue
    groups.push({
      unitPrice: optionalNumberFromText(price[1]),
      totalPrice: optionalNumberFromText(price[2]),
      lead: price[3],
      notes,
    })
  }
  if (groups.filter((group) => group.unitPrice != null || group.totalPrice != null).length < 2) return null

  return {
    lineItem,
    bidLines: groups.flatMap((group, index) => {
      const vendorName = vendorNames[index]
      if (!vendorName) return []
      const bidLine = genericBidLine(lineItem, sourceRow, group)
      return bidLine ? [{ ...bidLine, lineItemKey: lineItem.itemNumber, vendorName }] : []
    }),
  }
}

function parseCompactPdfMatrix(text: string): GenericParsedImport | null {
  if (!/multi-supplier quote matrix/i.test(text)) return null
  const vendorNames = compactPdfMatrixVendorNames(text)
  const parsedRows = text
    .split('\n')
    .map((line, index) => parseCompactPdfMatrixLine(line, index + 1, vendorNames))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
  if (parsedRows.length === 0) return null

  const lineItems = parsedRows.map((row) => row.lineItem)
  const bidLinesByVendor = new Map<string, GenericParsedBidLine[]>()
  for (const row of parsedRows) {
    for (const bidLine of row.bidLines) {
      const vendorName = bidLine.vendorName
      const lineWithoutVendor: GenericParsedBidLine = {
        lineItemKey: bidLine.lineItemKey,
        sku: bidLine.sku,
        description: bidLine.description,
        quantity: bidLine.quantity,
        unit: bidLine.unit,
        unitPrice: bidLine.unitPrice,
        totalPrice: bidLine.totalPrice,
        leadTimeDays: bidLine.leadTimeDays,
        sourceRow: bidLine.sourceRow,
        notes: bidLine.notes,
      }
      bidLinesByVendor.set(vendorName, [...(bidLinesByVendor.get(vendorName) ?? []), lineWithoutVendor])
    }
  }

  const bids = [...bidLinesByVendor.entries()]
    .filter(([, lines]) => lines.length > 0)
    .map(([vendorName, lines]) => ({ vendorName, lines }))
  if (lineItems.length === 0 || bids.length < 2) return null
  return {
    lineItems,
    bids,
    warnings: [{ message: `Imported ${bids.length} multiple supplier quote responses from compact PDF matrix layout.` }],
  }
}

function parseCsvLine(line: string) {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"' && quoted && next === '"') {
      cell += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += char
    }
  }
  cells.push(cell.trim())
  return cells
}

function delimitedRows(text: string) {
  return text
    .split('\n')
    .map((line, index) => ({
      sourceRow: index + 1,
      cells: (line.includes('\t') ? line.split('\t') : parseCsvLine(line)).map((cell) => compact(cell)),
    }))
    .filter((row) => row.cells.some(Boolean))
}

function headerKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function findColumn(headers: string[], keys: string[]) {
  const normalized = headers.map(headerKey)
  return normalized.findIndex((header) => keys.includes(header))
}

function headerLooksLikeQuoteTable(headers: string[]) {
  return findColumn(headers, ['description', 'itemdescription', 'material', 'materialname']) >= 0 &&
    findColumn(headers, ['qty', 'quantity', 'requiredqty']) >= 0 &&
    findColumn(headers, ['unit', 'uom']) >= 0
}

function findGenericHeaderRow(rows: ReturnType<typeof delimitedRows>) {
  return rows.findIndex((row) => headerLooksLikeQuoteTable(row.cells))
}

function rowValue(cells: string[], index: number) {
  return index >= 0 ? cells[index] ?? '' : ''
}

function itemKeyFromCells(cells: string[], indexes: { item: number; sku: number; description: number }) {
  return rowValue(cells, indexes.item) || rowValue(cells, indexes.sku) || idPart(rowValue(cells, indexes.description))
}

function leadTimeDays(value: string) {
  if (/stock|in stock/i.test(value)) return 0
  return optionalNumberFromText(value) ?? 0
}

function genericLineItemFromCells(cells: string[], indexes: { item: number; sku: number; description: number; qty: number; unit: number }): GenericParsedLineItem | null {
  const description = rowValue(cells, indexes.description)
  if (!description) return null
  const quantity = optionalTableQuantityFromText(rowValue(cells, indexes.qty))
  if (quantity == null) return null
  return {
    itemNumber: itemKeyFromCells(cells, indexes),
    sku: normalizeSku(rowValue(cells, indexes.sku)),
    description,
    quantity,
    unit: normalizeUnit(rowValue(cells, indexes.unit)),
  }
}

function genericBidLine(
  lineItem: GenericParsedLineItem,
  sourceRow: number,
  price: { unitPrice?: number; totalPrice?: number; lead?: string; notes?: string },
): GenericParsedBidLine | null {
  if (price.unitPrice == null && price.totalPrice == null) return null
  const totalPrice = price.totalPrice ?? Number(((price.unitPrice ?? 0) * lineItem.quantity).toFixed(2))
  const unitPrice = price.unitPrice ?? (lineItem.quantity ? Number((totalPrice / lineItem.quantity).toFixed(4)) : 0)
  return {
    lineItemKey: lineItem.itemNumber,
    sku: lineItem.sku,
    description: lineItem.description,
    quantity: lineItem.quantity,
    unit: lineItem.unit,
    unitPrice,
    totalPrice,
    leadTimeDays: leadTimeDays(price.lead ?? ''),
    sourceRow,
    notes: compact([price.notes, price.lead ? `Lead time: ${price.lead}` : ''].filter(Boolean).join(' ')) || undefined,
  }
}

function parseRowPerVendorTable(rows: ReturnType<typeof delimitedRows>, headerIndex: number): GenericParsedImport | null {
  const headers = rows[headerIndex].cells
  const indexes = {
    supplier: findColumn(headers, ['supplier', 'vendor']),
    item: findColumn(headers, ['item', 'line', 'line', 'linenumber']),
    sku: findColumn(headers, ['sku', 'partno', 'partnumber', 'part']),
    description: findColumn(headers, ['description', 'itemdescription', 'material', 'materialname']),
    qty: findColumn(headers, ['qty', 'quantity', 'requiredqty']),
    unit: findColumn(headers, ['unit', 'uom']),
    unitPrice: findColumn(headers, ['unitprice', 'unitcost', 'quotedunitcost']),
    totalPrice: findColumn(headers, ['totalprice', 'extendedcost', 'total']),
    lead: findColumn(headers, ['leadtime', 'eta']),
    notes: findColumn(headers, ['notes', 'clarifications']),
  }
  if (indexes.supplier < 0 || (indexes.unitPrice < 0 && indexes.totalPrice < 0)) return null

  const lineItemByKey = new Map<string, GenericParsedLineItem>()
  const bidLinesByVendor = new Map<string, GenericParsedBidLine[]>()
  for (const row of rows.slice(headerIndex + 1)) {
    const lineItem = genericLineItemFromCells(row.cells, indexes)
    const vendorName = rowValue(row.cells, indexes.supplier)
    if (!lineItem || !vendorName) continue
    lineItemByKey.set(lineItem.itemNumber, lineItem)
    const bidLine = genericBidLine(lineItem, row.sourceRow, {
      unitPrice: optionalNumberFromText(rowValue(row.cells, indexes.unitPrice)),
      totalPrice: optionalNumberFromText(rowValue(row.cells, indexes.totalPrice)),
      lead: rowValue(row.cells, indexes.lead),
      notes: rowValue(row.cells, indexes.notes),
    })
    if (!bidLine) continue
    bidLinesByVendor.set(vendorName, [...(bidLinesByVendor.get(vendorName) ?? []), bidLine])
  }
  const bids = [...bidLinesByVendor.entries()].map(([vendorName, lines]) => ({ vendorName, lines }))
  if (lineItemByKey.size === 0 || bids.length === 0) return null
  return {
    lineItems: [...lineItemByKey.values()],
    bids,
    warnings: [{ message: `Imported ${bids.length} multiple supplier quote responses from row-per-vendor file layout.` }],
  }
}

function parseSingleVendorTable(rows: ReturnType<typeof delimitedRows>, headerIndex: number): GenericParsedImport | null {
  const headers = rows[headerIndex].cells
  const indexes = {
    item: findColumn(headers, ['item', 'line', 'linenumber']),
    sku: findColumn(headers, ['sku', 'partno', 'partnumber', 'part']),
    description: findColumn(headers, ['description', 'itemdescription', 'material', 'materialname']),
    qty: findColumn(headers, ['qty', 'quantity', 'requiredqty']),
    unit: findColumn(headers, ['unit', 'uom']),
    unitPrice: findColumn(headers, ['unitprice', 'unitcost', 'quotedunitcost']),
    totalPrice: findColumn(headers, ['totalprice', 'extendedcost', 'total']),
    lead: findColumn(headers, ['leadtime', 'eta']),
    notes: findColumn(headers, ['notes', 'clarifications']),
  }
  if (indexes.unitPrice < 0 && indexes.totalPrice < 0) return null

  const lineItems: GenericParsedLineItem[] = []
  const lines: GenericParsedBidLine[] = []
  for (const row of rows.slice(headerIndex + 1)) {
    const lineItem = genericLineItemFromCells(row.cells, indexes)
    if (!lineItem) continue
    lineItems.push(lineItem)
    const bidLine = genericBidLine(lineItem, row.sourceRow, {
      unitPrice: optionalNumberFromText(rowValue(row.cells, indexes.unitPrice)),
      totalPrice: optionalNumberFromText(rowValue(row.cells, indexes.totalPrice)),
      lead: rowValue(row.cells, indexes.lead),
      notes: rowValue(row.cells, indexes.notes),
    })
    if (bidLine) lines.push(bidLine)
  }
  if (lineItems.length === 0 || lines.length === 0) return null
  const vendorName = extractSupplier(rows.map((row) => row.cells.join(',')).join('\n'))
  return {
    lineItems,
    bids: [{ vendorName, lines }],
    warnings: [{ message: `Imported one supplier quote response from single supplier table layout.` }],
  }
}

function wideVendorGroups(headers: string[]) {
  const groups = new Map<string, { vendorName: string; unitPrice?: number; totalPrice?: number; lead?: number; notes?: number }>()
  headers.forEach((header, index) => {
    const match = header.match(/^(.*?)\s+(unit price|unit cost|quoted unit cost|unit|total price|extended cost|extended|total|lead time|lead|eta|notes|clarifications)$/i)
    if (!match) return
    const vendorName = compact(match[1])
    if (!vendorName || ['unit', 'qty', 'required'].includes(vendorName.toLowerCase())) return
    const group = groups.get(vendorName) ?? { vendorName }
    const metric = headerKey(match[2])
    if (['unitprice', 'unitcost', 'quotedunitcost', 'unit'].includes(metric)) group.unitPrice = index
    else if (['totalprice', 'extendedcost', 'extended', 'total'].includes(metric)) group.totalPrice = index
    else if (['leadtime', 'lead', 'eta'].includes(metric)) group.lead = index
    else if (['notes', 'clarifications'].includes(metric)) group.notes = index
    groups.set(vendorName, group)
  })
  return [...groups.values()].filter((group) => group.unitPrice != null || group.totalPrice != null)
}

function parseWideVendorTable(rows: ReturnType<typeof delimitedRows>, headerIndex: number): GenericParsedImport | null {
  const headers = rows[headerIndex].cells
  const indexes = {
    item: findColumn(headers, ['item', 'line', 'linenumber']),
    sku: findColumn(headers, ['sku', 'partno', 'partnumber', 'part']),
    description: findColumn(headers, ['description', 'itemdescription', 'material', 'materialname']),
    qty: findColumn(headers, ['qty', 'quantity', 'requiredqty']),
    unit: findColumn(headers, ['unit', 'uom']),
  }
  const groups = wideVendorGroups(headers)
  if (groups.length === 0) return null

  const lineItems: GenericParsedLineItem[] = []
  const bidLinesByVendor = new Map(groups.map((group) => [group.vendorName, [] as GenericParsedBidLine[]]))
  for (const row of rows.slice(headerIndex + 1)) {
    const lineItem = genericLineItemFromCells(row.cells, indexes)
    if (!lineItem) continue
    lineItems.push(lineItem)
    for (const group of groups) {
      const bidLine = genericBidLine(lineItem, row.sourceRow, {
        unitPrice: optionalNumberFromText(rowValue(row.cells, group.unitPrice ?? -1)),
        totalPrice: optionalNumberFromText(rowValue(row.cells, group.totalPrice ?? -1)),
        lead: rowValue(row.cells, group.lead ?? -1),
        notes: rowValue(row.cells, group.notes ?? -1),
      })
      if (bidLine) bidLinesByVendor.get(group.vendorName)?.push(bidLine)
    }
  }
  const bids = [...bidLinesByVendor.entries()]
    .filter(([, lines]) => lines.length > 0)
    .map(([vendorName, lines]) => ({ vendorName, lines }))
  if (lineItems.length === 0 || bids.length === 0) return null
  return {
    lineItems,
    bids,
    warnings: [{ message: `Imported ${bids.length} multiple supplier quote responses from wide comparison file layout.` }],
  }
}

function repeatedSupplierGroups(headers: string[]) {
  const groups: Array<{ supplier: number; unitPrice?: number; totalPrice?: number; lead?: number; notes?: number; variation?: number }> = []
  headers.forEach((header, index) => {
    if (headerKey(header) !== 'supplier') return
    const group: { supplier: number; unitPrice?: number; totalPrice?: number; lead?: number; notes?: number; variation?: number } = { supplier: index }
    for (let column = index + 1; column < headers.length; column += 1) {
      const key = headerKey(headers[column])
      if (key === 'supplier') break
      if (['unitprice', 'unitcost', 'quotedunitcost'].includes(key)) group.unitPrice = column
      else if (['total', 'totalprice', 'extendedcost'].includes(key)) group.totalPrice = column
      else if (['leadtime', 'eta'].includes(key)) group.lead = column
      else if (['notes', 'clarifications'].includes(key)) group.notes = column
      else if (key === 'variation') group.variation = column
    }
    if (group.unitPrice != null || group.totalPrice != null) groups.push(group)
  })
  return groups
}

function parseRepeatedSupplierBlockTable(rows: ReturnType<typeof delimitedRows>, headerIndex: number): GenericParsedImport | null {
  const headers = rows[headerIndex].cells
  const groups = repeatedSupplierGroups(headers)
  if (groups.length < 2) return null

  const indexes = {
    item: findColumn(headers, ['item', 'line', 'linenumber']),
    sku: findColumn(headers, ['sku', 'partno', 'partnumber', 'part']),
    description: findColumn(headers, ['description', 'itemdescription', 'material', 'materialname']),
    qty: findColumn(headers, ['qty', 'quantity', 'requiredqty']),
    unit: findColumn(headers, ['unit', 'uom']),
  }
  const lineItems: GenericParsedLineItem[] = []
  const bidLinesByVendor = new Map<string, GenericParsedBidLine[]>()

  for (const row of rows.slice(headerIndex + 1)) {
    const lineItem = genericLineItemFromCells(row.cells, indexes)
    if (!lineItem) continue
    lineItems.push(lineItem)
    for (const group of groups) {
      const vendorName = rowValue(row.cells, group.supplier)
      if (!vendorName || /^edited$/i.test(vendorName)) continue
      const notes = compact([
        rowValue(row.cells, group.notes ?? -1),
        rowValue(row.cells, group.variation ?? -1) ? `Variation: ${rowValue(row.cells, group.variation ?? -1)}` : '',
      ].filter(Boolean).join(' '))
      const unitPrice = optionalNumberFromText(rowValue(row.cells, group.unitPrice ?? -1))
      const totalPrice = optionalNumberFromText(rowValue(row.cells, group.totalPrice ?? -1))
      const shouldTreatAsNoBid = unitPrice == null && totalPrice === 0
      const bidLine = genericBidLine(lineItem, row.sourceRow, {
        unitPrice,
        totalPrice: shouldTreatAsNoBid ? undefined : totalPrice,
        lead: rowValue(row.cells, group.lead ?? -1),
        notes,
      })
      if (!bidLine) continue
      bidLinesByVendor.set(vendorName, [...(bidLinesByVendor.get(vendorName) ?? []), bidLine])
    }
  }

  const bids = [...bidLinesByVendor.entries()].map(([vendorName, lines]) => ({ vendorName, lines }))
  if (lineItems.length === 0 || bids.length === 0) return null
  return {
    lineItems,
    bids,
    warnings: [{ message: `Imported ${bids.length} multiple supplier quote responses from repeated supplier block file layout.` }],
  }
}

function parseGenericRows(rows: ReturnType<typeof delimitedRows>): GenericParsedImport | null {
  const headerIndex = findGenericHeaderRow(rows)
  if (headerIndex < 0) return null
  return parseRepeatedSupplierBlockTable(rows, headerIndex) ??
    parseRowPerVendorTable(rows, headerIndex) ??
    parseWideVendorTable(rows, headerIndex) ??
    parseSingleVendorTable(rows, headerIndex)
}

function stripHtml(value: string) {
  return compact(value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>'))
}

function parseHtmlTable(text: string): GenericParsedImport | null {
  if (!/<table[\s>]/i.test(text)) return null
  const rows = [...text.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((match, index) => ({
      sourceRow: index + 1,
      cells: [...(match[1] ?? '').matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map((cell) => stripHtml(cell[1] ?? '')),
    }))
    .filter((row) => row.cells.some(Boolean))
  return parseGenericRows(rows)
}

function parseFixedWidthTable(text: string): GenericParsedImport | null {
  const lines = text.split('\n')
  const headerIndex = lines.findIndex((line) => /\bline\b/i.test(line) && /\bvendor\b/i.test(line) && /\bunit price\b/i.test(line))
  if (headerIndex < 0) return null
  const rows = lines.slice(headerIndex + 1)
    .map((line, index) => {
      const cells = line.trim().split(/\s{2,}/).map(compact)
      if (cells.length < 9) return null
      const [item, sku, description, qty, unit, vendor, unitPrice, totalPrice, lead, notes = ''] = cells
      return {
        sourceRow: headerIndex + index + 2,
        cells: [item, sku, description, qty, unit, vendor, unitPrice, totalPrice, lead, notes],
      }
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
  if (rows.length === 0) return null
  return parseRowPerVendorTable([
    {
      sourceRow: headerIndex + 1,
      cells: ['Line #', 'Part No', 'Material Name', 'Required Qty', 'UOM', 'Vendor', 'Quoted Unit Cost', 'Extended Cost', 'ETA', 'Clarifications'],
    },
    ...rows,
  ], 0)
}

function xmlAttributes(value: string) {
  const attrs = new Map<string, string>()
  for (const match of value.matchAll(/([A-Za-z_:][A-Za-z0-9_:.-]*)="([^"]*)"/g)) {
    attrs.set(match[1], match[2])
  }
  return attrs
}

function parseXmlVendorComparison(text: string): GenericParsedImport | null {
  if (!/<vendorComparison\b/i.test(text)) return null
  const lineItems = [...text.matchAll(/<item\b([^>]*)\/>/gi)]
    .map((match): GenericParsedLineItem | null => {
      const attrs = xmlAttributes(match[1] ?? '')
      const itemNumber = attrs.get('line') ?? ''
      const description = attrs.get('description') ?? ''
      const quantity = optionalNumberFromText(attrs.get('quantity'))
      if (!itemNumber || !description || quantity == null) return null
      return {
        itemNumber,
        sku: normalizeSku(attrs.get('sku') ?? ''),
        description,
        quantity,
        unit: normalizeUnit(attrs.get('unit') ?? ''),
      }
    })
    .filter((item): item is GenericParsedLineItem => Boolean(item))
  const lineByKey = new Map(lineItems.map((item) => [item.itemNumber, item]))
  const bids = [...text.matchAll(/<vendor\b([^>]*)>([\s\S]*?)<\/vendor>/gi)]
    .map((match): GenericParsedBid | null => {
      const vendorName = compact(xmlAttributes(match[1] ?? '').get('name') ?? '')
      if (!vendorName) return null
      const lines = [...(match[2] ?? '').matchAll(/<quote\b([^>]*)\/>/gi)]
        .flatMap((quoteMatch) => {
          const attrs = xmlAttributes(quoteMatch[1] ?? '')
          const lineItem = lineByKey.get(attrs.get('line') ?? '')
          if (!lineItem) return []
          const bidLine = genericBidLine(lineItem, quoteMatch.index ?? 0, {
            unitPrice: optionalNumberFromText(attrs.get('unitPrice')),
            totalPrice: optionalNumberFromText(attrs.get('total')),
            lead: attrs.get('leadTime') ?? '',
            notes: attrs.get('notes') ?? '',
          })
          return bidLine ? [bidLine] : []
        })
      return lines.length > 0 ? { vendorName, lines } : null
    })
    .filter((bid): bid is GenericParsedBid => Boolean(bid))
  if (lineItems.length === 0 || bids.length === 0) return null
  return {
    lineItems,
    bids,
    warnings: [{ message: `Imported ${bids.length} multiple supplier quote responses from XML vendor comparison layout.` }],
  }
}

function parseYamlVendorComparison(text: string): GenericParsedImport | null {
  if (!/^\s*vendors:\s*$/mi.test(text) || !/^\s*items:\s*$/mi.test(text)) return null
  const lineItems: GenericParsedLineItem[] = []
  const bids: GenericParsedBid[] = []
  let section: 'items' | 'vendors' | undefined
  let currentItem: Partial<GenericParsedLineItem> | undefined
  let currentBid: GenericParsedBid | undefined
  let currentQuote: Partial<GenericParsedBidLine> & { item?: string; lead?: string; notes?: string } | undefined
  const lineByKey = new Map<string, GenericParsedLineItem>()

  function finishItem() {
    if (!currentItem?.itemNumber || !currentItem.description || currentItem.quantity == null) return
    const lineItem: GenericParsedLineItem = {
      itemNumber: currentItem.itemNumber,
      sku: currentItem.sku ?? '',
      description: currentItem.description,
      quantity: currentItem.quantity,
      unit: currentItem.unit ?? '',
    }
    lineItems.push(lineItem)
    lineByKey.set(lineItem.itemNumber, lineItem)
    currentItem = undefined
  }
  function finishQuote() {
    if (!currentBid || !currentQuote?.item) return
    const lineItem = lineByKey.get(currentQuote.item)
    if (!lineItem) return
    const bidLine = genericBidLine(lineItem, currentBid.lines.length + 1, {
      unitPrice: currentQuote.unitPrice,
      totalPrice: currentQuote.totalPrice,
      lead: currentQuote.lead,
      notes: currentQuote.notes,
    })
    if (bidLine) currentBid.lines.push(bidLine)
    currentQuote = undefined
  }
  function finishBid() {
    finishQuote()
    if (currentBid && currentBid.lines.length > 0) bids.push(currentBid)
    currentBid = undefined
  }

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    if (line === 'items:') {
      finishBid()
      section = 'items'
      continue
    }
    if (line === 'vendors:') {
      finishItem()
      section = 'vendors'
      continue
    }
    if (section === 'items') {
      if (line.startsWith('- ')) {
        finishItem()
        currentItem = {}
        const inline = line.match(/^-\s+id:\s*(.+)$/)
        if (inline) currentItem.itemNumber = compact(inline[1])
        continue
      }
      const match = line.match(/^([A-Za-z_]+):\s*(.+)$/)
      if (!match || !currentItem) continue
      const [, keyName, value] = match
      if (keyName === 'id') currentItem.itemNumber = compact(value)
      else if (keyName === 'sku') currentItem.sku = normalizeSku(value)
      else if (keyName === 'description') currentItem.description = compact(value)
      else if (keyName === 'qty') currentItem.quantity = optionalNumberFromText(value) ?? 0
      else if (keyName === 'unit') currentItem.unit = normalizeUnit(value)
      continue
    }
    if (section === 'vendors') {
      const vendorMatch = line.match(/^-\s+name:\s*(.+)$/)
      if (vendorMatch) {
        finishBid()
        currentBid = { vendorName: compact(vendorMatch[1]), lines: [] }
        continue
      }
      const quoteMatch = line.match(/^-\s+item:\s*(.+)$/)
      if (quoteMatch) {
        finishQuote()
        currentQuote = { item: compact(quoteMatch[1]) }
        continue
      }
      const fieldMatch = line.match(/^([A-Za-z_]+):\s*(.+)$/)
      if (!fieldMatch || !currentQuote) continue
      const [, keyName, value] = fieldMatch
      if (keyName === 'item') currentQuote.item = compact(value)
      else if (keyName === 'unit_price') currentQuote.unitPrice = optionalNumberFromText(value)
      else if (keyName === 'total') currentQuote.totalPrice = optionalNumberFromText(value)
      else if (keyName === 'lead') currentQuote.lead = compact(value)
      else if (keyName === 'notes') currentQuote.notes = compact(value)
    }
  }
  finishItem()
  finishBid()
  if (lineItems.length === 0 || bids.length === 0) return null
  return {
    lineItems,
    bids,
    warnings: [{ message: `Imported ${bids.length} multiple supplier quote responses from YAML vendor comparison layout.` }],
  }
}

function parseGenericQuoteTable(text: string): GenericParsedImport | null {
  const xml = parseXmlVendorComparison(text)
  if (xml) return xml
  const yaml = parseYamlVendorComparison(text)
  if (yaml) return yaml
  const html = parseHtmlTable(text)
  if (html) return {
    ...html,
    warnings: [{ message: `Imported ${html.bids.length} multiple supplier quote responses from HTML table layout.` }],
  }
  const fixedWidth = parseFixedWidthTable(text)
  if (fixedWidth) return {
    ...fixedWidth,
    warnings: [{ message: `Imported ${fixedWidth.bids.length} multiple supplier quote responses from fixed-width text table layout.` }],
  }
  const compactPdfMatrix = parseCompactPdfMatrix(text)
  if (compactPdfMatrix) return compactPdfMatrix
  return parseGenericRows(delimitedRows(text))
}

function parsedLineItemId(rfqId: string, parsed: ParsedQuoteLine, usedIds: Set<string>) {
  return uniqueId(`${rfqId}-line-${idPart(parsed.itemNumber)}-${idPart(parsed.sku || parsed.description)}-${parsed.sourceRow}`, usedIds)
}

function lineItemFromParsed(rfqId: string, parsed: ParsedQuoteLine, usedIds: Set<string>): ContractorRFQLineItem {
  return {
    id: parsedLineItemId(rfqId, parsed, usedIds),
    sku: parsed.sku,
    description: parsed.description,
    quantity: parsed.quantity,
    unit: parsed.unit,
    notes: parsed.pricePerQuantity && parsed.pricePerUnit
      ? `Imported quote price basis: ${parsed.unitPrice.toLocaleString()} per ${parsed.pricePerQuantity.toLocaleString()} ${parsed.pricePerUnit}.`
      : undefined,
  }
}

function responseSourceRow(response: ContractorBid['line_item_responses'][number]) {
  return response.response_attributes?.find((attribute) => attribute.key === 'source_row')?.value
}

function priceReviewWarningsForBids(bids: ContractorBid[]): ExternalQuoteImportWarning[] {
  const zeroPriceResponses = bids.flatMap((bid) => (
    bid.line_item_responses
      .filter((response) => response.availability !== 'unavailable' && (response.unit_price === 0 || response.total_price === 0))
      .map((response) => ({ bid, response }))
  ))

  if (zeroPriceResponses.length === 0) return []

  const examples = zeroPriceResponses.slice(0, 6).map(({ bid, response }) => {
    const sourceRow = responseSourceRow(response)
    return compact([
      bid.vendor_name,
      response.sku || response.description,
      sourceRow ? `source row ${sourceRow}` : '',
    ].filter(Boolean).join(' '))
  })

  return [{
    message: `Imported ${zeroPriceResponses.length} quote row${zeroPriceResponses.length === 1 ? '' : 's'} with a $0 unit or total price; review ${examples.join('; ')}${zeroPriceResponses.length > examples.length ? `, and ${zeroPriceResponses.length - examples.length} more` : ''} against the original file before relying on totals.`,
  }]
}

export function createExternalQuoteImport(input: ExternalQuoteImportInput): ExternalQuoteImportResult {
  const now = input.now ?? new Date().toISOString()
  const genericImport = parseGenericQuoteTable(input.text)
  if (genericImport) {
    const title = titleFromFilename(input.filename)
    const rfqId = `rfq-import-${idPart(title)}-${idPart(now)}`
    const lineItems: ContractorRFQLineItem[] = genericImport.lineItems.map((line) => ({
      id: `${rfqId}-line-${idPart(line.itemNumber)}`,
      sku: line.sku,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
    }))
    const lineByItemNumber = new Map(genericImport.lineItems.map((line, index) => [line.itemNumber, lineItems[index]]))
    const bids: ContractorBid[] = genericImport.bids.map((parsedBid) => {
      const bidLines = parsedBid.lines.flatMap((line) => {
        const item = lineByItemNumber.get(line.lineItemKey)
        if (!item) return []
        const normalized = normalizeImportedPriceValues({
          unitPrice: line.unitPrice,
          totalPrice: line.totalPrice,
          unit: line.unit,
          sourceKind: 'generic',
        })
        return [{
          line_item_id: item.id,
          sku: line.sku,
          description: line.description,
          quantity: line.quantity,
          quoted_quantity: line.quantity,
          unit: line.unit,
          unit_price: normalized.unitPrice,
          total_price: normalized.totalPrice,
          lead_time_days: line.leadTimeDays,
          availability: 'can_source' as const,
          is_alternate: false,
          notes: compact([`Imported from ${input.filename}, source row ${line.sourceRow}.`, line.notes].filter(Boolean).join(' ')),
          response_attributes: [
            {
              key: 'source_row',
              label: 'Source Row',
              value: String(line.sourceRow),
              source: 'spreadsheet' as const,
              order: 1,
            },
            ...sourceFileAttributes(input),
            ...normalized.attributes,
          ],
        }]
      })
      return {
        id: `bid-import-${idPart(parsedBid.vendorName)}-${idPart(now)}`,
        rfq_id: rfqId,
        vendor_name: parsedBid.vendorName,
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
      },
      procurement_requirements: [],
      commodity_watch: [],
      risk_flags: [],
      vendor_response_fields: [],
      attachment_urls: input.sourceUrl ? [input.sourceUrl] : [],
      line_items: lineItems,
      invites: bids.map((bid) => ({
        vendor_email: '',
        vendor_name: bid.vendor_name,
        on_platform: false,
      })),
      invited_vendor_ids: [],
      invited_vendor_emails: [],
      visibility: 'invited_only',
      created_at: now,
      published_at: now,
    }

    return {
      rfq,
      bid: bids[0],
      bids,
      warnings: [
        ...genericImport.warnings,
        ...bids.flatMap((bid) => totalReconciliationWarnings(input.text, bid, input.filename)),
        ...priceReviewWarningsForBids(bids),
        { message: 'Review imported multiple supplier coverage, no-bid rows, imported notes, and totals before relying on comparisons.' },
        { message: 'Imported quote notes are preserved as notes only; they do not mark rows as alternates or substitutions.' },
      ],
    }
  }

  const supplier = extractSupplier(input.text)
  const title = extractQuoteTitle(input.text, input.filename)
  const rfqId = `rfq-import-${idPart(title)}-${idPart(now)}`
  const bidId = `bid-import-${idPart(supplier)}-${idPart(now)}`
  const sourceTableParsedLines = parseSourceTableQuoteLines(input.text)
  const parsedLines = mergeSourceTableQuoteLines(parseQuoteLines(input.text), sourceTableParsedLines)
  const compactParsedLines = parsedLines.length ? parsedLines : parseCompactQuoteLines(input.text)
  const extractedPdfParsedLines = compactParsedLines.length ? [] : parseExtractedPdfQuoteLines(input.text)
  const inlineParsedLines = compactParsedLines.length || extractedPdfParsedLines.length ? [] : parseInlineEmailQuoteLines(input.text)
  const fallbackParsedLines = compactParsedLines.length ? compactParsedLines : extractedPdfParsedLines.length ? extractedPdfParsedLines : inlineParsedLines

  if (fallbackParsedLines.length === 0) {
    throw new Error('No priced quote rows were found in this import.')
  }

  const usedLineItemIds = new Set<string>()
  const parsedLinesForImport = fallbackParsedLines.map((line) => ({
    ...line,
    description: line.descriptionFromSourceColumn ? line.description : stripLeadingRepeatedSku(line.description, line.sku),
  }))
  const lineItems = parsedLinesForImport.map((line) => lineItemFromParsed(rfqId, line, usedLineItemIds))
  const bidLines = parsedLinesForImport.map((line, index) => {
    const item = lineItems[index]!
    const normalized = normalizeImportedPriceValues({
      unitPrice: line.unitPrice,
      totalPrice: line.totalPrice,
      unit: line.unit,
      sourceKind: 'parsed',
      pricePerQuantity: line.pricePerQuantity,
      pricePerUnit: line.pricePerUnit,
    })
    return {
      line_item_id: item.id,
      sku: line.sku,
      description: line.description,
      quantity: line.quantity,
      quoted_quantity: line.quantity,
      unit: line.unit,
      unit_price: normalized.unitPrice,
      total_price: normalized.totalPrice,
      lead_time_days: line.leadTimeDays ?? 0,
      availability: 'can_source' as const,
      is_alternate: false,
      notes: `Imported from ${input.filename}, source row ${line.sourceRow}.`,
      response_attributes: [
        {
          key: 'source_row',
          label: 'Source Row',
          value: String(line.sourceRow),
          source: 'spreadsheet' as const,
          order: 1,
        },
        ...sourceFileAttributes(input),
        ...(line.pricePerQuantity && line.pricePerUnit ? [{
          key: 'price_basis',
          label: 'Price Basis',
          value: `${line.unitPrice} per ${line.pricePerQuantity} ${line.pricePerUnit}`,
          source: 'spreadsheet' as const,
          order: 2,
        }] : []),
        ...normalized.attributes,
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
    attachment_urls: input.sourceUrl ? [input.sourceUrl] : [],
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
    bids: [bid],
    warnings: [
      ...(inlineParsedLines.length > 0 ? [{
        message: 'Read quote values from inline email-style text.',
      }] : []),
      ...(extractedPdfParsedLines.length > 0 ? [{
        message: 'Read quote values from compact PDF text columns with validated item, quantity, unit, price, total, and lead-time fields.',
      }] : []),
      ...totalReconciliationWarnings(input.text, bid, input.filename),
      ...priceReviewWarningsForBids([bid]),
      {
        message: 'Imported as a single vendor quote comparison. Review extracted quantities, pricing, and price basis before relying on totals.',
      },
    ],
  }
}

export function createExternalQuoteImportFromFiles(input: ExternalQuoteImportBatchInput): ExternalQuoteImportResult {
  const now = input.now ?? new Date().toISOString()
  const title = compact(input.title) || 'Imported Vendor Quotes'
  const rfqId = `rfq-import-${idPart(title)}-${idPart(now)}`
  const importedFiles = input.files.filter((file) => file.text.trim())

  if (importedFiles.length === 0) {
    throw new Error('Upload at least one readable vendor quote file.')
  }

  const lineItems: ContractorRFQLineItem[] = []
  const lineItemByKey = new Map<string, ContractorRFQLineItem>()
  const lineItemIdBySourceId = new Map<string, string>()
  const lineItemReviewBySourceId = new Map<string, string>()
  const usedLineItemIds = new Set<string>()
  const usedBidIds = new Set<string>()
  const bids: ContractorBid[] = []
  const warnings: ExternalQuoteImportWarning[] = []
  const sourceFilenames = importedFiles.map((file) => file.filename)

  importedFiles.forEach((file, fileIndex) => {
    const imported = createExternalQuoteImport({
      projectId: input.projectId,
      projectName: input.projectName,
      filename: file.filename,
      sourceKind: file.sourceKind,
      text: file.text,
      sourceUrl: file.sourceUrl,
      now: `${now}-${fileIndex + 1}`,
    })

    warnings.push(
      ...imported.warnings.map((warning) => ({
        ...warning,
        message: `${file.filename}: ${warning.message}`,
      })),
    )

    for (const sourceLineItem of imported.rfq.line_items) {
      const key = comparisonKeyForLineItem(sourceLineItem, { preserveRepeatedSourceRows: importedFiles.length === 1 })
      const existing = lineItemByKey.get(key)
      if (existing) {
        lineItemIdBySourceId.set(sourceLineItem.id, existing.id)
        if (
          existing.quantity !== sourceLineItem.quantity ||
          normalizeUnit(existing.unit) !== normalizeUnit(sourceLineItem.unit)
        ) {
          warnings.push({
            message: `${file.filename}: ${sourceLineItem.sku || sourceLineItem.description} matched an existing line item with a different quantity or unit.`,
          })
        }
        if (compact(existing.description).toLowerCase() !== compact(sourceLineItem.description).toLowerCase()) {
          warnings.push({
            message: `${file.filename}: ${sourceLineItem.sku || sourceLineItem.description} matched an existing SKU with a different description; preserving the vendor's quoted description on that response.`,
          })
        }
        continue
      }

      const canonicalId = uniqueId(`${rfqId}-line-${idPart(sourceLineItem.sku || sourceLineItem.description)}`, usedLineItemIds)
      const canonicalLineItem: ContractorRFQLineItem = {
        ...sourceLineItem,
        id: canonicalId,
      }
      lineItems.push(canonicalLineItem)
      lineItemByKey.set(key, canonicalLineItem)
      lineItemIdBySourceId.set(sourceLineItem.id, canonicalId)
    }

    for (const sourceBid of imported.bids) {
      const bidId = uniqueBidId(`bid-import-${idPart(sourceBid.vendor_name)}-${idPart(now)}`, usedBidIds)
      const line_item_responses = sourceBid.line_item_responses.flatMap((response) => {
        const canonicalLineItemId = lineItemIdBySourceId.get(response.line_item_id)
        if (!canonicalLineItemId) return []
        return [{
          ...response,
          line_item_id: canonicalLineItemId,
          is_alternate: false,
          notes: compact([response.notes, `Source file: ${file.filename}.`].filter(Boolean).join(' ')),
          response_attributes: [
            ...(response.response_attributes ?? []),
            ...(lineItemReviewBySourceId.get(response.line_item_id) ? [{
              key: 'match_review',
              label: 'Match Review',
              value: lineItemReviewBySourceId.get(response.line_item_id)!,
              source: 'spreadsheet' as const,
              order: 9_100,
            }] : []),
          ],
        }]
      })

      bids.push({
        ...sourceBid,
        id: bidId,
        rfq_id: rfqId,
        submitted_at: now,
        total_price: Number(line_item_responses.reduce((sum, line) => sum + line.total_price, 0).toFixed(2)),
        line_item_responses,
        notes: `Imported from ${file.filename}.`,
      })
    }
  })

  if (lineItems.length === 0 || bids.length === 0) {
    throw new Error('No priced vendor quote rows were found across the uploaded files.')
  }

  const rfq: ContractorRFQ = {
    id: rfqId,
    project_id: input.projectId,
    title,
    request_type: 'rfq',
    status: 'active',
    category: undefined,
    rfp_details: {
      attachments_summary: `Created by External Quote Import from ${sourceFilenames.join(', ')}.`,
    },
    procurement_requirements: [],
    commodity_watch: [],
    risk_flags: [],
    vendor_response_fields: [],
    attachment_urls: sourceUrlsFromFiles(importedFiles),
    line_items: lineItems,
    invites: bids.map((bid) => ({
      vendor_email: '',
      vendor_name: bid.vendor_name,
      on_platform: false,
    })),
    invited_vendor_ids: [],
    invited_vendor_emails: [],
    visibility: 'invited_only',
    created_at: now,
    published_at: now,
  }

  return {
    rfq,
    bid: bids[0],
    bids,
    warnings: [
      ...warnings,
      { message: `Imported ${bids.length} vendor quote response${bids.length === 1 ? '' : 's'} from ${importedFiles.length} file${importedFiles.length === 1 ? '' : 's'}.` },
      { message: 'Review normalized line-item matches, no-bid rows, imported notes, and totals before relying on comparisons.' },
      { message: 'Imported quote notes are preserved as notes only; they do not mark rows as alternates or substitutions.' },
    ],
  }
}

export function mergeExternalQuoteImportIntoRFQ(input: ExternalQuoteImportMergeInput): ExternalQuoteImportMergeResult {
  const now = input.now ?? new Date().toISOString()
  const targetRfq = input.targetRfq
  const usedLineItemIds = new Set(targetRfq.line_items.map((line) => line.id))
  const usedBidIds = new Set(input.existingBids.map((bid) => bid.id))
  const lineItemByKey = new Map(targetRfq.line_items.map((line) => [comparisonKeyForLineItem(line), line]))
  const sourceLineItemToTargetId = new Map<string, string>()
  const sourceLineItemReview = new Map<string, string>()
  const semanticMatchBySourceId = new Map((input.semanticMatches ?? [])
    .filter((match) => match.targetLineItemId && match.confidence >= 0.78)
    .map((match) => [match.importedLineItemId, match]))
  const addedLineItems: ContractorRFQLineItem[] = []
  const warnings: ExternalQuoteImportWarning[] = [...input.imported.warnings]

  for (const sourceLineItem of input.imported.rfq.line_items) {
    const key = comparisonKeyForLineItem(sourceLineItem)
    const existing = lineItemByKey.get(key)
    if (existing) {
      sourceLineItemToTargetId.set(sourceLineItem.id, existing.id)
      if (
        existing.quantity !== sourceLineItem.quantity ||
        normalizeUnit(existing.unit) !== normalizeUnit(sourceLineItem.unit)
      ) {
        warnings.push({
          message: `${sourceLineItem.sku || sourceLineItem.description} matched an existing line item with a different quantity or unit.`,
        })
      }
      if (compact(existing.description).toLowerCase() !== compact(sourceLineItem.description).toLowerCase()) {
        warnings.push({
          message: `${sourceLineItem.sku || sourceLineItem.description} matched an existing SKU with a different description; preserving the vendor's quoted description on that response.`,
        })
      }
      continue
    }

    const modelMatch = semanticMatchBySourceId.get(sourceLineItem.id)
    const modelTarget = modelMatch?.targetLineItemId
      ? targetRfq.line_items.find((lineItem) => lineItem.id === modelMatch.targetLineItemId)
      : undefined
    if (modelMatch && modelTarget) {
      sourceLineItemToTargetId.set(sourceLineItem.id, modelTarget.id)
      const message = `AI matched "${sourceLineItem.sku || sourceLineItem.description}" to existing row "${modelTarget.sku || modelTarget.description}" (${Math.round(modelMatch.confidence * 100)}% confidence). ${modelMatch.reason} Review the imported cells against the source file.`
      if (modelMatch.reviewRequired || modelMatch.confidence < 0.92) {
        sourceLineItemReview.set(sourceLineItem.id, message)
      }
      warnings.push({ message })
      continue
    }

    const semanticCandidates = targetRfq.line_items
      .map((lineItem) => ({
        lineItem,
        score: semanticLineMatchScore(lineItem, sourceLineItem),
      }))
      .filter((candidate) => candidate.score >= 0.72)
      .sort((a, b) => b.score - a.score)
    const semantic = semanticCandidates[0]
    const runnerUp = semanticCandidates[1]
    if (semantic && (!runnerUp || semantic.score - runnerUp.score >= 0.12)) {
      sourceLineItemToTargetId.set(sourceLineItem.id, semantic.lineItem.id)
      const message = `Semantically matched "${sourceLineItem.sku || sourceLineItem.description}" to existing row "${semantic.lineItem.sku || semantic.lineItem.description}" (${Math.round(semantic.score * 100)}% text match). Review the highlighted imported cells against the source file.`
      sourceLineItemReview.set(sourceLineItem.id, message)
      warnings.push({ message })
      continue
    }
    if (semantic) {
      warnings.push({
        message: `"${sourceLineItem.sku || sourceLineItem.description}" looked similar to multiple existing rows, so Rialto added it as a separate review row instead of auto-matching it.`,
      })
    }

    const lineItem: ContractorRFQLineItem = {
      ...sourceLineItem,
      id: uniqueId(`${targetRfq.id}-line-${idPart(sourceLineItem.sku || sourceLineItem.description)}`, usedLineItemIds),
    }
    lineItemByKey.set(key, lineItem)
    sourceLineItemToTargetId.set(sourceLineItem.id, lineItem.id)
    addedLineItems.push(lineItem)
  }

  const bids = input.imported.bids.map((sourceBid) => {
    const line_item_responses = sourceBid.line_item_responses.flatMap((response) => {
      const lineItemId = sourceLineItemToTargetId.get(response.line_item_id)
      if (!lineItemId) return []
      return [{
        ...response,
        line_item_id: lineItemId,
        is_alternate: false,
        response_attributes: [
          ...(response.response_attributes ?? []),
          ...(sourceLineItemReview.get(response.line_item_id) ? [{
            key: 'match_review',
            label: 'Match Review',
            value: sourceLineItemReview.get(response.line_item_id)!,
            source: 'spreadsheet' as const,
            order: 9_100,
          }] : []),
        ],
      }]
    })
    return {
      ...sourceBid,
      id: uniqueBidId(`bid-import-${idPart(sourceBid.vendor_name)}-${idPart(now)}`, usedBidIds),
      rfq_id: targetRfq.id,
      submitted_at: now,
      total_price: Number(line_item_responses.reduce((sum, line) => sum + line.total_price, 0).toFixed(2)),
      line_item_responses,
    }
  }).filter((bid) => bid.line_item_responses.length > 0)

  if (bids.length === 0) {
    throw new Error('No imported quote rows matched or added comparison line items.')
  }

  return {
    rfq: {
      ...targetRfq,
      line_items: [...targetRfq.line_items, ...addedLineItems],
      attachment_urls: [...new Set([...(targetRfq.attachment_urls ?? []), ...(input.imported.rfq.attachment_urls ?? [])])],
      invites: [
        ...(targetRfq.invites ?? []),
        ...bids.map((bid) => ({
          vendor_email: '',
          vendor_name: bid.vendor_name,
          on_platform: false,
        })),
      ],
    },
    addedLineItems,
    bids,
    warnings: [
      ...warnings,
      { message: `Added ${bids.length} imported vendor quote response${bids.length === 1 ? '' : 's'} to this comparison.` },
      { message: `Matched ${input.imported.rfq.line_items.length - addedLineItems.length} existing line item${input.imported.rfq.line_items.length - addedLineItems.length === 1 ? '' : 's'} and added ${addedLineItems.length} new line item${addedLineItems.length === 1 ? '' : 's'}.` },
    ],
  }
}
