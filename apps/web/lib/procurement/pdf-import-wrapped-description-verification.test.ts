import { describe, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { buildImportedQuoteComparison } from '../modules/quote-comparison/imported-quote-comparison'

type ExpectedLine = {
  itemNumber: string
  sku: string
  descriptionFirst: string
  descriptionContinuation: string
  quantity: number
  unit: string
  unitPrice: number
  totalPrice: number
  leadTimeDays: number
}

type ExpectedQuote = {
  filename: string
  vendorName: string
  lines: ExpectedLine[]
}

const firstDescriptions = [
  'Fire-rated gypsum shaftliner panel assembly',
  'Cold-formed metal stud and track',
  'Acoustical sealant and smoke gasket',
  'Access panel primed steel door',
  'Concrete anchor bolt and washer',
  'Mineral wool safing and firestop',
  'Expansion joint cover plate assembly',
  'Corner bead trim and casing',
]

const continuationDescriptions = [
  'ASTM C645 20ga 10 ft lengths for corridor level 2',
  'package 5/8 in Type X 4 ft x 12 ft board with tapered edge',
  'kit 29 oz tubes, color white, includes nozzle packs',
  'frame 24 x 36 fire rated, keyed latch, drywall return',
  'set 1/2 in x 5-1/2 in zinc plated, seismic clip area',
  'system 4 in thickness x 24 in width, density 4.0 pcf',
  '2 in reveal, mill aluminum, include splice plates',
  'bead bundle 10 ft sticks, vinyl, with 093 control joint trim',
]

const units = ['EA', 'SY', 'Bundle', 'LF', 'CY', 'Box', 'SF', 'Tube'] as const

function money(value: number) {
  return Number(value.toFixed(2))
}

function displayNumber(value: number) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

function displayMoney(value: number, lineIndex: number) {
  const amount = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  if (value >= 0) return `$${amount}`
  return lineIndex % 3 === 0 ? `($${amount})` : `-$${amount}`
}

function expectedQuote(index: number): ExpectedQuote {
  const vendorName = `Wrapped PDF Vendor ${String(index + 1).padStart(3, '0')}`
  const lines = Array.from({ length: 18 }, (_, lineIndex): ExpectedLine => {
    const quantity = lineIndex % 6 === 2 ? money(900 + index * 13 + lineIndex * 2.5) : 8 + ((index * 17 + lineIndex * 23) % 560)
    const isCredit = lineIndex % 9 === 6
    const unitPriceMagnitude = money(1.11 + ((index * 19 + lineIndex * 29) % 2600) / 100)
    const unitPrice = isCredit ? -unitPriceMagnitude : unitPriceMagnitude
    return {
      itemNumber: `W${String(index + 1).padStart(3, '0')}${String(lineIndex + 1).padStart(2, '0')}`,
      sku: `WRAP-${String(index + 1).padStart(3, '0')}-${String(lineIndex + 1).padStart(2, '0')}`,
      descriptionFirst: firstDescriptions[(index + lineIndex) % firstDescriptions.length],
      descriptionContinuation: continuationDescriptions[(index * 2 + lineIndex) % continuationDescriptions.length],
      quantity,
      unit: units[(index + lineIndex) % units.length].toLowerCase(),
      unitPrice,
      totalPrice: money(quantity * unitPrice),
      leadTimeDays: 2 + ((index + lineIndex * 5) % 40),
    }
  })
  return {
    filename: `wrapped-description-corpus-${String(index + 1).padStart(3, '0')}.pdf`,
    vendorName,
    lines,
  }
}

async function writePdf(quote: ExpectedQuote, dir: string) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let page = pdf.addPage([842, 595])
  let y = 548

  function header(pageNumber: number) {
    page.drawText(`Supplier : ${quote.vendorName} Expected Delivery Date : 09 / ${String(6 + pageNumber).padStart(2, '0')} / 2026`, { x: 32, y, size: 8, font })
    y -= 20
    page.drawText('Line', { x: 32, y, size: 7, font: bold })
    page.drawText('SKU', { x: 86, y, size: 7, font: bold })
    page.drawText('Description', { x: 168, y, size: 7, font: bold })
    page.drawText('Qty', { x: 482, y, size: 7, font: bold })
    page.drawText('Unit', { x: 542, y, size: 7, font: bold })
    page.drawText('Unit Price', { x: 588, y, size: 7, font: bold })
    page.drawText('Ext Total', { x: 672, y, size: 7, font: bold })
    page.drawText('Lead', { x: 756, y, size: 7, font: bold })
    y -= 16
  }

  header(1)
  for (const [lineIndex, line] of quote.lines.entries()) {
    if (lineIndex > 0 && lineIndex % 6 === 0) {
      page = pdf.addPage([842, 595])
      y = 548
      header(Math.floor(lineIndex / 6) + 1)
    }
    page.drawText(line.itemNumber, { x: 32, y, size: 7, font })
    page.drawText(line.sku, { x: 86, y, size: 7, font })
    page.drawText(line.descriptionFirst, { x: 168, y, size: 7, font })
    y -= 12
    page.drawText(line.descriptionContinuation, { x: 168, y, size: 7, font })
    page.drawText(displayNumber(line.quantity), { x: 482, y, size: 7, font })
    page.drawText(line.unit.toUpperCase(), { x: 542, y, size: 7, font })
    page.drawText(displayMoney(line.unitPrice, lineIndex), { x: 588, y, size: 7, font })
    page.drawText(displayMoney(line.totalPrice, lineIndex), { x: 672, y, size: 7, font })
    page.drawText(`${line.leadTimeDays} days`, { x: 756, y, size: 7, font })
    y -= 18
  }

  const buffer = Buffer.from(await pdf.save())
  const filePath = path.join(dir, quote.filename)
  fs.writeFileSync(filePath, buffer)
  return { buffer, filePath }
}

describe('wrapped description PDF import verification', () => {
  it('imports 110 fresh wrapped-description PDFs exactly by SKU', async () => {
    const quotes = Array.from({ length: 110 }, (_, index) => expectedQuote(index))
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rialto-wrapped-description-pdf-'))
    const mismatches: string[] = []
    let importedLineItems = 0
    let importedResponses = 0
    let failedImports = 0

    for (const expected of quotes) {
      const { buffer, filePath } = await writePdf(expected, dir)
      let built: Awaited<ReturnType<typeof buildImportedQuoteComparison>>
      try {
        built = await buildImportedQuoteComparison({
          projectId: 'project-wrapped-description',
          projectName: 'Wrapped Description Verification',
          files: [{ name: expected.filename, type: 'application/pdf', buffer }],
        })
      } catch (error) {
        failedImports += 1
        mismatches.push(`${expected.filename}: import failed for ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
        continue
      }

      const imported = built.imported
      importedLineItems += imported.rfq.line_items.length
      importedResponses += imported.bid.line_item_responses.length
      const actualLineBySku = new Map(imported.rfq.line_items.map((line) => [line.sku, line]))
      const actualResponseBySku = new Map(imported.bid.line_item_responses.map((line) => [line.sku, line]))

      if (built.diagnostics.processedFiles[0]?.mode !== 'normal') mismatches.push(`${expected.filename}: mode ${built.diagnostics.processedFiles[0]?.mode ?? 'missing'} != normal`)
      if (imported.bid.vendor_name !== expected.vendorName) mismatches.push(`${expected.filename}: vendor ${imported.bid.vendor_name} != ${expected.vendorName}`)
      if (imported.rfq.line_items.length !== expected.lines.length) mismatches.push(`${expected.filename}: line item count ${imported.rfq.line_items.length} != ${expected.lines.length}`)
      if (imported.bid.line_item_responses.length !== expected.lines.length) mismatches.push(`${expected.filename}: response count ${imported.bid.line_item_responses.length} != ${expected.lines.length}`)

      for (const expectedLine of expected.lines) {
        const actualLine = actualLineBySku.get(expectedLine.sku)
        const actualResponse = actualResponseBySku.get(expectedLine.sku)
        const expectedDescription = `${expectedLine.descriptionFirst} ${expectedLine.descriptionContinuation}`
        const prefix = `${expected.filename} ${expectedLine.sku}`
        if (!actualLine) {
          mismatches.push(`${prefix}: missing line item`)
          continue
        }
        if (!actualResponse) {
          mismatches.push(`${prefix}: missing response`)
          continue
        }
        if (actualLine.description !== expectedDescription) mismatches.push(`${prefix}: description ${actualLine.description} != ${expectedDescription}`)
        if (actualLine.quantity !== expectedLine.quantity) mismatches.push(`${prefix}: quantity ${actualLine.quantity} != ${expectedLine.quantity}`)
        if (actualLine.unit !== expectedLine.unit) mismatches.push(`${prefix}: unit ${actualLine.unit} != ${expectedLine.unit}`)
        const expectedUnitPrice = Math.abs(expectedLine.unitPrice)
        const expectedTotalPrice = Math.abs(expectedLine.totalPrice)
        if (actualResponse.unit_price !== expectedUnitPrice) mismatches.push(`${prefix}: unit price ${actualResponse.unit_price} != ${expectedUnitPrice}`)
        if (actualResponse.total_price !== expectedTotalPrice) mismatches.push(`${prefix}: total ${actualResponse.total_price} != ${expectedTotalPrice}`)
        if (expectedLine.unitPrice < 0 && !actualResponse.response_attributes?.some((attribute) => attribute.key === 'import_review:unit_price:negative_price')) {
          mismatches.push(`${prefix}: missing negative unit price import review attribute`)
        }
        if (expectedLine.totalPrice < 0 && !actualResponse.response_attributes?.some((attribute) => attribute.key === 'import_review:total:negative_price')) {
          mismatches.push(`${prefix}: missing negative total import review attribute`)
        }
        if (actualResponse.lead_time_days !== expectedLine.leadTimeDays) mismatches.push(`${prefix}: lead ${actualResponse.lead_time_days} != ${expectedLine.leadTimeDays}`)
        if (actualResponse.availability !== 'can_source') mismatches.push(`${prefix}: availability ${actualResponse.availability}`)
        if (actualResponse.is_alternate !== false) mismatches.push(`${prefix}: alternate ${actualResponse.is_alternate}`)
      }

      const expectedTotal = money(expected.lines.reduce((sum, line) => sum + Math.abs(line.totalPrice), 0))
      if (imported.bid.total_price !== expectedTotal) mismatches.push(`${expected.filename}: bid total ${imported.bid.total_price} != ${expectedTotal}`)
    }

    if (mismatches.length > 0) {
      throw new Error(`Found ${mismatches.length} mismatches across ${quotes.length} fresh PDFs in ${dir}. Expected ${quotes.length * 18} rows; imported ${importedLineItems} line items and ${importedResponses} responses; failed imports: ${failedImports}.\n${mismatches.slice(0, 80).join('\n')}`)
    }
  }, 180_000)
})
