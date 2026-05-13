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
  bids: ContractorBid[]
  warnings: ExternalQuoteImportWarning[]
}

export interface ExternalQuoteImportFileInput {
  filename: string
  sourceKind: ExternalQuoteImportSourceKind
  text: string
}

export interface ExternalQuoteImportBatchInput {
  projectId: string
  projectName: string
  title: string
  files: ExternalQuoteImportFileInput[]
  now?: string
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

function quoteRowNumberFromText(value: string) {
  return Math.abs(numberFromText(value))
}

function optionalNumberFromText(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const text = String(value ?? '').trim()
  if (!text || /^(?:n\/a|na|tbd|no bid|no-bid)$/i.test(text)) return undefined
  const negative = /^\s*-/.test(text)
  const parsed = Number.parseFloat(text.replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(parsed)) return undefined
  return negative ? -parsed : parsed
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

function comparisonKeyForLineItem(line: Pick<ContractorRFQLineItem, 'sku' | 'description' | 'unit'>) {
  const sku = normalizeSku(line.sku ?? '').toLowerCase()
  if (sku) return `sku:${sku}`
  return `desc:${compact(line.description).toLowerCase()}|unit:${normalizeUnit(line.unit)}`
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
    quantity: quoteRowNumberFromText(quantityText),
    unit: normalizeUnit(unit),
    unitPrice: quoteRowNumberFromText(unitPriceText),
    pricePerQuantity: priceBasis ? quoteRowNumberFromText(priceBasis[1]) : undefined,
    pricePerUnit: priceBasis ? normalizeUnit(priceBasis[2]) : undefined,
    totalPrice: quoteRowNumberFromText(totalText.replace(/\$\s*/g, '')),
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

function parseCompactQuoteLine(rawLine: string, sourceRow: number): ParsedQuoteLine | null {
  const line = compact(rawLine)
  const prefix = line.match(/^([A-Z]\d{3,})\s+(\S+)\s+(.+)$/)
  if (!prefix) return null
  const [, itemNumber, sku, rest] = prefix
  const item = rest.match(/^(.+?)\s+(-?[0-9][0-9,.]*)\s+([A-Za-z]+)\s+(.+)$/)
  if (!item) return null
  const [, description, quantityText, unit, priceRest] = item
  if (/^no\s+bid\b/i.test(priceRest)) return null
  const price = priceRest.match(/^([0-9][0-9,.]*)\s+([0-9][0-9,.]*)\s+([0-9]+(?:-[0-9]+)?\s+(?:days?|weeks?))\b(.*)$/i)
  if (!price) return null
  const [, unitPriceText, totalText] = price
  return {
    sourceRow,
    itemNumber,
    sku: normalizeSku(sku),
    description: compact(description),
    quantity: quoteRowNumberFromText(quantityText),
    unit: normalizeUnit(unit),
    unitPrice: quoteRowNumberFromText(unitPriceText),
    totalPrice: quoteRowNumberFromText(totalText.replace(/\$\s*/g, '')),
    rawText: line,
  }
}

function parseCompactQuoteLines(text: string) {
  return text
    .split('\n')
    .map((line, index) => parseCompactQuoteLine(line, index + 1))
    .filter((line): line is ParsedQuoteLine => Boolean(line))
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
    const match = header.match(/^(.*?)\s+(unit price|unit cost|quoted unit cost|total price|extended cost|total|lead time|eta|notes|clarifications)$/i)
    if (!match) return
    const vendorName = compact(match[1])
    if (!vendorName || ['unit', 'qty', 'required'].includes(vendorName.toLowerCase())) return
    const group = groups.get(vendorName) ?? { vendorName }
    const metric = headerKey(match[2])
    if (['unitprice', 'unitcost', 'quotedunitcost'].includes(metric)) group.unitPrice = index
    else if (['totalprice', 'extendedcost', 'total'].includes(metric)) group.totalPrice = index
    else if (['leadtime', 'eta'].includes(metric)) group.lead = index
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

function parseGenericQuoteTable(text: string): GenericParsedImport | null {
  const rows = delimitedRows(text)
  const headerIndex = findGenericHeaderRow(rows)
  if (headerIndex < 0) return null
  return parseRepeatedSupplierBlockTable(rows, headerIndex) ??
    parseRowPerVendorTable(rows, headerIndex) ??
    parseWideVendorTable(rows, headerIndex) ??
    parseSingleVendorTable(rows, headerIndex)
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
        return [{
          line_item_id: item.id,
          sku: line.sku,
          description: line.description,
          quantity: line.quantity,
          quoted_quantity: line.quantity,
          unit: line.unit,
          unit_price: line.unitPrice,
          total_price: line.totalPrice,
          lead_time_days: line.leadTimeDays,
          availability: 'can_source' as const,
          is_alternate: false,
          notes: compact([`Imported from ${input.filename}, source row ${line.sourceRow}.`, line.notes].filter(Boolean).join(' ')),
          response_attributes: [{
            key: 'source_row',
            label: 'Source Row',
            value: String(line.sourceRow),
            source: 'spreadsheet' as const,
            order: 1,
          }],
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
      attachment_urls: [],
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
        { message: 'Review imported multiple supplier coverage, no-bid rows, imported notes, and totals before relying on comparisons.' },
        { message: 'Imported quote notes are preserved as notes only; they do not mark rows as alternates or substitutions.' },
      ],
    }
  }

  const supplier = extractSupplier(input.text)
  const title = extractQuoteTitle(input.text, input.filename)
  const rfqId = `rfq-import-${idPart(title)}-${idPart(now)}`
  const bidId = `bid-import-${idPart(supplier)}-${idPart(now)}`
  const parsedLines = parseQuoteLines(input.text)
  const compactParsedLines = parsedLines.length ? parsedLines : parseCompactQuoteLines(input.text)

  if (compactParsedLines.length === 0) {
    throw new Error('No priced quote rows were found in this import.')
  }

  const lineItems = compactParsedLines.map((line) => lineItemFromParsed(rfqId, line))
  const lineByItemNumber = new Map(compactParsedLines.map((line, index) => [line.itemNumber, lineItems[index]]))
  const bidLines = compactParsedLines.map((line) => {
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
    bids: [bid],
    warnings: [
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
      now: `${now}-${fileIndex + 1}`,
    })

    warnings.push(
      ...imported.warnings.map((warning) => ({
        ...warning,
        message: `${file.filename}: ${warning.message}`,
      })),
    )

    for (const sourceLineItem of imported.rfq.line_items) {
      const key = comparisonKeyForLineItem(sourceLineItem)
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
    attachment_urls: [],
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
