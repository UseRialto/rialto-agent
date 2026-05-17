import { describe, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { buildImportedQuoteComparison } from '../modules/quote-comparison/imported-quote-comparison'
import { mergeExternalQuoteImportIntoRFQ } from './external-quote-import'
import type { ContractorBid, ContractorRFQLineItem } from '../types/contractor'

type ExpectedLine = {
  sku: string
  description: string
  quantity: number
  unit: string
}

type ExpectedQuoteLine = ExpectedLine & {
  unitPrice: number
  totalPrice: number
  leadTimeDays: number
}

type VendorPdf = {
  filename: string
  vendorName: string
  lines: ExpectedQuoteLine[]
}

const units = ['EA', 'LF', 'SF', 'SY', 'Tube', 'Box'] as const
const descriptions = [
  'Type X gypsum board 5/8 in 4x12',
  'Metal stud 362S125-30 10 ft',
  'Track 250T125-30 12 ft',
  'Acoustic sealant 29 oz tube',
  'Corner bead vinyl 10 ft',
  'Fire caulk red cartridge',
  'Access panel 24 x 36 primed',
  'Drywall screws coarse thread box',
  'Mineral wool safing 4 in',
  'Expansion joint cover aluminum',
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

function displayMoney(value: number) {
  const amount = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (value < 0) return `($${amount})`
  return `$${amount}`
}

function canonicalLines(seed: number, count: number, prefix: string): ExpectedLine[] {
  return Array.from({ length: count }, (_, index) => ({
    sku: `${prefix}-${String(index + 1).padStart(2, '0')}`,
    description: `${descriptions[(seed + index) % descriptions.length]} package ${prefix}-${index + 1}`,
    quantity: index % 5 === 0 ? money(1000 + seed * 5 + index * 2.5) : 17 + ((seed * 31 + index * 13) % 540),
    unit: units[(seed + index) % units.length].toLowerCase(),
  }))
}

function vendorPdf(seed: number, vendorIndex: number, lines: ExpectedLine[], filenamePrefix: string): VendorPdf {
  const vendorName = `${filenamePrefix} Vendor ${String(seed).padStart(3, '0')}-${vendorIndex + 1}`
  return {
    filename: `${filenamePrefix.toLowerCase()}-${String(seed).padStart(3, '0')}-vendor-${vendorIndex + 1}.pdf`,
    vendorName,
    lines: lines.map((line, lineIndex) => {
      const unitPriceMagnitude = money(1.25 + ((seed * 17 + vendorIndex * 29 + lineIndex * 7) % 1900) / 100)
      const unitPrice = lineIndex === 3 && vendorIndex === 1 ? -unitPriceMagnitude : unitPriceMagnitude
      return {
        ...line,
        unitPrice,
        totalPrice: money(line.quantity * unitPrice),
        leadTimeDays: 2 + ((seed + vendorIndex * 3 + lineIndex) % 28),
      }
    }),
  }
}

async function writeVendorPdf(pdfInput: VendorPdf, dir: string) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const page = pdf.addPage([842, 595])
  let y = 548
  page.drawText(`Supplier : ${pdfInput.vendorName} Expected Delivery Date : 11 / 12 / 2026`, { x: 34, y, size: 8, font })
  y -= 20
  page.drawText('Line SKU Description Qty Unit Unit Price Total Lead', { x: 34, y, size: 7, font: bold })
  y -= 15
  for (const [index, line] of pdfInput.lines.entries()) {
    page.drawText([
      `F${String(index + 1).padStart(4, '0')}`,
      line.sku,
      line.description,
      displayNumber(line.quantity),
      line.unit.toUpperCase(),
      displayMoney(line.unitPrice),
      displayMoney(line.totalPrice),
      `${line.leadTimeDays} days`,
    ].join(' '), { x: 34, y, size: 7, font })
    y -= 15
  }
  const buffer = Buffer.from(await pdf.save())
  const filePath = path.join(dir, pdfInput.filename)
  fs.writeFileSync(filePath, buffer)
  return { name: pdfInput.filename, type: 'application/pdf', buffer, filePath }
}

function assertImportedBid(
  mismatches: string[],
  context: string,
  bid: ContractorBid | undefined,
  expected: VendorPdf,
) {
  if (!bid) {
    mismatches.push(`${context}: missing bid ${expected.vendorName}`)
    return
  }
  if (bid.line_item_responses.length !== expected.lines.length) {
    mismatches.push(`${context} ${expected.vendorName}: response count ${bid.line_item_responses.length} != ${expected.lines.length}`)
  }
  for (const expectedLine of expected.lines) {
    const actual = bid.line_item_responses.find((response) => response.sku === expectedLine.sku)
    const prefix = `${context} ${expected.vendorName} ${expectedLine.sku}`
    if (!actual) {
      mismatches.push(`${prefix}: missing response`)
      continue
    }
    if (actual.description !== expectedLine.description) mismatches.push(`${prefix}: description ${actual.description} != ${expectedLine.description}`)
    if (actual.quantity !== expectedLine.quantity) mismatches.push(`${prefix}: quantity ${actual.quantity} != ${expectedLine.quantity}`)
    if (actual.quoted_quantity !== expectedLine.quantity) mismatches.push(`${prefix}: quoted quantity ${actual.quoted_quantity} != ${expectedLine.quantity}`)
    if (actual.unit !== expectedLine.unit) mismatches.push(`${prefix}: unit ${actual.unit} != ${expectedLine.unit}`)
    const expectedUnitPrice = Math.abs(expectedLine.unitPrice)
    const expectedTotalPrice = Math.abs(expectedLine.totalPrice)
    if (actual.unit_price !== expectedUnitPrice) mismatches.push(`${prefix}: unit price ${actual.unit_price} != ${expectedUnitPrice}`)
    if (actual.total_price !== expectedTotalPrice) mismatches.push(`${prefix}: total ${actual.total_price} != ${expectedTotalPrice}`)
    if (expectedLine.unitPrice < 0 && !actual.response_attributes?.some((attribute) => attribute.key === 'import_review:unit_price:negative_price')) {
      mismatches.push(`${prefix}: missing negative unit price import review attribute`)
    }
    if (expectedLine.totalPrice < 0 && !actual.response_attributes?.some((attribute) => attribute.key === 'import_review:total:negative_price')) {
      mismatches.push(`${prefix}: missing negative total import review attribute`)
    }
    if (actual.lead_time_days !== expectedLine.leadTimeDays) mismatches.push(`${prefix}: lead ${actual.lead_time_days} != ${expectedLine.leadTimeDays}`)
    if (actual.is_alternate !== false) mismatches.push(`${prefix}: alternate ${actual.is_alternate}`)
  }
  const expectedTotal = money(expected.lines.reduce((sum, line) => sum + Math.abs(line.totalPrice), 0))
  if (bid.total_price !== expectedTotal) mismatches.push(`${context} ${expected.vendorName}: bid total ${bid.total_price} != ${expectedTotal}`)
}

function assertLineItems(mismatches: string[], context: string, actualLines: ContractorRFQLineItem[], expectedLines: ExpectedLine[]) {
  if (actualLines.length !== expectedLines.length) mismatches.push(`${context}: line item count ${actualLines.length} != ${expectedLines.length}`)
  for (const expectedLine of expectedLines) {
    const actual = actualLines.find((line) => line.sku === expectedLine.sku)
    const prefix = `${context} ${expectedLine.sku}`
    if (!actual) {
      mismatches.push(`${prefix}: missing line item`)
      continue
    }
    if (actual.description !== expectedLine.description) mismatches.push(`${prefix}: description ${actual.description} != ${expectedLine.description}`)
    if (actual.quantity !== expectedLine.quantity) mismatches.push(`${prefix}: quantity ${actual.quantity} != ${expectedLine.quantity}`)
    if (actual.unit !== expectedLine.unit) mismatches.push(`${prefix}: unit ${actual.unit} != ${expectedLine.unit}`)
  }
}

describe('multi-file PDF import and append verification', () => {
  it('imports multiple vendor PDFs into new comparisons and appends batches into existing comparisons exactly', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rialto-multi-file-pdf-'))
    const mismatches: string[] = []

    for (let seed = 1; seed <= 35; seed += 1) {
      const baseLines = canonicalLines(seed, 8, `MF-${String(seed).padStart(3, '0')}`)
      const initialVendorPdfs = [0, 1, 2].map((vendorIndex) => vendorPdf(seed, vendorIndex, baseLines, 'Initial'))
      const initialFiles = await Promise.all(initialVendorPdfs.map((pdfInput) => writeVendorPdf(pdfInput, dir)))
      const initialBuilt = await buildImportedQuoteComparison({
        projectId: 'project-multi-file',
        projectName: 'Multi File Verification',
        title: `Initial comparison ${seed}`,
        files: initialFiles.map(({ name, type, buffer }) => ({ name, type, buffer })),
      })

      assertLineItems(mismatches, `initial ${seed}`, initialBuilt.imported.rfq.line_items, baseLines)
      if (initialBuilt.imported.bids.length !== initialVendorPdfs.length) mismatches.push(`initial ${seed}: bid count ${initialBuilt.imported.bids.length} != ${initialVendorPdfs.length}`)
      for (const expectedVendor of initialVendorPdfs) {
        assertImportedBid(
          mismatches,
          `initial ${seed}`,
          initialBuilt.imported.bids.find((bid) => bid.vendor_name === expectedVendor.vendorName),
          expectedVendor,
        )
      }

      const addedLines = canonicalLines(seed + 100, 2, `MF-${String(seed).padStart(3, '0')}-ADD`)
      const appendedComparisonLines = [...baseLines, ...addedLines]
      const appendedVendorPdfs = [0, 1].map((vendorIndex) => vendorPdf(seed + 50, vendorIndex, appendedComparisonLines, 'Append'))
      const appendFiles = await Promise.all(appendedVendorPdfs.map((pdfInput) => writeVendorPdf(pdfInput, dir)))
      const appendBuilt = await buildImportedQuoteComparison({
        projectId: 'project-multi-file',
        projectName: 'Multi File Verification',
        title: `Append comparison ${seed}`,
        files: appendFiles.map(({ name, type, buffer }) => ({ name, type, buffer })),
      })
      const merged = mergeExternalQuoteImportIntoRFQ({
        targetRfq: initialBuilt.imported.rfq,
        existingBids: initialBuilt.imported.bids,
        imported: appendBuilt.imported,
        now: `2026-05-16T18:00:${String(seed).padStart(2, '0')}.000Z`,
      })

      assertLineItems(mismatches, `merged ${seed}`, merged.rfq.line_items, appendedComparisonLines)
      if (merged.addedLineItems.length !== addedLines.length) mismatches.push(`merged ${seed}: added line count ${merged.addedLineItems.length} != ${addedLines.length}`)
      if (merged.bids.length !== appendedVendorPdfs.length) mismatches.push(`merged ${seed}: appended bid count ${merged.bids.length} != ${appendedVendorPdfs.length}`)
      for (const expectedVendor of appendedVendorPdfs) {
        assertImportedBid(
          mismatches,
          `merged ${seed}`,
          merged.bids.find((bid) => bid.vendor_name === expectedVendor.vendorName),
          expectedVendor,
        )
      }
    }

    if (mismatches.length > 0) {
      throw new Error(`Found ${mismatches.length} mismatches across multi-file import/append PDFs in ${dir}.\n${mismatches.slice(0, 100).join('\n')}`)
    }
  }, 180_000)
})
