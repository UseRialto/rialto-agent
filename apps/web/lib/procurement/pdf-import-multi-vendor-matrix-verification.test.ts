import { describe, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { buildImportedQuoteComparison } from '../modules/quote-comparison/imported-quote-comparison'

type ExpectedLine = {
  itemNumber: string
  sku: string
  description: string
  quantity: number
  unit: string
}

type VendorQuoteLine = {
  sku: string
  unitPrice: number
  totalPrice: number
  leadTimeDays: number
}

type ExpectedMatrix = {
  filename: string
  vendorNames: string[]
  lines: ExpectedLine[]
  quotesByVendor: Map<string, VendorQuoteLine[]>
}

const units = ['EA', 'LF', 'SF', 'Sheet', 'Tube', 'Box'] as const
const descriptions = [
  'Rated drywall board 5/8 in 4x12',
  'Metal stud 362S125-30 10 ft',
  'Acoustic sealant 29 oz cartridge',
  'Corner bead vinyl 10 ft stick',
  'Access panel 24 x 36 prime coat',
  'Fire caulk red tube 10 oz',
  'Track 250T125-30 12 ft length',
  'Shaftliner panel 1 in x 24 in',
  'Drywall screw 1-1/4 in box',
]

function money(value: number) {
  return Number(value.toFixed(2))
}

function displayNumber(value: number) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

function expectedMatrix(index: number): ExpectedMatrix {
  const vendorNames = [
    `Northstar Supply ${String(index + 1).padStart(3, '0')}`,
    `Pinnacle Materials ${String(index + 1).padStart(3, '0')}`,
    `Harbor Drywall ${String(index + 1).padStart(3, '0')}`,
  ]
  const lines = Array.from({ length: 9 }, (_, lineIndex): ExpectedLine => {
    const quantity = 24 + ((index * 13 + lineIndex * 17) % 420)
    return {
      itemNumber: `M${String(index + 1).padStart(3, '0')}${String(lineIndex + 1).padStart(2, '0')}`,
      sku: `MATRIX-${String(index + 1).padStart(3, '0')}-${String(lineIndex + 1).padStart(2, '0')}`,
      description: `${descriptions[(index + lineIndex) % descriptions.length]} matrix ${index + 1}-${lineIndex + 1}`,
      quantity,
      unit: units[(index + lineIndex) % units.length].toLowerCase(),
    }
  })
  const quotesByVendor = new Map<string, VendorQuoteLine[]>()
  vendorNames.forEach((vendorName, vendorIndex) => {
    quotesByVendor.set(vendorName, lines.map((line, lineIndex) => {
      const unitPrice = money(1.05 + ((index * 19 + vendorIndex * 23 + lineIndex * 11) % 1500) / 100)
      return {
        sku: line.sku,
        unitPrice,
        totalPrice: money(line.quantity * unitPrice),
        leadTimeDays: 4 + ((index + vendorIndex * 3 + lineIndex) % 21),
      }
    }))
  })
  return {
    filename: `multi-vendor-matrix-corpus-${String(index + 1).padStart(3, '0')}.pdf`,
    vendorNames,
    lines,
    quotesByVendor,
  }
}

async function writePdf(matrix: ExpectedMatrix, dir: string) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const page = pdf.addPage([842, 595])
  let y = 548
  page.drawText('Multi-supplier quote matrix', { x: 32, y, size: 10, font: bold })
  y -= 18
  page.drawText(`Vendors: ${matrix.vendorNames.join(' | ')}`, { x: 32, y, size: 8, font })
  y -= 18
  page.drawText('Item SKU Description Qty Unit Vendor1 Unit Total Lead Vendor2 Unit Total Lead Vendor3 Unit Total Lead', { x: 32, y, size: 6.5, font: bold })
  y -= 14

  for (const line of matrix.lines) {
    const quoteTexts = matrix.vendorNames.flatMap((vendorName) => {
      const quote = matrix.quotesByVendor.get(vendorName)?.find((candidate) => candidate.sku === line.sku)
      if (!quote) return []
      return [quote.unitPrice.toFixed(2), quote.totalPrice.toFixed(2), `${quote.leadTimeDays} days`]
    })
    page.drawText([
      line.itemNumber,
      line.sku,
      line.description,
      displayNumber(line.quantity),
      line.unit.toUpperCase(),
      ...quoteTexts,
    ].join(' '), { x: 32, y, size: 6.5, font })
    y -= 13
  }

  const buffer = Buffer.from(await pdf.save())
  const filePath = path.join(dir, matrix.filename)
  fs.writeFileSync(filePath, buffer)
  return { buffer, filePath }
}

describe('multi-vendor matrix PDF import verification', () => {
  it('imports 60 fresh custom-vendor matrix PDFs exactly', async () => {
    const matrices = Array.from({ length: 60 }, (_, index) => expectedMatrix(index))
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rialto-multi-vendor-matrix-pdf-'))
    const mismatches: string[] = []
    let failedImports = 0

    for (const expected of matrices) {
      const { buffer, filePath } = await writePdf(expected, dir)
      let built: Awaited<ReturnType<typeof buildImportedQuoteComparison>>
      try {
        built = await buildImportedQuoteComparison({
          projectId: 'project-multi-vendor-matrix',
          projectName: 'Multi Vendor Matrix Verification',
          title: 'Multi Vendor Matrix Verification',
          files: [{ name: expected.filename, type: 'application/pdf', buffer }],
        })
      } catch (error) {
        failedImports += 1
        mismatches.push(`${expected.filename}: import failed for ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
        continue
      }

      const imported = built.imported
      const actualVendorNames = imported.bids.map((bid) => bid.vendor_name)
      for (const vendorName of expected.vendorNames) {
        if (!actualVendorNames.includes(vendorName)) mismatches.push(`${expected.filename}: missing vendor ${vendorName}; imported ${actualVendorNames.join(', ')}`)
      }
      for (const vendorName of actualVendorNames) {
        if (!expected.vendorNames.includes(vendorName)) mismatches.push(`${expected.filename}: unexpected vendor ${vendorName}`)
      }
      if (imported.rfq.line_items.length !== expected.lines.length) mismatches.push(`${expected.filename}: line item count ${imported.rfq.line_items.length} != ${expected.lines.length}`)

      for (const expectedLine of expected.lines) {
        const actualLine = imported.rfq.line_items.find((line) => line.sku === expectedLine.sku)
        if (!actualLine) {
          mismatches.push(`${expected.filename} ${expectedLine.sku}: missing line item`)
          continue
        }
        if (actualLine.description !== expectedLine.description) mismatches.push(`${expected.filename} ${expectedLine.sku}: description ${actualLine.description} != ${expectedLine.description}`)
        if (actualLine.quantity !== expectedLine.quantity) mismatches.push(`${expected.filename} ${expectedLine.sku}: quantity ${actualLine.quantity} != ${expectedLine.quantity}`)
        if (actualLine.unit !== expectedLine.unit) mismatches.push(`${expected.filename} ${expectedLine.sku}: unit ${actualLine.unit} != ${expectedLine.unit}`)
      }

      for (const vendorName of expected.vendorNames) {
        const actualBid = imported.bids.find((bid) => bid.vendor_name === vendorName)
        if (!actualBid) continue
        const expectedQuotes = expected.quotesByVendor.get(vendorName) ?? []
        if (actualBid.line_item_responses.length !== expectedQuotes.length) mismatches.push(`${expected.filename} ${vendorName}: response count ${actualBid.line_item_responses.length} != ${expectedQuotes.length}`)
        for (const expectedQuote of expectedQuotes) {
          const actualResponse = actualBid.line_item_responses.find((response) => response.sku === expectedQuote.sku)
          if (!actualResponse) {
            mismatches.push(`${expected.filename} ${vendorName} ${expectedQuote.sku}: missing response`)
            continue
          }
          if (actualResponse.unit_price !== expectedQuote.unitPrice) mismatches.push(`${expected.filename} ${vendorName} ${expectedQuote.sku}: unit price ${actualResponse.unit_price} != ${expectedQuote.unitPrice}`)
          if (actualResponse.total_price !== expectedQuote.totalPrice) mismatches.push(`${expected.filename} ${vendorName} ${expectedQuote.sku}: total ${actualResponse.total_price} != ${expectedQuote.totalPrice}`)
          if (actualResponse.lead_time_days !== expectedQuote.leadTimeDays) mismatches.push(`${expected.filename} ${vendorName} ${expectedQuote.sku}: lead ${actualResponse.lead_time_days} != ${expectedQuote.leadTimeDays}`)
          if (actualResponse.is_alternate !== false) mismatches.push(`${expected.filename} ${vendorName} ${expectedQuote.sku}: alternate ${actualResponse.is_alternate}`)
        }
      }
    }

    if (mismatches.length > 0) {
      throw new Error(`Found ${mismatches.length} mismatches across ${matrices.length} fresh matrix PDFs in ${dir}; failed imports: ${failedImports}.\n${mismatches.slice(0, 80).join('\n')}`)
    }
  }, 180_000)
})
