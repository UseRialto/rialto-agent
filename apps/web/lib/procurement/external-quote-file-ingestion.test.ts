import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { createExternalQuoteImport } from './external-quote-import'
import { ingestExternalQuoteFile } from './external-quote-file-ingestion'
import { extractPdfImportTextWithFallback } from './external-quote-file-text'

const modelNormalizedTable = [
  'Item\tSKU\tDescription\tQty\tUnit\tFallback Supply Unit Price\tFallback Supply Total\tFallback Supply Lead Time\tFallback Supply Notes',
  'A001\t250CH-33\t2 1/2 in 22ga CH Stud 10 ft\t2420\tLF\t1.10\t2662\t14 days\tRecovered by agent',
].join('\n')

const compactPdfExtractedText = `
9 - MCRD P-314 - 1.0 - Base Bid
Item Description Qty L n W Supply - San Diego Unit Pr L n W Supply - San Diego Total P L n W Supply - San Diego Lead Ti L n W Supply - San Diego Alt
250CH-33 250CH-33 2 1/2" X 22ga. C-H Stud2,420 lf $1,100 $2,662 0d
250JR-33 250JR-33 2 1/2" X 20ga. J Track 458 lf $1,000 $458 0d
400S162-54 4" X 16ga. 1 5/8" 16,827 multi $1,190 $20,024 0d
`

async function pdfBufferFromLines(lines: string[]) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  let page = pdf.addPage([842, 595])
  let y = 552
  for (const line of lines) {
    if (y < 34) {
      page = pdf.addPage([842, 595])
      y = 552
    }
    page.drawText(line, { x: 34, y, size: 7, font })
    y -= 14
  }
  return Buffer.from(await pdf.save())
}

async function portableSingleVendorPdf() {
  const rows = Array.from({ length: 105 }, (_, index) => {
    const item = index + 1
    const quantity = 20 + item
    const unitPrice = Number((1.05 + item / 100).toFixed(2))
    const total = Number((quantity * unitPrice).toFixed(2))
    return [
      `P${String(item).padStart(3, '0')}`,
      `PDF-${String(item).padStart(3, '0')}`,
      `Portable PDF line item ${item}`,
      quantity,
      'EA',
      `$${unitPrice.toFixed(2)}`,
      `$${total.toFixed(2)}`,
      `${3 + (item % 14)} days`,
    ].join(' ')
  })
  return pdfBufferFromLines([
    'Supplier : Portable PDF Supply Expected Delivery Date : 11 / 12 / 2026',
    'Line SKU Description Qty Unit Unit Price Total Lead',
    ...rows,
  ])
}

async function portableMultiSupplierMatrixPdf() {
  return pdfBufferFromLines([
    'Multi-supplier quote matrix',
    'Vendors: Northstar Supply 001 | Pinnacle Materials 001 | Harbor Drywall 001',
    'Item SKU Description Qty Unit Vendor1 Unit Total Lead Vendor2 Unit Total Lead Vendor3 Unit Total Lead',
    'M00101 MATRIX-001-01 Rated drywall board 5/8 in 4x12 matrix 1-1 24 EA 1.05 25.20 4 days 1.28 30.72 7 days 1.51 36.24 10 days',
    'M00102 MATRIX-001-02 Metal stud 362S125-30 10 ft matrix 1-2 41 LF 1.16 47.56 5 days 1.39 56.99 8 days 1.62 66.42 11 days',
    'M00103 MATRIX-001-03 Acoustic sealant 29 oz cartridge matrix 1-3 58 SF 1.27 73.66 6 days 1.50 87.00 9 days 1.73 100.34 12 days',
  ])
}

describe('External quote file ingestion', () => {
  it('keeps CSV and Excel files on the direct deterministic spreadsheet path', async () => {
    for (const file of [
      {
        name: 'easy.csv',
        type: 'text/csv',
        buffer: Buffer.from('Item,SKU,Description,Qty,Unit,Vendor,Unit Price,Total\nA001,TRACK-20,20ga track,125,LF,Direct Supply,2.40,300', 'utf8'),
      },
      {
        name: 'easy.xlsx',
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: Buffer.from('not a real workbook for this unit seam'),
      },
    ]) {
      const ingested = await ingestExternalQuoteFile({
        file,
        extractText: async () => 'Item,SKU,Description,Qty,Unit,Vendor,Unit Price,Total\nA001,TRACK-20,20ga track,125,LF,Direct Supply,2.40,300',
        normalizeUnsupported: async () => {
          throw new Error('CSV and Excel should not use the smart import agent')
        },
      })

      expect(ingested.sourceKind).toBe('spreadsheet')
      expect(ingested.diagnostics).toEqual({ mode: 'normal' })
      expect(ingested.text).toContain('Direct Supply')
    }
  })

  it('ingests a multi-page PDF into importer-ready text', async () => {
    const ingested = await ingestExternalQuoteFile({
      file: {
        name: 'portable-single-vendor.pdf',
        type: 'application/pdf',
        buffer: await portableSingleVendorPdf(),
      },
    })
    const imported = createExternalQuoteImport({
      projectId: 'project-1',
      projectName: 'Portable PDF Fixture',
      filename: ingested.filename,
      sourceKind: ingested.sourceKind,
      text: ingested.text,
      now: '2026-05-15T12:00:00.000Z',
    })

    expect(ingested.text).toContain('Portable PDF Supply')
    expect(imported.bid.vendor_name).toBe('Portable PDF Supply')
    expect(imported.rfq.line_items.length).toBeGreaterThan(100)
    expect(imported.bid.line_item_responses).toHaveLength(imported.rfq.line_items.length)
    expect(imported.rfq.line_items).toContainEqual(expect.objectContaining({
      sku: 'PDF-001',
      description: 'Portable PDF line item 1',
      quantity: 21,
      unit: 'ea',
    }))
    expect(imported.bid.total_price).toBeGreaterThan(8000)
  })

  it('uses independent backup PDF extraction directly when the deterministic importer can build quote rows', async () => {
    const ingested = await ingestExternalQuoteFile({
      file: {
        name: '9 - MCRD P-314 - 1.0 - Base Bid.pdf',
        type: 'application/pdf',
        buffer: Buffer.from('%PDF compact fixture bytes', 'utf8'),
      },
      extractText: (_file, buffer) => extractPdfImportTextWithFallback(
        buffer,
        async () => {
          throw new TypeError('Object.defineProperty called on non-object')
        },
        async () => compactPdfExtractedText,
      ),
      normalizeUnsupported: async () => {
        throw new Error('parseable PDFs should not wait on the smart import agent')
      },
    })
    const imported = createExternalQuoteImport({
      projectId: 'project-1',
      projectName: 'MCRD P-314',
      filename: ingested.filename,
      sourceKind: ingested.sourceKind,
      text: ingested.text,
      now: '2026-05-16T16:41:14.856Z',
    })

    expect(ingested.diagnostics).toEqual({ mode: 'normal' })
    expect(imported.bid.vendor_name).toBe('L n W Supply - San Diego')
    expect(imported.rfq.line_items.map((line) => line.description)).toEqual([
      '2 1/2" X 22ga. C-H Stud',
      '2 1/2" X 20ga. J Track',
      '4" X 16ga. 1 5/8"',
    ])
    expect(imported.bid.line_item_responses.find((line) => line.sku === '400S162-54')).toMatchObject({
      unit_price: 1.19,
      total_price: 20024,
    })
  })

  it('ingests compact multi-supplier PDF matrix text into separate vendor bids', async () => {
    const ingested = await ingestExternalQuoteFile({
      file: {
        name: 'portable-multi-supplier-pdf-matrix.pdf',
        type: 'application/pdf',
        buffer: await portableMultiSupplierMatrixPdf(),
      },
    })
    const imported = createExternalQuoteImport({
      projectId: 'project-1',
      projectName: 'MCRD P-314',
      filename: ingested.filename,
      sourceKind: ingested.sourceKind,
      text: ingested.text,
      now: '2026-05-15T12:00:00.000Z',
    })

    expect(imported.rfq.line_items).toHaveLength(3)
    expect(imported.bids.map((bid) => bid.vendor_name)).toEqual([
      'Northstar Supply 001',
      'Pinnacle Materials 001',
      'Harbor Drywall 001',
    ])
    expect(imported.bids.find((bid) => bid.vendor_name === 'Northstar Supply 001')?.line_item_responses).toHaveLength(3)
    expect(imported.bids.find((bid) => bid.vendor_name === 'Pinnacle Materials 001')?.line_item_responses).toHaveLength(3)
    expect(imported.bids.find((bid) => bid.vendor_name === 'Harbor Drywall 001')?.line_item_responses.find((line) => line.sku === 'MATRIX-001-02'))
      .toMatchObject({ unit_price: 1.62, total_price: 66.42 })
  })

  it('automatically runs the smart import agent when PDF text is available but deterministic extraction throws', async () => {
    const ingested = await ingestExternalQuoteFile({
      file: {
        name: 'broken-runtime.pdf',
        type: 'application/pdf',
        buffer: Buffer.from(modelNormalizedTable, 'utf8'),
      },
      extractText: async () => {
        throw new TypeError('Object.defineProperty called on non-object')
      },
      normalizeUnsupported: async (input) => ({
        text: modelNormalizedTable,
        model: input.model ?? 'gpt-5.5',
        warnings: ['Recovered PDF through smart import agent.'],
      }),
    })

    expect(ingested.diagnostics).toMatchObject({
      mode: 'agent-forced',
      model: 'gpt-5.5',
      fallbackReason: 'Non-CSV/Excel quote file normalized through GPT-5.5 before deterministic import.',
    })
    expect(ingested.warnings.map((warning) => warning.message)).toContain('Recovered PDF through smart import agent.')
  })

  it('can force a previously extracted supported PDF through the smart import agent when deterministic parsing needs repair', async () => {
    const ingested = await ingestExternalQuoteFile({
      file: {
        name: 'hard-to-shape.pdf',
        type: 'application/pdf',
        buffer: Buffer.from('%PDF-1.6 fake bytes', 'utf8'),
      },
      forceAgent: true,
      normalizeUnsupported: async () => ({
        text: modelNormalizedTable,
        model: 'gpt-5.5',
        warnings: ['Re-shaped hard-to-parse PDF through smart import agent.'],
      }),
    })

    const imported = createExternalQuoteImport({
      projectId: 'project-1',
      projectName: 'MCRD P-314',
      filename: ingested.filename,
      sourceKind: ingested.sourceKind,
      text: ingested.text,
      now: '2026-05-15T12:00:00.000Z',
    })

    expect(ingested.sourceKind).toBe('spreadsheet')
    expect(ingested.diagnostics).toMatchObject({ mode: 'agent-forced', model: 'gpt-5.5' })
    expect(ingested.warnings.map((warning) => warning.message)).toContain('Re-shaped hard-to-parse PDF through smart import agent.')
    expect(imported.bids[0].vendor_name).toBe('Fallback Supply')
  })

  it('sends XML quote files through GPT-5.5 normalization before deterministic import', async () => {
    const ingested = await ingestExternalQuoteFile({
      file: {
        name: 'vendor-comparison.xml',
        type: 'application/xml',
        buffer: Buffer.from('<vendorComparison><item line="A001" sku="TRACK-20" description="20ga track" quantity="125" unit="LF" /></vendorComparison>', 'utf8'),
      },
      normalizeUnsupported: async (input) => {
        expect(input.sourceText).toContain('<vendorComparison>')
        return {
          text: modelNormalizedTable,
          model: input.model ?? 'gpt-5.5',
          warnings: ['XML checked line by line and converted to CSV.'],
        }
      },
    })

    const imported = createExternalQuoteImport({
      projectId: 'project-1',
      projectName: 'MCRD P-314',
      filename: ingested.filename,
      sourceKind: ingested.sourceKind,
      text: ingested.text,
      now: '2026-05-15T12:00:00.000Z',
    })

    expect(ingested.sourceKind).toBe('spreadsheet')
    expect(ingested.diagnostics).toMatchObject({
      mode: 'agent-forced',
      model: 'gpt-5.5',
      fallbackReason: 'Non-CSV/Excel quote file normalized through GPT-5.5 before deterministic import.',
    })
    expect(ingested.warnings.map((warning) => warning.message)).toContain('XML checked line by line and converted to CSV.')
    expect(imported.bids[0].vendor_name).toBe('Fallback Supply')
  })
})
