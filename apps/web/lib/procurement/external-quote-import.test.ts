import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { createExternalQuoteImport, createExternalQuoteImportFromFiles } from './external-quote-import'
import { extractExternalQuoteImportText } from './external-quote-file-text'
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

const repeatedSupplierBlocksText = `
Item,SKU,Description,Qty,Unit,Active,Supplier,Unit Price,Total,Variation,Active,Supplier,Unit Price,Total,Variation,Active,Supplier,Unit Price,Total,Variation,Active,Supplier,Unit Price,Total,Variation
A001,250CH-33,2 1/2 in 22ga CH Stud 10 ft,2420,LF,TRUE,Foundation - San Diego,320.000,774400,+0%,TRUE,L n W Supply - San Diego,350.000,847000,+9%,TRUE,Action Gypsum Supply,310.000,750200,-3%,TRUE,J n B Materials - Perris,315.000,762300,-2%
A002,250JR-33,2 1/2 in 20ga J Track 12 ft,458,LF,TRUE,Foundation - San Diego,92.000,42136,+0%,TRUE,L n W Supply - San Diego,63.750,29198,-31%,TRUE,Action Gypsum Supply,,0,-100%,TRUE,J n B Materials - Perris,75.950,34785,-17%
A003,250JS-33,2 1/2 in 20ga Jamb Strut 10 ft,1094,LF,TRUE,Foundation - San Diego,205.000,224270,+0%,TRUE,L n W Supply - San Diego,230.000,251620,+12%,TRUE,Action Gypsum Supply,195.000,213330,-5%,TRUE,J n B Materials - Perris,193.000,211142,-6%
`

const generatedFixtureDir = path.resolve(process.cwd(), 'data/test_files')
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

describe('External Quote Import', () => {
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
      quantity: 2420,
      unit: 'lf',
      unit_price: 1100,
      total_price: 2662,
    })
    expect(result.bid.line_item_responses[3]).toMatchObject({
      sku: '362S125-30',
      quantity: 606,
      total_price: 330.27,
    })
    expect(result.warnings).toContainEqual(expect.objectContaining({
      message: expect.stringContaining('single vendor'),
    }))
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
      .filter((filename) => /\.(?:csv|tsv|txt|xlsx|pdf)$/i.test(filename))
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
      .filter((filename) => /\.(?:csv|tsv|txt|xlsx|pdf)$/i.test(filename))
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
  if (lower.endsWith('.csv')) return 'text/csv'
  if (lower.endsWith('.tsv')) return 'text/tab-separated-values'
  return 'text/plain'
}

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
