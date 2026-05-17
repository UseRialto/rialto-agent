import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { createExternalQuoteImport, createExternalQuoteImportFromFiles, mergeExternalQuoteImportIntoRFQ } from './external-quote-import'
import { extractExternalQuoteImportText, importSourceKindForFile } from './external-quote-file-text'
import { InMemoryUserContextProvider } from '../../../../src/context/user-context-provider.js'
import { RialtoAgentCore } from '../../../../src/agent/core.js'
import { QuoteComparisonArchitectureRuntime } from '../../../../src/agent/quote-comparison-architecture-suite.js'
import type { AuthenticatedUser } from '../../../../src/domain/types.js'
import type { ContractorBid, ContractorRFQ } from '../types/contractor'

const lAndWSampleText = `
Quote ID : 0001 - The Raymond Group
Supplier : L n W Supply - San Diego Expected Delivery Date : 08 / 01 / 2026 - 02 / 28 / 2027
Requester : Project : Supplier Notes : Stocking Notes :
Michael Null 9 - MCRD P - 314 Company :
Michael . Null @ raymondgroup . com Bid : 1.0 - Base Bid Job Site : San Diego , CA
No . Item Description Item Notes Size Quantity Price Per Total
901 - Metal
1 250CH - 33 250CH - 33 2 1 / 2 " X 22ga . C - H Stud 10 ' 0 " 2,420.00 LF 1100.000 1,000.00 LF $ 2,662.00
2 250JR - 33 250JR - 33 2 1 / 2 " X 20ga . J Track 12 ' 0 " 458.00 LF 1000.000 1,000.00 LF $ 458.00
250JS - 33 2 1 / 2 " X 20ga . Jamb
3 250JS - 33 10 ' 0 " 1,094.00 LF 1250.000 1,000.00 LF $ 1,367.50
Strut
362S125 - 30 3 5 / 8 " X 20ga . ( 30 Mil )
10 362S125 - 30 10 ' 0 " - 606.00 LF 545.000 1,000.00 LF - $ 330.27
1 1 / 4 " Flange Stud
902 - Gypsum Board
73 ACSEAL Acoustic Sealant USG 29oz . Acoustical Sealant 1 ' 0 " 889.30 Tube 8.000 Tube / 20.00 LF $ 7,114.40
`

const multiSupplierWideText = `
Project,MCRD P-314
Package,Metal framing and drywall

Item,SKU,Description,Qty,Unit,L n W Supply - San Diego Unit Price,L n W Supply - San Diego Total,L n W Supply - San Diego Lead Time,L n W Supply - San Diego Notes,Acme Drywall Supply Unit Price,Acme Drywall Supply Total,Acme Drywall Supply Lead Time,Acme Drywall Supply Notes,BuildCo Materials Unit Price,BuildCo Materials Total,BuildCo Materials Lead Time,BuildCo Materials Notes,Metro Door Hardware Unit Price,Metro Door Hardware Total,Metro Door Hardware Lead Time,Metro Door Hardware Notes
A001,250CH-33,2 1/2 in 22ga CH Stud 10 ft,2420,LF,1.1,2662,14 days,,1.18,2855.6,2-3 weeks,,1.06,2565.2,4 weeks,,,
A002,250JR-33,2 1/2 in 20ga J Track 12 ft,458,LF,1.17,535.86,14 days,,1.25,572.5,2-3 weeks,,1.13,517.54,4 weeks,alternate manufacturer,,,
A003,250JS-33,2 1/2 in 20ga Jamb Strut 10 ft,1094,LF,1.24,1356.56,14 days,excludes tax,1.32,1444.08,2-3 weeks,,1.2,1312.8,4 weeks,,,
A004,362S125-30,3 5/8 in 20ga Stud 10 ft,606,LF,1.31,793.86,14 days,,1.39,842.34,2-3 weeks,,1.27,769.62,4 weeks,price valid 15 days,,,
A005,ACSEAL,USG 29oz Acoustical Sealant,889,Tube,8.28,7360.92,14 days,20 LF per tube,8.63,7671.07,2-3 weeks,,,,,9.17,8152.13,5 weeks,
A006,GWB-58X,5/8 Type X Gypsum Board 4x12,620,Sheet,18.4,11408,14 days,,19.69,12207.8,2-3 weeks,includes delivery,17.66,10949.2,4 weeks,,,
A007,GWB-12MR,1/2 Moisture Resistant Board 4x10,120,Sheet,,,,no bid,19.76,2371.2,2-3 weeks,,17.73,2127.6,4 weeks,,,
A008,CORNER-BEAD,Vinyl corner bead 10 ft,950,LF,1.31,1244.5,14 days,,1.39,1320.5,2-3 weeks,,1.27,1206.5,4 weeks,,,
A009,FAST-114,1 1/4 drywall screws,38,Box,41.46,1575.48,14 days,,44.35,1685.3,2-3 weeks,,,,,,
A010,HM-FRAME,Hollow metal frame 3070,42,EA,185.28,7781.76,14 days,,,,no bid,177.88,7470.96,4 weeks,,207.48,8714.16,5 weeks,shop drawings required
A011,HM-DOOR,18ga flush hollow metal door,36,EA,185,6660,14 days,,,,no bid,177.6,6393.6,4 weeks,,207.2,7459.2,5 weeks,
A012,LOCK-SET,Classroom lockset,44,EA,185.07,8143.08,14 days,,198.02,8712.88,2-3 weeks,substitution,177.67,7817.48,4 weeks,,207.27,9119.88,5 weeks,best lead time
`

const differentColumnNamesText = `
Line #,Part No,Material Name,Required Qty,UOM,Vendor,Quoted Unit Cost,Extended Cost,ETA,Clarifications
A001,250CH-33,2 1/2 in 22ga CH Stud 10 ft,2420,LF,L n W Supply - San Diego,1.1,2662,14 days,
A001,250CH-33,2 1/2 in 22ga CH Stud 10 ft,2420,LF,Acme Drywall Supply,1.18,2855.6,2-3 weeks,
A001,250CH-33,2 1/2 in 22ga CH Stud 10 ft,2420,LF,BuildCo Materials,1.06,2565.2,4 weeks,
A010,HM-FRAME,Hollow metal frame 3070,42,EA,Metro Door Hardware,207.48,8714.16,5 weeks,shop drawings required
A011,HM-DOOR,18ga flush hollow metal door,36,EA,Metro Door Hardware,207.2,7459.2,5 weeks,
A012,LOCK-SET,Classroom lockset,44,EA,Metro Door Hardware,207.27,9119.88,5 weeks,best lead time
`

const acmeSingleVendorText = `
Line #,Part No,Material Name,Required Qty,UOM,Vendor,Quoted Unit Cost,Extended Cost,ETA,Clarifications
A001,250CH-33,2 1/2 in 22ga CH Stud 10 ft,2420,LF,Acme Drywall Supply,1.18,2855.6,2-3 weeks,
A002,250JR-33,2 1/2 in 20ga J Track 12 ft,458,LF,Acme Drywall Supply,1.25,572.5,2-3 weeks,
`

const buildCoSingleVendorText = `
Line #,Part No,Material Name,Required Qty,UOM,Vendor,Quoted Unit Cost,Extended Cost,ETA,Clarifications
A001,250CH-33,2 1/2 in 22ga CH Stud 10 ft,2420,LF,BuildCo Materials,1.06,2565.2,4 weeks,
A002,250JR-33,2 1/2 in 20ga J Track 12 ft,458,LF,BuildCo Materials,1.13,517.54,4 weeks,alternate manufacturer
`

function generatedSingleVendorQuoteText(vendorName: string, index: number) {
  const priceBump = index / 100
  return [
    'Line #,Part No,Material Name,Required Qty,UOM,Vendor,Quoted Unit Cost,Extended Cost,ETA,Clarifications',
    `A001,250CH-33,2 1/2 in 22ga CH Stud 10 ft,2420,LF,${vendorName},${(1.05 + priceBump).toFixed(2)},${((1.05 + priceBump) * 2420).toFixed(2)},${10 + index} days,`,
    `A002,250JR-33,2 1/2 in 20ga J Track 12 ft,458,LF,${vendorName},${(1.14 + priceBump).toFixed(2)},${((1.14 + priceBump) * 458).toFixed(2)},${10 + index} days,`,
    `A003,ACSEAL,USG 29oz Acoustical Sealant,889,Tube,${vendorName},${(8.25 + index / 10).toFixed(2)},${((8.25 + index / 10) * 889).toFixed(2)},${10 + index} days,`,
  ].join('\n')
}

const repeatedSupplierBlocksText = `
Item,SKU,Description,Qty,Unit,Active,Supplier,Unit Price,Total,Variation,Active,Supplier,Unit Price,Total,Variation,Active,Supplier,Unit Price,Total,Variation,Active,Supplier,Unit Price,Total,Variation
A001,250CH-33,2 1/2 in 22ga CH Stud 10 ft,2420,LF,TRUE,Foundation - San Diego,320.000,774400,+0%,TRUE,L n W Supply - San Diego,350.000,847000,+9%,TRUE,Action Gypsum Supply,310.000,750200,-3%,TRUE,J n B Materials - Perris,315.000,762300,-2%
A002,250JR-33,2 1/2 in 20ga J Track 12 ft,458,LF,TRUE,Foundation - San Diego,92.000,42136,+0%,TRUE,L n W Supply - San Diego,63.750,29198,-31%,TRUE,Action Gypsum Supply,,0,-100%,TRUE,J n B Materials - Perris,75.950,34785,-17%
A003,250JS-33,2 1/2 in 20ga Jamb Strut 10 ft,1094,LF,TRUE,Foundation - San Diego,205.000,224270,+0%,TRUE,L n W Supply - San Diego,230.000,251620,+12%,TRUE,Action Gypsum Supply,195.000,213330,-5%,TRUE,J n B Materials - Perris,193.000,211142,-6%
`

const customVendorMatrixText = `
Multi-supplier quote matrix
Vendors: Northstar Supply 001 | Pinnacle Materials 001 | Harbor Drywall 001
Item SKU Description Qty Unit Vendor1 Unit Total Lead Vendor2 Unit Total Lead Vendor3 Unit Total Lead
M00101 MATRIX-001-01 Rated drywall board 5/8 in 4x12 matrix 1-1 24 EA 1.05 25.20 4 days 1.28 30.72 7 days 1.51 36.24 10 days
M00102 MATRIX-001-02 Metal stud 362S125-30 10 ft matrix 1-2 41 LF 1.16 47.56 5 days 1.39 56.99 8 days 1.62 66.42 11 days
M00103 MATRIX-001-03 Acoustic sealant 29 oz cartridge matrix 1-3 58 SF 1.27 73.66 6 days 1.50 87.00 9 days 1.73 100.34 12 days
`

function customVendorMatrixTextFor(index: number) {
  const vendorSuffix = String(index).padStart(3, '0')
  return `
Multi-supplier quote matrix
Vendors: Northstar Supply ${vendorSuffix} | Pinnacle Materials ${vendorSuffix} | Harbor Drywall ${vendorSuffix}
Item SKU Description Qty Unit Vendor1 Unit Total Lead Vendor2 Unit Total Lead Vendor3 Unit Total Lead
M${vendorSuffix}01 MATRIX-${vendorSuffix}-01 Rated drywall board matrix ${index}-1 24 EA 1.05 25.20 4 days 1.28 30.72 7 days 1.51 36.24 10 days
M${vendorSuffix}02 MATRIX-${vendorSuffix}-02 Metal stud matrix ${index}-2 41 LF 1.16 47.56 5 days 1.39 56.99 8 days 1.62 66.42 11 days
M${vendorSuffix}03 MATRIX-${vendorSuffix}-03 Acoustic sealant matrix ${index}-3 58 SF 1.27 73.66 6 days 1.50 87.00 9 days 1.73 100.34 12 days
`
}

const generatedFixtureDir = [
  path.resolve(process.cwd(), 'data/test_files'),
  path.resolve(process.cwd(), '../data/test_files'),
].find((candidate) => fs.existsSync(candidate)) ?? path.resolve(process.cwd(), 'data/test_files')
const hasGeneratedFixtures = fs.existsSync(generatedFixtureDir)

function extractWorkbookTextLikeImportRoute(filename: string) {
  const workbook = XLSX.readFile(path.join(generatedFixtureDir, filename), { cellDates: false })
  return workbook.SheetNames
    .map((sheetName) => {
      const sheet = workbook.Sheets[sheetName]
      if (!sheet) return ''
      return XLSX.utils.sheet_to_json<string[]>(sheet, {
        header: 1,
        raw: false,
        blankrows: false,
        defval: '',
      })
        .map((row) => row.map((cell) => String(cell ?? '').trim()).join('\t'))
        .filter((row) => row.trim())
        .join('\n')
    })
    .filter(Boolean)
    .join('\n')
}

function workbookBufferFromText(text: string, bookType: XLSX.BookType = 'xlsx') {
  const rows = text
    .trim()
    .split('\n')
    .map((row) => row.split(','))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Comparison')
  return XLSX.write(workbook, { type: 'buffer', bookType }) as Buffer
}

describe('External Quote Import', () => {
  it('recognizes CSV uploads as spreadsheet quote imports', async () => {
    for (const file of [
      { name: '01-multi-supplier-wide-comparison.csv', type: 'text/csv' },
      { name: 'excel-exported-comparison.csv', type: 'application/vnd.ms-excel' },
    ]) {
      const text = await extractExternalQuoteImportText(file, Buffer.from(multiSupplierWideText, 'utf8'))
      const result = createExternalQuoteImport({
        projectId: 'project-1',
        projectName: 'MCRD P-314',
        filename: file.name,
        sourceKind: importSourceKindForFile(file) ?? 'spreadsheet',
        text,
        now: '2026-05-11T12:00:00.000Z',
      })

      expect(importSourceKindForFile(file)).toBe('spreadsheet')
      expect(result.bids.map((bid) => bid.vendor_name)).toContain('BuildCo Materials')
      expect(result.rfq.line_items).toHaveLength(12)
    }
  })

  it('recognizes Excel upload extensions and extracts workbook rows as quote import text', async () => {
    for (const [filename, bookType] of [
      ['vendor-comparison.xlsx', 'xlsx'],
      ['vendor-comparison.xls', 'biff8'],
      ['vendor-comparison.xsl', 'biff8'],
    ] as const) {
      const file = { name: filename, type: '' }
      const text = await extractExternalQuoteImportText(file, workbookBufferFromText(multiSupplierWideText, bookType))
      const result = createExternalQuoteImport({
        projectId: 'project-1',
        projectName: 'MCRD P-314',
        filename,
        sourceKind: importSourceKindForFile(file) ?? 'spreadsheet',
        text,
        now: '2026-05-11T12:00:00.000Z',
      })

      expect(importSourceKindForFile(file)).toBe('spreadsheet')
      expect(result.bids.map((bid) => bid.vendor_name)).toEqual([
        'L n W Supply - San Diego',
        'Acme Drywall Supply',
        'BuildCo Materials',
        'Metro Door Hardware',
      ])
      expect(result.rfq.line_items).toHaveLength(12)
    }
  })

  it('creates a Quote Request and imported vendor response from single-vendor quote text', () => {
    const result = createExternalQuoteImport({
      projectId: 'project-1',
      projectName: 'MCRD P-314',
      filename: '0001 - 9 - MCRD P-314 - 1.0 - Base Bid.pdf',
      sourceKind: 'pdf',
      text: lAndWSampleText,
      now: '2026-05-11T12:00:00.000Z',
    })

    expect(result.rfq.title).toBe('9 - MCRD P - 314 - 1.0 - Base Bid')
    expect(result.rfq.status).toBe('active')
    expect(result.rfq.line_items).toHaveLength(5)
    expect(result.bid.vendor_name).toBe('L n W Supply - San Diego')
    expect(result.bid.source).toBe('external_workbook')
    expect(result.bid.total_price).toBeCloseTo(11932.17)
    expect(result.bid.line_item_responses[0]).toMatchObject({
      sku: '250CH-33',
      description: '2 1 / 2 " X 22ga . C - H Stud 10 \' 0 "',
      quantity: 2420,
      unit: 'lf',
      unit_price: 1.1,
      total_price: 2662,
    })
    expect(result.bid.line_item_responses[0].response_attributes).toContainEqual(expect.objectContaining({
      key: 'price_basis',
      value: '1100 per 1000 lf',
    }))
    expect(result.bid.line_item_responses[3]).toMatchObject({
      sku: '362S125-30',
      quantity: 606,
      total_price: 330.27,
    })
    expect(result.bid.line_item_responses[3].response_attributes).toContainEqual(expect.objectContaining({
      key: 'import_review:total:negative_price',
      value: expect.stringContaining('"originalValue":"-$330.27"'),
    }))
    expect(result.warnings).toContainEqual(expect.objectContaining({
      message: expect.stringContaining('single vendor'),
    }))
  })

  it('keeps repeated PDF item numbers attached to their own quote rows', () => {
    const result = createExternalQuoteImport({
      projectId: 'project-1',
      projectName: 'MCRD P-314',
      filename: 'repeated-item-numbers.pdf',
      sourceKind: 'pdf',
      text: `
Supplier : L n W Supply - San Diego Expected Delivery Date : 08 / 01 / 2026
1 250CH - 33 250CH - 33 2 1 / 2 " X 22ga . C - H Stud 10 ' 0 " 2,420.00 LF 1100.000 1,000.00 LF $ 2,662.00
2 PORTLAND Portland Cement N / A 7.00 Bag 13.800 Bag / 1.00 EA $ 96.60
1 Omega Plaster Fnsh 16 / 20 N / A 673.00 EA 20.000 1.00 EA $ 13,460.00
`,
      now: '2026-05-16T16:35:09.000Z',
    })

    expect(result.rfq.line_items).toHaveLength(3)
    expect(new Set(result.rfq.line_items.map((line) => line.id)).size).toBe(3)
    expect(new Set(result.bid.line_item_responses.map((line) => line.line_item_id)).size).toBe(3)

    const omegaLine = result.rfq.line_items.find((line) => line.sku === 'Omega')
    const omegaResponse = result.bid.line_item_responses.find((line) => line.line_item_id === omegaLine?.id)
    expect(omegaLine).toMatchObject({
      sku: 'Omega',
      description: 'Plaster Fnsh 16 / 20 N / A',
      quantity: 673,
      unit: 'ea',
    })
    expect(omegaResponse).toMatchObject({
      sku: 'Omega',
      description: 'Plaster Fnsh 16 / 20 N / A',
      quantity: 673,
      unit: 'ea',
      unit_price: 20,
      total_price: 13460,
    })

    const firstLine = result.rfq.line_items.find((line) => line.sku === '250CH-33')
    const firstResponse = result.bid.line_item_responses.find((line) => line.line_item_id === firstLine?.id)
    expect(firstResponse).toMatchObject({
      sku: '250CH-33',
      total_price: 2662,
    })
  })

  it('preserves repeated SKUs as distinct rows when building a named import from files', () => {
    const result = createExternalQuoteImportFromFiles({
      projectId: 'project-1',
      projectName: 'MCRD P-314',
      title: 'Named repeated SKU import',
      files: [{
        filename: 'repeated-skus.pdf',
        sourceKind: 'pdf',
        text: `
Supplier : L n W Supply - San Diego Expected Delivery Date : 08 / 01 / 2026
1 MILCOR MILCOR Access Door 12 x 12 2.00 EA 100.000 1.00 EA $ 200.00
2 MILCOR MILCOR Access Door 24 x 24 3.00 EA 150.000 1.00 EA $ 450.00
3 MILCOR MILCOR Access Door 24 x 24 5.00 EA 150.000 1.00 EA $ 750.00
`,
      }],
      now: '2026-05-16T16:35:09.000Z',
    })

    expect(result.rfq.line_items).toHaveLength(3)
    expect(result.bid.line_item_responses).toHaveLength(3)
    expect(result.rfq.line_items.map((line) => line.description)).toEqual([
      'Access Door 12 x 12',
      'Access Door 24 x 24',
      'Access Door 24 x 24',
    ])
    expect(result.rfq.line_items.map((line) => line.quantity)).toEqual([2, 3, 5])
    expect(result.bid.line_item_responses.map((line) => line.total_price)).toEqual([200, 450, 750])
  })

  it('reassembles split PDF item descriptions around size-only priced rows', () => {
    const result = createExternalQuoteImport({
      projectId: 'project-1',
      projectName: 'MCRD P-314',
      filename: 'split-pdf-rows.pdf',
      sourceKind: 'pdf',
      text: `
Quote ID : 0001 - The Raymond Group
Supplier : L n W Supply - San Diego Expected Delivery Date : 08 / 01 / 2026 - 02 / 28 / 2027
Michael Null 9 - MCRD P - 314 Company :
Michael . Null @ raymondgroup . com Bid : 1.0 - Base Bid Job Site : San Diego , CA
No . Item Description Item Notes Size Quantity Price Per Total
250JS - 33 2 1 / 2 " X 20ga . Jamb
3 250JS - 33 10 ' 0 " 1,094.00 LF 1250.000 1,000.00 LF $ 1,367.50
Strut
400S162 - 54 4 " X 16ga . 1 5 / 8 " 16,827.00
25 400S162 - 54 Multi 1190.000 1,000.00 LF $ 20,024.13
Flange Stud LF
`,
      now: '2026-05-11T12:00:00.000Z',
    })

    expect(result.rfq.line_items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sku: '250JS-33',
        description: '2 1 / 2 " X 20ga . Jamb 10 \' 0 " Strut',
        quantity: 1094,
        unit: 'lf',
      }),
      expect.objectContaining({
        sku: '400S162-54',
        description: '4 " X 16ga . 1 5 / 8 " Multi Flange Stud',
        quantity: 16827,
        unit: 'lf',
      }),
    ]))
    expect(result.rfq.line_items).not.toContainEqual(expect.objectContaining({ description: '10 \' 0 "' }))
    expect(result.rfq.line_items).not.toContainEqual(expect.objectContaining({ unit: 'multi' }))
  })

  it('imports compact PDF text columns without leaking generated row ids into item descriptions', () => {
    const result = createExternalQuoteImport({
      projectId: 'project-1',
      projectName: 'MCRD P-314',
      filename: '9 - MCRD P-314 - 1.0 - Base Bid.pdf',
      sourceKind: 'pdf',
      text: `
9 - MCRD P-314 - 1.0 - Base Bid
Item Description Qty L n W Supply - San Diego Unit Pr L n W Supply - San Diego Total P L n W Supply - San Diego Lead Ti L n W Supply - San Diego Alt
250CH-33 250CH-33 2 1/2" X 22ga. C-H Stud 2,420 lf $1,100 $2,662 0d
250JS-33 10' 0" 1,094 lf $1,250 $1,368 0d
400S162-54 4" X 16ga. 1 5/8" 16,827 multi $1,190 $20,024 0d
EXPBLT 3/8" X 2 3/4" 63 ea $2 $126 0d
EXPBLT 1/2" X 3 3/4" 84 ea $2 $185 0d
`,
      now: '2026-05-16T16:41:14.856Z',
    })

    expect(result.rfq.line_items).toHaveLength(5)
    expect(result.bid.vendor_name).toBe('L n W Supply - San Diego')
    expect(result.rfq.line_items.map((line) => line.description).some((description) => description.includes('rfq-import'))).toBe(false)
    expect(result.rfq.line_items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sku: '250CH-33',
        description: '2 1/2" X 22ga. C-H Stud',
        quantity: 2420,
        unit: 'lf',
      }),
      expect.objectContaining({
        sku: '250JS-33',
        description: '2 1/2" X 20ga. Jamb Strut 10\' 0"',
        quantity: 1094,
        unit: 'lf',
      }),
      expect.objectContaining({
        sku: '400S162-54',
        description: '4" X 16ga. 1 5/8" Flange Stud',
        quantity: 16827,
        unit: 'lf',
      }),
    ]))
    expect(result.bid.line_item_responses.find((line) => line.sku === '400S162-54')).toMatchObject({
      unit_price: 1.19,
      total_price: 20024,
    })
    expect(result.rfq.line_items.filter((line) => line.sku === 'EXPBLT')).toHaveLength(2)
    expect(result.bid.line_item_responses.filter((line) => line.sku === 'EXPBLT').map((line) => line.line_item_id)).toEqual(
      result.rfq.line_items.filter((line) => line.sku === 'EXPBLT').map((line) => line.id),
    )
    expect(result.warnings).toContainEqual(expect.objectContaining({
      message: expect.stringContaining('compact PDF text columns'),
    }))
  })

  it('imports compact PDF rows whose descriptions contain quantities, units, and lead times', () => {
    const result = createExternalQuoteImport({
      projectId: 'project-1',
      projectName: 'PDF Batch Verification',
      filename: 'batch-pdf-vendor-001.pdf',
      sourceKind: 'pdf',
      text: `
Imported Vendor Quote
Supplier : Batch PDF Vendor 001 Expected Delivery Date : 06 / 01 / 2026
Item Description Qty Batch PDF Vendor 001 Unit Pr Total Lead
A00101 B001-01 Type X gypsum board 4x12 package 1-1 11 EA 2.15 23.65 3 days
B00102 B001-02 Cold formed metal stud 20ga 10 ft package 1-2 18 LF 2.34 42.12 4 days
C00103 B001-03 Acoustic sealant cartridge 29oz package 1-3 25 SF 2.53 63.25 5 days
`,
      now: '2026-05-16T16:41:14.856Z',
    })

    expect(result.bid.vendor_name).toBe('Batch PDF Vendor 001')
    expect(result.rfq.line_items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sku: 'B001-02',
        description: 'Cold formed metal stud 20ga 10 ft package 1-2',
        quantity: 18,
        unit: 'lf',
      }),
    ]))
    expect(result.bid.line_item_responses.find((line) => line.sku === 'B001-02')).toMatchObject({
      unit_price: 2.34,
      total_price: 42.12,
      lead_time_days: 4,
    })
  })

  it('normalizes compact PDF negative price rows formatted with a leading negative dollar sign', () => {
    const result = createExternalQuoteImport({
      projectId: 'project-1',
      projectName: 'PDF Credit Verification',
      filename: 'adversarial-columnar-001.pdf',
      sourceKind: 'pdf',
      text: `
Supplier : Adversarial PDF Supply 001 Expected Delivery Date : 07 / 15 / 2026
Line SKU Description Qty Unit Unit Price Total Lead
Q00110 ADV-001-10 Access panel 24 x 24 fire rated batch 1.10 118 EA -$4.06 -$479.08 20 d
`,
      now: '2026-05-16T16:41:14.856Z',
    })

    expect(result.rfq.line_items).toHaveLength(1)
    expect(result.bid.line_item_responses[0]).toMatchObject({
      sku: 'ADV-001-10',
      unit_price: 4.06,
      total_price: 479.08,
      lead_time_days: 20,
    })
    expect(result.bid.line_item_responses[0].response_attributes).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'import_review:unit_price:negative_price' }),
      expect.objectContaining({ key: 'import_review:total:negative_price' }),
    ]))
    expect(result.bid.total_price).toBe(479.08)
  })

  it('normalizes compact PDF accounting-style parenthetical negative price rows', () => {
    const result = createExternalQuoteImport({
      projectId: 'project-1',
      projectName: 'PDF Ledger Credit Verification',
      filename: 'ledger-credit-corpus-001.pdf',
      sourceKind: 'pdf',
      text: `
Supplier : Ledger Credit Vendor 001 Expected Delivery Date : 08 / 10 / 2026
Line SKU Material Description Qty Unit Unit Price Ext Total Lead
L00104 LED-001-04 Fire caulk CP-25WB plus 10.1 oz tube ledger 1-4 63 Bundle ($2.04) ($128.52) 10 days
`,
      now: '2026-05-16T16:41:14.856Z',
    })

    expect(result.rfq.line_items).toHaveLength(1)
    expect(result.bid.line_item_responses[0]).toMatchObject({
      sku: 'LED-001-04',
      unit_price: 2.04,
      total_price: 128.52,
      lead_time_days: 10,
    })
    expect(result.bid.line_item_responses[0].response_attributes).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'import_review:unit_price:negative_price' }),
      expect.objectContaining({ key: 'import_review:total:negative_price' }),
    ]))
    expect(result.bid.total_price).toBe(128.52)
  })

  it('normalizes extracted PDF negative totals formatted after quantity columns', () => {
    const result = createExternalQuoteImport({
      projectId: 'project-1',
      projectName: 'Extracted PDF Credit Verification',
      filename: 'mcrd-credit-row.pdf',
      sourceKind: 'pdf',
      text: `
1 362S125-30 10' 0" -606.00 LF 545.000 1,000.00 LF -$330.27
Total: -$330.27
`,
      now: '2026-05-16T16:41:14.856Z',
    })

    expect(result.rfq.line_items).toHaveLength(1)
    expect(result.bid.line_item_responses[0]).toMatchObject({
      sku: '362S125-30',
      quantity: 606,
      unit_price: 0.545,
      total_price: 330.27,
    })
    expect(result.bid.line_item_responses[0].response_attributes).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'import_review:unit_price:price_basis_conversion' }),
      expect.objectContaining({ key: 'import_review:total:negative_price' }),
    ]))
    expect(result.bid.total_price).toBe(330.27)
  })

  it('combines wrapped PDF descriptions before parsing priced continuation lines', () => {
    const result = createExternalQuoteImport({
      projectId: 'project-1',
      projectName: 'PDF Wrapped Description Verification',
      filename: 'wrapped-description-corpus-001.pdf',
      sourceKind: 'pdf',
      text: `
Supplier : Wrapped PDF Vendor 001 Expected Delivery Date : 09 / 06 / 2026
Line SKU Description Qty Unit Unit Price Ext Total Lead
W00101 WRAP-001-01 Fire-rated gypsum shaftliner panel assembly
ASTM C645 20ga 10 ft lengths for corridor level 2 8 EA $1.11 $8.88 2 days
`,
      now: '2026-05-16T16:41:14.856Z',
    })

    expect(result.rfq.line_items).toHaveLength(1)
    expect(result.rfq.line_items[0]).toMatchObject({
      sku: 'WRAP-001-01',
      description: 'Fire-rated gypsum shaftliner panel assembly ASTM C645 20ga 10 ft lengths for corridor level 2',
      quantity: 8,
      unit: 'ea',
    })
    expect(result.bid.line_item_responses[0]).toMatchObject({
      sku: 'WRAP-001-01',
      unit_price: 1.11,
      total_price: 8.88,
      lead_time_days: 2,
    })
  })

  it('combines preceding PDF description lines before parsing priced item rows', () => {
    const result = createExternalQuoteImport({
      projectId: 'project-1',
      projectName: 'PDF Preceding Description Verification',
      filename: 'preceding-description-corpus-001.pdf',
      sourceKind: 'pdf',
      text: `
Supplier : Preceding Description Vendor 001 Expected Delivery Date : 10 / 07 / 2026
Description / Line SKU Qty Unit Unit Price Total Lead
UL design U419 partition assembly with resilient channel
P00101 PRE-001-01 5/8 in Type X gypsum board 4x12 sheets 15 EA $1.20 $18.00 3 days
`,
      now: '2026-05-16T16:41:14.856Z',
    })

    expect(result.rfq.line_items).toHaveLength(1)
    expect(result.rfq.line_items[0]).toMatchObject({
      sku: 'PRE-001-01',
      description: 'UL design U419 partition assembly with resilient channel 5/8 in Type X gypsum board 4x12 sheets',
      quantity: 15,
      unit: 'ea',
    })
    expect(result.bid.line_item_responses[0]).toMatchObject({
      sku: 'PRE-001-01',
      unit_price: 1.2,
      total_price: 18,
      lead_time_days: 3,
    })
  })

  it('creates one imported bid per supplier from a wide multi-supplier comparison file', () => {
    const result = createExternalQuoteImport({
      projectId: 'project-1',
      projectName: 'MCRD P-314',
      filename: '01-multi-supplier-wide-comparison.csv',
      sourceKind: 'spreadsheet',
      text: multiSupplierWideText,
      now: '2026-05-11T12:00:00.000Z',
    })

    expect(result.rfq.line_items).toHaveLength(12)
    expect(result.bids.map((bid) => bid.vendor_name)).toEqual([
      'L n W Supply - San Diego',
      'Acme Drywall Supply',
      'BuildCo Materials',
      'Metro Door Hardware',
    ])
    expect(result.bids[0].line_item_responses).toHaveLength(11)
    expect(result.bids[3].line_item_responses).toHaveLength(4)
    expect(result.bid.vendor_name).toBe('L n W Supply - San Diego')
    expect(result.rfq.invites?.map((invite) => invite.vendor_name)).toContain('BuildCo Materials')
    expect(result.bids.flatMap((bid) => bid.line_item_responses).some((line) => line.is_alternate)).toBe(false)
    expect(result.bids.find((bid) => bid.vendor_name === 'BuildCo Materials')?.line_item_responses.find((line) => line.sku === '250JR-33')?.notes).toContain('alternate manufacturer')
    expect(result.bids.find((bid) => bid.vendor_name === 'Acme Drywall Supply')?.line_item_responses.find((line) => line.sku === 'LOCK-SET')?.notes).toContain('substitution')
    expect(result.warnings).toContainEqual(expect.objectContaining({
      message: expect.stringContaining('multiple supplier'),
    }))
  })

  it('imports compact PDF matrix text with source vendor names and SF rows', () => {
    const result = createExternalQuoteImport({
      projectId: 'project-1',
      projectName: 'Multi Vendor Matrix Verification',
      filename: 'multi-vendor-matrix-corpus-001.pdf',
      sourceKind: 'pdf',
      text: customVendorMatrixText,
      now: '2026-05-16T16:41:14.856Z',
    })

    expect(result.rfq.line_items.map((line) => line.sku)).toEqual([
      'MATRIX-001-01',
      'MATRIX-001-02',
      'MATRIX-001-03',
    ])
    expect(result.rfq.line_items.find((line) => line.sku === 'MATRIX-001-03')).toMatchObject({
      description: 'Acoustic sealant 29 oz cartridge matrix 1-3',
      quantity: 58,
      unit: 'sf',
    })
    expect(result.bids.map((bid) => bid.vendor_name)).toEqual([
      'Northstar Supply 001',
      'Pinnacle Materials 001',
      'Harbor Drywall 001',
    ])
    expect(result.bids.find((bid) => bid.vendor_name === 'Harbor Drywall 001')?.line_item_responses.find((line) => line.sku === 'MATRIX-001-03')).toMatchObject({
      unit_price: 1.73,
      total_price: 100.34,
      lead_time_days: 12,
    })
  })

  it('imports row-per-vendor files even when clients use different column names', () => {
    const result = createExternalQuoteImport({
      projectId: 'project-1',
      projectName: 'Library TI',
      filename: '16-different-column-names.csv',
      sourceKind: 'spreadsheet',
      text: differentColumnNamesText,
      now: '2026-05-11T12:00:00.000Z',
    })

    const metro = result.bids.find((bid) => bid.vendor_name === 'Metro Door Hardware')
    expect(result.rfq.line_items[0]).toMatchObject({
      sku: '250CH-33',
      description: '2 1/2 in 22ga CH Stud 10 ft',
      quantity: 2420,
      unit: 'lf',
    })
    expect(result.bids).toHaveLength(4)
    expect(metro?.line_item_responses.map((line) => line.sku)).toEqual(expect.arrayContaining([
      'HM-FRAME',
      'HM-DOOR',
      'LOCK-SET',
    ]))
    expect(metro?.line_item_responses).not.toContainEqual(expect.objectContaining({ sku: '250CH-33' }))
  })

  it('creates one RFQ comparison from multiple separate vendor quote files', () => {
    const result = createExternalQuoteImportFromFiles({
      projectId: 'project-1',
      projectName: 'MCRD P-314',
      title: 'MCRD P-314 Metal Framing',
      now: '2026-05-11T12:00:00.000Z',
      files: [
        {
          filename: 'acme-drywall.pdf',
          sourceKind: 'pdf',
          text: acmeSingleVendorText,
        },
        {
          filename: 'buildco-materials.pdf',
          sourceKind: 'pdf',
          text: buildCoSingleVendorText,
        },
      ],
    })

    expect(result.rfq.title).toBe('MCRD P-314 Metal Framing')
    expect(result.rfq.status).toBe('active')
    expect(result.rfq.line_items).toHaveLength(2)
    expect(result.bids.map((bid) => bid.vendor_name)).toEqual(['Acme Drywall Supply', 'BuildCo Materials'])
    expect(result.bids).toHaveLength(2)
    expect(result.bids.every((bid) => bid.rfq_id === result.rfq.id)).toBe(true)
    expect(result.bids.every((bid) => bid.line_item_responses.length === 2)).toBe(true)
    expect(new Set(result.bids.flatMap((bid) => bid.line_item_responses.map((line) => line.line_item_id)))).toEqual(
      new Set(result.rfq.line_items.map((line) => line.id)),
    )
    expect(result.bids.flatMap((bid) => bid.line_item_responses).some((line) => line.is_alternate)).toBe(false)
    expect(result.bids.find((bid) => bid.vendor_name === 'BuildCo Materials')?.line_item_responses.find((line) => line.sku === '250JR-33')?.notes).toContain('alternate manufacturer')
    expect(result.rfq.invites?.map((invite) => invite.vendor_name)).toEqual(['Acme Drywall Supply', 'BuildCo Materials'])
    expect(result.warnings).toContainEqual(expect.objectContaining({
      message: expect.stringContaining('Imported 2 vendor quote responses from 2 files'),
    }))
  })

  it('matches multi-file vendor rows by SKU and unit while preserving each vendor description', () => {
    const result = createExternalQuoteImportFromFiles({
      projectId: 'project-1',
      projectName: 'Library TI',
      title: 'Library TI Metal Framing',
      now: '2026-05-16T12:00:00.000Z',
      files: [
        {
          filename: 'alpha.csv',
          sourceKind: 'spreadsheet',
          text: [
            'Line #,Part No,Material Name,Required Qty,UOM,Vendor,Quoted Unit Cost,Extended Cost,ETA,Clarifications',
            'A001,362S125-30,3 5/8 in 20ga metal stud 10 ft,606,LF,Alpha Supply,1.31,793.86,14 days,',
          ].join('\n'),
        },
        {
          filename: 'beta.csv',
          sourceKind: 'spreadsheet',
          text: [
            'Line #,Part No,Material Name,Required Qty,UOM,Vendor,Quoted Unit Cost,Extended Cost,ETA,Clarifications',
            'A001,362S125-30,362S125-30 3-5/8 inch 20 gauge stud,606,LF,Beta Supply,1.27,769.62,9 days,',
          ].join('\n'),
        },
      ],
    })

    expect(result.rfq.line_items).toHaveLength(1)
    expect(result.bids.map((bid) => bid.vendor_name)).toEqual(['Alpha Supply', 'Beta Supply'])
    expect(result.bids.find((bid) => bid.vendor_name === 'Alpha Supply')?.line_item_responses[0]).toMatchObject({
      line_item_id: result.rfq.line_items[0].id,
      description: '3 5/8 in 20ga metal stud 10 ft',
    })
    expect(result.bids.find((bid) => bid.vendor_name === 'Beta Supply')?.line_item_responses[0]).toMatchObject({
      line_item_id: result.rfq.line_items[0].id,
      description: '362S125-30 3-5/8 inch 20 gauge stud',
    })
    expect(result.warnings).toContainEqual(expect.objectContaining({
      message: expect.stringContaining('matched an existing SKU with a different description'),
    }))
  })

  it('creates one RFQ comparison from multiple custom matrix quote files', () => {
    const result = createExternalQuoteImportFromFiles({
      projectId: 'project-1',
      projectName: 'Multi Vendor Matrix Verification',
      title: 'Batch Matrix Import',
      now: '2026-05-16T16:41:14.856Z',
      files: [
        {
          filename: 'multi-vendor-matrix-corpus-001.pdf',
          sourceKind: 'pdf',
          text: customVendorMatrixTextFor(1),
        },
        {
          filename: 'multi-vendor-matrix-corpus-002.pdf',
          sourceKind: 'pdf',
          text: customVendorMatrixTextFor(2),
        },
      ],
    })

    expect(result.rfq.line_items).toHaveLength(6)
    expect(result.bids.map((bid) => bid.vendor_name)).toEqual([
      'Northstar Supply 001',
      'Pinnacle Materials 001',
      'Harbor Drywall 001',
      'Northstar Supply 002',
      'Pinnacle Materials 002',
      'Harbor Drywall 002',
    ])
    expect(result.bids.every((bid) => bid.line_item_responses.length === 3)).toBe(true)
    expect(result.bids.find((bid) => bid.vendor_name === 'Harbor Drywall 002')?.line_item_responses.map((line) => line.sku)).toEqual([
      'MATRIX-002-01',
      'MATRIX-002-02',
      'MATRIX-002-03',
    ])
    expect(result.warnings).toContainEqual(expect.objectContaining({
      message: expect.stringContaining('Imported 6 vendor quote responses from 2 files'),
    }))
  })

  it('imports 2 through 10 separate quote files into renderable comparison sheets', () => {
    const extensions = ['csv', 'xlsx', 'pdf', 'txt', 'tsv', 'xls', 'xsl', 'csv', 'xlsx', 'txt']

    for (let fileCount = 2; fileCount <= 10; fileCount += 1) {
      const files = Array.from({ length: fileCount }, (_, index) => {
        const vendorName = `Batch Vendor ${String(index + 1).padStart(2, '0')}`
        return {
          filename: `batch-vendor-${index + 1}.${extensions[index]}`,
          sourceKind: extensions[index] === 'pdf' ? 'pdf' as const : 'spreadsheet' as const,
          text: generatedSingleVendorQuoteText(vendorName, index + 1),
        }
      })

      const result = createExternalQuoteImportFromFiles({
        projectId: 'project-1',
        projectName: 'MCRD P-314',
        title: `Batch Import ${fileCount}`,
        now: `2026-05-11T12:00:${String(fileCount).padStart(2, '0')}.000Z`,
        files,
      })
      const snapshot = importedComparisonSnapshot(result.rfq, result.bids)

      expect(result.rfq.line_items).toHaveLength(3)
      expect(result.bids).toHaveLength(fileCount)
      expect(result.bids.map((bid) => bid.vendor_name)).toEqual(
        Array.from({ length: fileCount }, (_, index) => `Batch Vendor ${String(index + 1).padStart(2, '0')}`),
      )
      expect(result.bids.every((bid) => bid.line_item_responses.length === result.rfq.line_items.length)).toBe(true)
      expect(new Set(result.bids.map((bid) => bid.id)).size).toBe(fileCount)
      expect(new Set(result.rfq.line_items.map((line) => line.id)).size).toBe(3)
      expect(result.bids.flatMap((bid) => bid.line_item_responses).some((line) => line.is_alternate)).toBe(false)
      expect(snapshot.columns).toHaveLength(4 + fileCount * 2 + 1)
      expect(snapshot.vendors).toHaveLength(fileCount)
      expect(snapshot.rows).toHaveLength(3)
      for (const bid of result.bids) {
        const vendorId = idPartForSnapshot(bid.vendor_name)
        expect(snapshot.columns.map((column) => column.key)).toEqual(expect.arrayContaining([
          `${vendorId}-price`,
          `${vendorId}-lead`,
        ]))
        for (const row of snapshot.rows) {
          expect(row.values[`${vendorId}-price`]).not.toBe('')
          expect(row.values[`${vendorId}-lead`]).toMatch(/days/)
        }
      }
      expect(result.warnings).toContainEqual(expect.objectContaining({
        message: expect.stringContaining(`Imported ${fileCount} vendor quote responses from ${fileCount} files`),
      }))
    }
  })

  it('merges an additional quote import into an existing comparison without replacing current lines or bids', () => {
    const initial = createExternalQuoteImportFromFiles({
      projectId: 'project-1',
      projectName: 'MCRD P-314',
      title: 'MCRD P-314 Metal Framing',
      now: '2026-05-11T12:00:00.000Z',
      files: [{
        filename: 'acme-drywall.pdf',
        sourceKind: 'pdf',
        text: acmeSingleVendorText,
      }],
    })
    const additional = createExternalQuoteImportFromFiles({
      projectId: 'project-1',
      projectName: 'MCRD P-314',
      title: 'MCRD P-314 Metal Framing',
      now: '2026-05-11T12:00:00.000Z',
      files: [{
        filename: 'buildco-materials.pdf',
        sourceKind: 'pdf',
        text: [
          buildCoSingleVendorText.trim(),
          'A003,GWB-58X,5/8 Type X Gypsum Board 4x12,620,Sheet,BuildCo Materials,17.66,10949.2,4 weeks,',
        ].join('\n'),
      }],
    })

    const merged = mergeExternalQuoteImportIntoRFQ({
      targetRfq: initial.rfq,
      existingBids: initial.bids,
      imported: additional,
      now: '2026-05-12T12:00:00.000Z',
    })

    expect(merged.rfq.id).toBe(initial.rfq.id)
    expect(merged.rfq.line_items.map((line) => line.id)).toEqual([
      ...initial.rfq.line_items.map((line) => line.id),
      expect.stringContaining(`${initial.rfq.id}-line-gwb-58x`),
    ])
    expect(merged.addedLineItems).toHaveLength(1)
    expect(merged.bids).toHaveLength(1)
    expect(merged.bids[0].rfq_id).toBe(initial.rfq.id)
    expect(merged.bids[0].id).not.toBe(additional.bids[0].id)
    expect(merged.bids[0].line_item_responses.map((line) => line.line_item_id)).toEqual([
      initial.rfq.line_items[0].id,
      initial.rfq.line_items[1].id,
      merged.addedLineItems[0].id,
    ])
    expect(merged.bids[0].line_item_responses.some((line) => line.is_alternate)).toBe(false)
    expect(merged.warnings).toContainEqual(expect.objectContaining({
      message: expect.stringContaining('Added 1 imported vendor quote response'),
    }))
  })

  it('appends vendor rows to existing comparison by SKU and unit even when descriptions differ', () => {
    const initial = createExternalQuoteImportFromFiles({
      projectId: 'project-1',
      projectName: 'Library TI',
      title: 'Library TI Metal Framing',
      now: '2026-05-16T12:00:00.000Z',
      files: [{
        filename: 'alpha.csv',
        sourceKind: 'spreadsheet',
        text: [
          'Line #,Part No,Material Name,Required Qty,UOM,Vendor,Quoted Unit Cost,Extended Cost,ETA,Clarifications',
          'A001,362S125-30,3 5/8 in 20ga metal stud 10 ft,606,LF,Alpha Supply,1.31,793.86,14 days,',
        ].join('\n'),
      }],
    })
    const additional = createExternalQuoteImportFromFiles({
      projectId: 'project-1',
      projectName: 'Library TI',
      title: 'Library TI Metal Framing',
      now: '2026-05-16T12:01:00.000Z',
      files: [{
        filename: 'beta.csv',
        sourceKind: 'spreadsheet',
        text: [
          'Line #,Part No,Material Name,Required Qty,UOM,Vendor,Quoted Unit Cost,Extended Cost,ETA,Clarifications',
          'A001,362S125-30,362S125-30 3-5/8 inch 20 gauge stud,606,LF,Beta Supply,1.27,769.62,9 days,',
        ].join('\n'),
      }],
    })

    const merged = mergeExternalQuoteImportIntoRFQ({
      targetRfq: initial.rfq,
      existingBids: initial.bids,
      imported: additional,
      now: '2026-05-16T12:02:00.000Z',
    })

    expect(merged.addedLineItems).toHaveLength(0)
    expect(merged.rfq.line_items).toHaveLength(1)
    expect(merged.bids).toHaveLength(1)
    expect(merged.bids[0].line_item_responses[0]).toMatchObject({
      line_item_id: initial.rfq.line_items[0].id,
      description: '362S125-30 3-5/8 inch 20 gauge stud',
      total_price: 769.62,
    })
    expect(merged.warnings).toContainEqual(expect.objectContaining({
      message: expect.stringContaining('matched an existing SKU with a different description'),
    }))
  })

  it('merges a custom matrix import into an existing comparison with matched and added lines', () => {
    const initial = createExternalQuoteImportFromFiles({
      projectId: 'project-1',
      projectName: 'Multi Vendor Matrix Verification',
      title: 'Batch Matrix Import',
      now: '2026-05-16T16:41:14.856Z',
      files: [{
        filename: 'multi-vendor-matrix-corpus-001.pdf',
        sourceKind: 'pdf',
        text: customVendorMatrixTextFor(1),
      }],
    })
    const additionalText = [
      customVendorMatrixTextFor(1).trim()
        .replace(/Northstar Supply 001/g, 'Northstar Supply 002')
        .replace(/Pinnacle Materials 001/g, 'Pinnacle Materials 002')
        .replace(/Harbor Drywall 001/g, 'Harbor Drywall 002'),
      'M00204 MATRIX-002-04 Corner bead matrix 2-4 75 Tube 1.38 103.50 7 days 1.61 120.75 10 days 1.84 138.00 13 days',
    ].join('\n')
    const additional = createExternalQuoteImportFromFiles({
      projectId: 'project-1',
      projectName: 'Multi Vendor Matrix Verification',
      title: 'Batch Matrix Import',
      now: '2026-05-16T16:42:14.856Z',
      files: [{
        filename: 'multi-vendor-matrix-corpus-002.pdf',
        sourceKind: 'pdf',
        text: additionalText,
      }],
    })

    const merged = mergeExternalQuoteImportIntoRFQ({
      targetRfq: initial.rfq,
      existingBids: initial.bids,
      imported: additional,
      now: '2026-05-16T16:43:14.856Z',
    })

    expect(merged.addedLineItems.map((line) => line.sku)).toEqual(['MATRIX-002-04'])
    expect(merged.rfq.line_items).toHaveLength(4)
    expect(merged.bids.map((bid) => bid.vendor_name)).toEqual([
      'Northstar Supply 002',
      'Pinnacle Materials 002',
      'Harbor Drywall 002',
    ])
    expect(merged.bids.every((bid) => bid.line_item_responses.length === 4)).toBe(true)
    expect(merged.bids.find((bid) => bid.vendor_name === 'Harbor Drywall 002')?.line_item_responses.find((line) => line.sku === 'MATRIX-002-04')).toMatchObject({
      unit_price: 1.84,
      total_price: 138,
      lead_time_days: 13,
    })
    expect(merged.warnings).toContainEqual(expect.objectContaining({
      message: expect.stringContaining('Matched 3 existing line items and added 1 new line item'),
    }))
  })

  it('imports repeated supplier blocks like customer comparison screenshots', () => {
    const result = createExternalQuoteImport({
      projectId: 'project-1',
      projectName: 'MCRD P-314',
      filename: 'screen-style-multi-vendor.csv',
      sourceKind: 'spreadsheet',
      text: repeatedSupplierBlocksText,
      now: '2026-05-11T12:00:00.000Z',
    })

    expect(result.rfq.line_items).toHaveLength(3)
    expect(result.bids.map((bid) => bid.vendor_name)).toEqual([
      'Foundation - San Diego',
      'L n W Supply - San Diego',
      'Action Gypsum Supply',
      'J n B Materials - Perris',
    ])
    expect(result.bids.find((bid) => bid.vendor_name === 'Action Gypsum Supply')?.line_item_responses).toHaveLength(2)
    expect(result.bids.find((bid) => bid.vendor_name === 'L n W Supply - San Diego')?.line_item_responses[0]).toMatchObject({
      sku: '250CH-33',
      unit_price: 350,
      total_price: 847000,
    })
    expect(result.warnings).toContainEqual(expect.objectContaining({
      message: expect.stringContaining('repeated supplier block'),
    }))
  })

  it('imports simple inline email quote prose without smart-agent fallback', () => {
    const result = createExternalQuoteImport({
      projectId: 'project-1',
      projectName: 'Willow Middle School',
      filename: 'inline-email-reply-quote.txt',
      sourceKind: 'spreadsheet',
      text: [
        'Tomasz,',
        '',
        'Here is our quote for the ceiling grid package:',
        '',
        'DXL 4 ft cross tee 15/16 fire-rated, qty 420 ea, unit price $1.82, lead time 5 days',
        'DXL 12 ft main runner heavy-duty 15/16, qty 96 ea, unit price $6.10, lead time 5 days',
        'Armstrong Ultima 24x24 tegular panel ACM-24X24-580, qty 900 sf, unit price $2.39, lead time 7 days',
        '',
        'Freight included. Quote good for 30 days.',
      ].join('\n'),
      now: '2026-05-11T12:00:00.000Z',
    })

    expect(result.rfq.line_items).toHaveLength(3)
    expect(result.bid.vendor_name).toBe('Imported Vendor')
    expect(result.bid.line_item_responses).toHaveLength(3)
    expect(result.bid.line_item_responses[0]).toMatchObject({
      description: 'DXL 4 ft cross tee 15/16 fire-rated',
      quantity: 420,
      unit: 'ea',
      unit_price: 1.82,
      total_price: 764.4,
    })
    expect(result.bid.line_item_responses[2]).toMatchObject({
      sku: 'ACM-24X24-580',
      quantity: 900,
      total_price: 2151,
    })
  })

  it('deterministically imports XML, YAML, HTML, and fixed-width quote exports', () => {
    const fixtures = [
      {
        filename: 'vendor-comparison-xml-surprise.xml',
        text: `<?xml version="1.0"?>
<vendorComparison project="Cypress Hall Renovation" package="Interior framing">
  <requestedItems>
    <item line="A101" sku="362S125-30" description="3 5/8 in 20ga stud 12 ft" quantity="740" unit="EA" />
    <item line="A102" sku="250T125-33" description="2 1/2 in 20ga track 10 ft" quantity="420" unit="LF" />
  </requestedItems>
  <vendor name="Harbor Wall Supply">
    <quote line="A101" unitPrice="9.85" total="7289.00" leadTime="11 days" notes="stocked locally" />
    <quote line="A102" unitPrice="1.42" total="596.40" leadTime="11 days" notes="" />
  </vendor>
  <vendor name="North Coast Interiors">
    <quote line="A101" unitPrice="10.10" total="7474.00" leadTime="2 weeks" notes="" />
    <quote line="A102" unitPrice="1.37" total="575.40" leadTime="2 weeks" notes="alternate manufacturer acceptable" />
  </vendor>
</vendorComparison>`,
        expectedVendors: ['Harbor Wall Supply', 'North Coast Interiors'],
      },
      {
        filename: 'vendor-comparison-yaml-export.yaml',
        text: `project: Juniper Labs
items:
  - id: C-01
    sku: ACT-24X24
    description: 24x24 acoustical ceiling tile
    qty: 960
    unit: SF
  - id: C-02
    sku: GRID-15/16
    description: 15/16 inch exposed tee grid
    qty: 960
    unit: SF
vendors:
  - name: Acoustic Pros
    quotes:
      - item: C-01
        unit_price: 2.18
        total: 2092.80
        lead: 9 days
      - item: C-02
        unit_price: 1.44
        total: 1382.40
        lead: 9 days
  - name: Ceiling Depot
    quotes:
      - item: C-01
        unit_price: 2.05
        total: 1968.00
        lead: 16 days
        notes: alternate manufacturer
      - item: C-02
        unit_price: 1.51
        total: 1449.60
        lead: 16 days`,
        expectedVendors: ['Acoustic Pros', 'Ceiling Depot'],
      },
      {
        filename: 'vendor-comparison-html-table.weird',
        text: `<table><thead><tr><th>Line</th><th>Part</th><th>Description</th><th>Qty</th><th>UOM</th><th>Summit Supply Unit</th><th>Summit Supply Extended</th><th>Summit Lead</th><th>Metro Materials Unit</th><th>Metro Materials Extended</th><th>Metro Lead</th><th>Metro Notes</th></tr></thead><tbody><tr><td>H01</td><td>HM-FRAME</td><td>Hollow metal frame 3070</td><td>18</td><td>EA</td><td>188.40</td><td>3391.20</td><td>21 days</td><td>181.00</td><td>3258.00</td><td>28 days</td><td>shop drawings required</td></tr><tr><td>H02</td><td>HM-DOOR</td><td>18ga flush hollow metal door</td><td>18</td><td>EA</td><td>214.00</td><td>3852.00</td><td>21 days</td><td>209.50</td><td>3771.00</td><td>28 days</td><td></td></tr></tbody></table>`,
        expectedVendors: ['Summit Supply', 'Metro Materials'],
      },
      {
        filename: 'vendor-comparison-fixed-width.txtx',
        text: `PROJECT: Willow Middle School Addition
LINE  SKU          DESCRIPTION                         QTY   UNIT   VENDOR                 UNIT PRICE   TOTAL      LEAD       NOTES
F01   FAST-114     1 1/4 drywall screws                44    Box    Anchor Supply          39.75        1749.00    7 days
F01   FAST-114     1 1/4 drywall screws                44    Box    Westside Materials     41.10        1808.40    5 days      rush stock
F02   CORNER-BEAD  Vinyl corner bead 10 ft             1100  LF     Anchor Supply          1.22         1342.00    7 days
F02   CORNER-BEAD  Vinyl corner bead 10 ft             1100  LF     Westside Materials     1.19         1309.00    5 days`,
        expectedVendors: ['Anchor Supply', 'Westside Materials'],
      },
    ]

    for (const fixture of fixtures) {
      const result = createExternalQuoteImport({
        projectId: 'project-1',
        projectName: 'MCRD P-314',
        filename: fixture.filename,
        sourceKind: 'spreadsheet',
        text: fixture.text,
        now: '2026-05-11T12:00:00.000Z',
      })
      const snapshot = importedComparisonSnapshot(result.rfq, result.bids)

      expect(result.bids.map((bid) => bid.vendor_name)).toEqual(fixture.expectedVendors)
      expect(result.rfq.line_items.length).toBeGreaterThan(0)
      expect(snapshot.rows).toHaveLength(result.rfq.line_items.length)
      expect(snapshot.vendors.map((vendor) => vendor.name)).toEqual(fixture.expectedVendors)
      expect(result.bids.flatMap((bid) => bid.line_item_responses).some((line) => line.is_alternate)).toBe(false)
      expect(result.warnings.some((warning) => /XML|YAML|HTML|fixed-width/i.test(warning.message))).toBe(true)
    }
  })

  it.skipIf(!hasGeneratedFixtures)('imports generated stress fixture files as base quote comparisons', () => {
    const fixtureDir = generatedFixtureDir
    const fixtures = [
      {
        filename: '01-multi-supplier-wide-comparison.csv',
        expectedVendors: ['L n W Supply - San Diego', 'Acme Drywall Supply', 'BuildCo Materials', 'Metro Door Hardware'],
        expectedLineItems: 12,
      },
      {
        filename: '02-multi-supplier-row-per-vendor.csv',
        expectedVendors: ['L n W Supply - San Diego', 'Acme Drywall Supply', 'BuildCo Materials', 'Metro Door Hardware'],
        expectedLineItems: 12,
      },
      {
        filename: '16-different-column-names.csv',
        expectedVendors: ['L n W Supply - San Diego', 'Acme Drywall Supply', 'BuildCo Materials', 'Metro Door Hardware'],
        expectedLineItems: 12,
      },
    ]

    for (const fixture of fixtures) {
      const result = createExternalQuoteImport({
        projectId: 'project-1',
        projectName: 'MCRD P-314',
        filename: fixture.filename,
        sourceKind: 'spreadsheet',
        text: fs.readFileSync(path.join(fixtureDir, fixture.filename), 'utf8'),
        now: '2026-05-11T12:00:00.000Z',
      })

      expect(result.rfq.line_items).toHaveLength(fixture.expectedLineItems)
      expect(result.bids.map((bid) => bid.vendor_name)).toEqual(fixture.expectedVendors)
      expect(result.bids.every((bid) => bid.line_item_responses.length > 0)).toBe(true)
      expect(result.warnings.length).toBeGreaterThan(0)
    }
  })

  it.skipIf(!hasGeneratedFixtures)('imports a workbook with a base comparison tab plus vendor tabs without duplicate line items', () => {
    const result = createExternalQuoteImport({
      projectId: 'project-1',
      projectName: 'MCRD P-314',
      filename: '20-base-comparison-plus-vendor-tabs.xlsx',
      sourceKind: 'spreadsheet',
      text: extractWorkbookTextLikeImportRoute('20-base-comparison-plus-vendor-tabs.xlsx'),
      now: '2026-05-11T12:00:00.000Z',
    })

    expect(result.rfq.line_items).toHaveLength(12)
    expect(new Set(result.rfq.line_items.map((line) => line.id)).size).toBe(result.rfq.line_items.length)
    expect(result.rfq.line_items.map((line) => line.sku)).toEqual([
      '250CH-33',
      '250JR-33',
      '250JS-33',
      '362S125-30',
      'ACSEAL',
      'GWB-58X',
      'GWB-12MR',
      'CORNER-BEAD',
      'FAST-114',
      'HM-FRAME',
      'HM-DOOR',
      'LOCK-SET',
    ])
    expect(result.bids.map((bid) => bid.vendor_name)).toEqual([
      'L n W Supply - San Diego',
      'Acme Drywall Supply',
      'BuildCo Materials',
      'Metro Door Hardware',
    ])
  })

  it.skipIf(!hasGeneratedFixtures)('imports every generated stress fixture into a quote comparison shape', async () => {
    const fixtureDir = generatedFixtureDir
    const filenames = fs.readdirSync(fixtureDir)
      .filter((filename) => quoteImportFixtureExtensionPattern.test(filename))
      .sort()
    const failures: string[] = []

    for (const filename of filenames) {
      const fixturePath = path.join(fixtureDir, filename)
      try {
        const text = await extractExternalQuoteImportText(
          { name: filename, type: mimeTypeForFixture(filename) },
          fs.readFileSync(fixturePath),
        )
        const result = createExternalQuoteImport({
          projectId: 'project-1',
          projectName: 'MCRD P-314',
          filename,
          sourceKind: filename.toLowerCase().endsWith('.pdf') ? 'pdf' : 'spreadsheet',
          text,
          now: '2026-05-11T12:00:00.000Z',
        })

        const lineItemIds = result.rfq.line_items.map((line) => line.id)
        const bidIds = result.bids.map((bid) => bid.id)
        if (result.rfq.line_items.length === 0) failures.push(`${filename}: no RFQ line items`)
        if (result.bids.length === 0) failures.push(`${filename}: no vendor bids`)
        if (!result.bids.some((bid) => bid.line_item_responses.length > 0)) failures.push(`${filename}: no bid line responses`)
        if (new Set(lineItemIds).size !== lineItemIds.length) failures.push(`${filename}: duplicate RFQ line item ids`)
        if (new Set(bidIds).size !== bidIds.length) failures.push(`${filename}: duplicate bid ids`)
      } catch (error) {
        failures.push(`${filename}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    expect(filenames.length).toBeGreaterThan(0)
    expect(failures).toEqual([])
  })

  it.skipIf(!hasGeneratedFixtures)('lets the agent run edits and queries on every imported stress fixture comparison', async () => {
    const fixtureDir = generatedFixtureDir
    const filenames = fs.readdirSync(fixtureDir)
      .filter((filename) => quoteImportFixtureExtensionPattern.test(filename))
      .sort()
    const core = new RialtoAgentCore(new InMemoryUserContextProvider(), new QuoteComparisonArchitectureRuntime())
    const user: AuthenticatedUser = {
      id: 'fixture-agent-user',
      contractorOrganizationId: 'fixture-agent-org',
      role: 'estimator',
      name: 'Fixture Agent User',
      email: 'fixture-agent@example.com',
    }
    const failures: string[] = []

    for (const filename of filenames) {
      try {
        const fixturePath = path.join(fixtureDir, filename)
        const text = await extractExternalQuoteImportText(
          { name: filename, type: mimeTypeForFixture(filename) },
          fs.readFileSync(fixturePath),
        )
        const imported = createExternalQuoteImport({
          projectId: 'project-1',
          projectName: 'MCRD P-314',
          filename,
          sourceKind: filename.toLowerCase().endsWith('.pdf') ? 'pdf' : 'spreadsheet',
          text,
          now: '2026-05-11T12:00:00.000Z',
        })
        const snapshot = importedComparisonSnapshot(imported.rfq, imported.bids)

        const edit = await core.runTurn({
          requestId: `fixture-edit:${filename}`,
          user,
          messages: [{ role: 'user', content: 'Add a new column called Qty in thousands linear ft and populate it based on Qty.' }],
          currentPage: { path: '/contractor/quote-comparison', title: 'Quote Comparison' },
          quoteComparison: { snapshot },
        })
        if (edit.status !== 'completed') failures.push(`${filename}: edit status ${edit.status}`)
        if (!edit.proposal?.operations.some((operation) => operation.kind === 'insert-column')) {
          failures.push(`${filename}: edit did not create a proposal column`)
        }

        const query = await core.runTurn({
          requestId: `fixture-query:${filename}`,
          user,
          messages: [{ role: 'user', content: 'Compare the quotes.' }],
          currentPage: { path: '/contractor/quote-comparison', title: 'Quote Comparison' },
          quoteComparison: { snapshot },
        })
        if (query.status !== 'completed') failures.push(`${filename}: query status ${query.status}`)
        if (query.proposal) failures.push(`${filename}: read-only query unexpectedly created a proposal`)
        if (!/summary|ranking/i.test(query.reply)) failures.push(`${filename}: query reply did not look like quote analysis`)
      } catch (error) {
        failures.push(`${filename}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    expect(failures).toEqual([])
  })
})

function mimeTypeForFixture(filename: string) {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (lower.endsWith('.xls') || lower.endsWith('.xsl')) return 'application/vnd.ms-excel'
  if (lower.endsWith('.csv')) return 'text/csv'
  if (lower.endsWith('.tsv')) return 'text/tab-separated-values'
  if (lower.endsWith('.xml')) return 'application/xml'
  if (lower.endsWith('.html') || lower.endsWith('.weird')) return 'text/html'
  return 'text/plain'
}

const quoteImportFixtureExtensionPattern = /\.(?:csv|tsv|txt|txtx|xlsx|xls|xsl|pdf|xml|yaml|yml|weird)$/i

function importedComparisonSnapshot(rfq: ContractorRFQ, bids: ContractorBid[]) {
  const columns = [
    { key: 'item', label: 'Item' },
    { key: 'description', label: 'Description' },
    { key: 'qty', label: 'Qty' },
    { key: 'unit', label: 'Unit' },
    ...bids.flatMap((bid) => {
      const vendorId = idPartForSnapshot(bid.vendor_name)
      return [
        { key: `${vendorId}-price`, label: `${bid.vendor_name} Price`, vendorId, vendorName: bid.vendor_name, metric: 'price' },
        { key: `${vendorId}-lead`, label: `${bid.vendor_name} Lead Time`, vendorId, vendorName: bid.vendor_name, metric: 'lead' },
      ]
    }),
    { key: 'notes', label: 'Notes' },
  ]
  const rows = rfq.line_items.map((line) => {
    const values: Record<string, unknown> = {
      item: line.sku || line.id,
      description: line.description,
      qty: `${line.quantity} ${line.unit}`,
      unit: line.unit,
      notes: line.notes ?? '',
    }
    for (const bid of bids) {
      const vendorId = idPartForSnapshot(bid.vendor_name)
      const response = bid.line_item_responses.find((candidate) => candidate.line_item_id === line.id)
      values[`${vendorId}-price`] = response?.total_price ?? ''
      values[`${vendorId}-lead`] = response?.lead_time_days ? `${response.lead_time_days} days` : ''
    }
    return { id: line.id, description: line.description, values }
  })
  return {
    columns,
    rows,
    vendors: bids.map((bid) => ({ id: idPartForSnapshot(bid.vendor_name), name: bid.vendor_name })),
  }
}

function idPartForSnapshot(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'vendor'
}
