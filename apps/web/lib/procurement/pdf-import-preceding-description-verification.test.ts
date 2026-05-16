import { describe, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { buildImportedQuoteComparison } from '../modules/quote-comparison/imported-quote-comparison'

type ExpectedLine = {
  itemNumber: string
  sku: string
  descriptionPrefix: string
  descriptionSuffix: string
  description: string
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

const prefixes = [
  'UL design U419 partition assembly with resilient channel',
  'Exterior shaft wall assembly including firestopping at perimeter',
  'Level 03 corridor framing package with seismic bracing clips',
  'Acoustic treatment package for conference rooms and offices',
  'Roof curb infill patch kit with treated blocking allowance',
  'Return credit for deleted west stair material release',
  'Long-lead access panel package with keyed cylinder option',
  'Smoke seal and joint treatment for rated penetrations',
]

const suffixes = [
  '5/8 in Type X gypsum board 4x12 sheets',
  '362S125-30 20ga studs 10 ft stock length',
  'J-runner track 2-1/2 in x 20ga bundle',
  '29 oz acoustical sealant tubes white',
  '24 x 36 fire-rated access door prime coat',
  '1/2 in wedge anchor with washer kit',
  '4 in mineral wool safing strips',
  '10 ft vinyl corner bead sticks',
]

const units = ['EA', 'LF', 'SF', 'SY', 'CY', 'Tube', 'Bundle', 'Box'] as const

function money(value: number) {
  return Number(value.toFixed(2))
}

function displayNumber(value: number) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

function displayMoney(value: number) {
  const amount = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (value < 0) return `($${amount})`
  return `$${amount}`
}

function expectedQuote(index: number): ExpectedQuote {
  const vendorName = `Preceding Description Vendor ${String(index + 1).padStart(3, '0')}`
  const lines = Array.from({ length: 20 }, (_, lineIndex): ExpectedLine => {
    const quantity = lineIndex % 4 === 1 ? money(1000 + index * 3 + lineIndex * 2.25) : 15 + ((index * 23 + lineIndex * 31) % 680)
    const unitPriceMagnitude = money(1.2 + ((index * 47 + lineIndex * 17) % 3000) / 100)
    const unitPrice = lineIndex % 10 === 5 ? -unitPriceMagnitude : unitPriceMagnitude
    const descriptionPrefix = prefixes[(index + lineIndex) % prefixes.length]
    const descriptionSuffix = suffixes[(index * 3 + lineIndex) % suffixes.length]
    return {
      itemNumber: `P${String(index + 1).padStart(3, '0')}${String(lineIndex + 1).padStart(2, '0')}`,
      sku: `PRE-${String(index + 1).padStart(3, '0')}-${String(lineIndex + 1).padStart(2, '0')}`,
      descriptionPrefix,
      descriptionSuffix,
      description: `${descriptionPrefix} ${descriptionSuffix}`,
      quantity,
      unit: units[(index + lineIndex) % units.length].toLowerCase(),
      unitPrice,
      totalPrice: money(quantity * unitPrice),
      leadTimeDays: 3 + ((index + lineIndex * 4) % 33),
    }
  })
  return {
    filename: `preceding-description-corpus-${String(index + 1).padStart(3, '0')}.pdf`,
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
    page.drawText(`Supplier : ${quote.vendorName} Expected Delivery Date : 10 / ${String(7 + pageNumber).padStart(2, '0')} / 2026`, { x: 34, y, size: 8, font })
    y -= 20
    page.drawText('Description / Line', { x: 34, y, size: 7, font: bold })
    page.drawText('SKU', { x: 96, y, size: 7, font: bold })
    page.drawText('Qty', { x: 486, y, size: 7, font: bold })
    page.drawText('Unit', { x: 546, y, size: 7, font: bold })
    page.drawText('Unit Price', { x: 592, y, size: 7, font: bold })
    page.drawText('Total', { x: 676, y, size: 7, font: bold })
    page.drawText('Lead', { x: 760, y, size: 7, font: bold })
    y -= 16
  }

  header(1)
  for (const [lineIndex, line] of quote.lines.entries()) {
    if (lineIndex > 0 && lineIndex % 7 === 0) {
      page = pdf.addPage([842, 595])
      y = 548
      header(Math.floor(lineIndex / 7) + 1)
    }
    page.drawText(line.descriptionPrefix, { x: 34, y, size: 7, font })
    y -= 11
    page.drawText(line.itemNumber, { x: 34, y, size: 7, font })
    page.drawText(line.sku, { x: 96, y, size: 7, font })
    page.drawText(line.descriptionSuffix, { x: 184, y, size: 7, font })
    page.drawText(displayNumber(line.quantity), { x: 486, y, size: 7, font })
    page.drawText(line.unit.toUpperCase(), { x: 546, y, size: 7, font })
    page.drawText(displayMoney(line.unitPrice), { x: 592, y, size: 7, font })
    page.drawText(displayMoney(line.totalPrice), { x: 676, y, size: 7, font })
    page.drawText(`${line.leadTimeDays} days`, { x: 760, y, size: 7, font })
    y -= 18
  }

  const buffer = Buffer.from(await pdf.save())
  const filePath = path.join(dir, quote.filename)
  fs.writeFileSync(filePath, buffer)
  return { buffer, filePath }
}

describe('preceding description PDF import verification', () => {
  it('imports 100 fresh PDFs with preceding wrapped descriptions exactly', async () => {
    const quotes = Array.from({ length: 100 }, (_, index) => expectedQuote(index))
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rialto-preceding-description-pdf-'))
    const mismatches: string[] = []
    let importedLineItems = 0
    let importedResponses = 0
    let failedImports = 0

    for (const expected of quotes) {
      const { buffer, filePath } = await writePdf(expected, dir)
      let built: Awaited<ReturnType<typeof buildImportedQuoteComparison>>
      try {
        built = await buildImportedQuoteComparison({
          projectId: 'project-preceding-description',
          projectName: 'Preceding Description Verification',
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
        const prefix = `${expected.filename} ${expectedLine.sku}`
        if (!actualLine) {
          mismatches.push(`${prefix}: missing line item`)
          continue
        }
        if (!actualResponse) {
          mismatches.push(`${prefix}: missing response`)
          continue
        }
        if (actualLine.description !== expectedLine.description) mismatches.push(`${prefix}: description ${actualLine.description} != ${expectedLine.description}`)
        if (actualLine.quantity !== expectedLine.quantity) mismatches.push(`${prefix}: quantity ${actualLine.quantity} != ${expectedLine.quantity}`)
        if (actualLine.unit !== expectedLine.unit) mismatches.push(`${prefix}: unit ${actualLine.unit} != ${expectedLine.unit}`)
        if (actualResponse.unit_price !== expectedLine.unitPrice) mismatches.push(`${prefix}: unit price ${actualResponse.unit_price} != ${expectedLine.unitPrice}`)
        if (actualResponse.total_price !== expectedLine.totalPrice) mismatches.push(`${prefix}: total ${actualResponse.total_price} != ${expectedLine.totalPrice}`)
        if (actualResponse.lead_time_days !== expectedLine.leadTimeDays) mismatches.push(`${prefix}: lead ${actualResponse.lead_time_days} != ${expectedLine.leadTimeDays}`)
        if (actualResponse.availability !== 'can_source') mismatches.push(`${prefix}: availability ${actualResponse.availability}`)
        if (actualResponse.is_alternate !== false) mismatches.push(`${prefix}: alternate ${actualResponse.is_alternate}`)
      }

      const expectedTotal = money(expected.lines.reduce((sum, line) => sum + line.totalPrice, 0))
      if (imported.bid.total_price !== expectedTotal) mismatches.push(`${expected.filename}: bid total ${imported.bid.total_price} != ${expectedTotal}`)
    }

    if (mismatches.length > 0) {
      throw new Error(`Found ${mismatches.length} mismatches across ${quotes.length} fresh PDFs in ${dir}. Expected ${quotes.length * 20} rows; imported ${importedLineItems} line items and ${importedResponses} responses; failed imports: ${failedImports}.\n${mismatches.slice(0, 80).join('\n')}`)
    }
  }, 180_000)
})
