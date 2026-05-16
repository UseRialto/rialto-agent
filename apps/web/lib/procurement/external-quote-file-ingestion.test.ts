import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { createExternalQuoteImport } from './external-quote-import'
import { ingestExternalQuoteFile } from './external-quote-file-ingestion'

const fixturePdf = '/Users/tomasz/Downloads/0001 - 9 - MCRD P-314 - 1.0 - Base Bid.pdf'

const modelNormalizedTable = [
  'Item\tSKU\tDescription\tQty\tUnit\tFallback Supply Unit Price\tFallback Supply Total\tFallback Supply Lead Time\tFallback Supply Notes',
  'A001\t250CH-33\t2 1/2 in 22ga CH Stud 10 ft\t2420\tLF\t1.10\t2662\t14 days\tRecovered by agent',
].join('\n')

describe('External quote file ingestion', () => {
  it('ingests the MCRD base bid PDF into importer-ready text', async () => {
    const ingested = await ingestExternalQuoteFile({
      file: {
        name: '0001 - 9 - MCRD P-314 - 1.0 - Base Bid.pdf',
        type: 'application/pdf',
        buffer: fs.readFileSync(fixturePdf),
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

    expect(ingested.text).toContain('L n W Supply - San Diego')
    expect(imported.bid.vendor_name).toBe('L n W Supply - San Diego')
    expect(imported.rfq.line_items.length).toBeGreaterThan(100)
    expect(imported.bid.line_item_responses).toHaveLength(imported.rfq.line_items.length)
    expect(imported.rfq.line_items[0]).toMatchObject({
      sku: '250CH-33',
      quantity: 2420,
      unit: 'lf',
    })
    expect(imported.bid.total_price).toBeCloseTo(217169.53)
  })

  it('ingests compact multi-supplier PDF matrix text into separate vendor bids', async () => {
    const ingested = await ingestExternalQuoteFile({
      file: {
        name: '18-multi-supplier-pdf-matrix.pdf',
        type: 'application/pdf',
        buffer: fs.readFileSync('/Users/tomasz/Desktop/rialto/data/test_files/18-multi-supplier-pdf-matrix.pdf'),
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

    expect(imported.rfq.line_items).toHaveLength(9)
    expect(imported.bids.map((bid) => bid.vendor_name)).toEqual([
      'L n W Supply - San Diego',
      'Acme Drywall Supply',
      'BuildCo Materials',
    ])
    expect(imported.bids.find((bid) => bid.vendor_name === 'L n W Supply - San Diego')?.line_item_responses).toHaveLength(8)
    expect(imported.bids.find((bid) => bid.vendor_name === 'Acme Drywall Supply')?.line_item_responses).toHaveLength(9)
    expect(imported.bids.find((bid) => bid.vendor_name === 'BuildCo Materials')?.line_item_responses.find((line) => line.sku === '250JR-33')?.notes)
      .toContain('alternate manufac')
  })

  it('falls back to the smart import agent when supported PDF text extraction fails', async () => {
    const ingested = await ingestExternalQuoteFile({
      file: {
        name: 'broken-runtime.pdf',
        type: 'application/pdf',
        buffer: Buffer.from('%PDF-1.6 fake bytes', 'utf8'),
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
      mode: 'agent-fallback',
      fallbackReason: 'Object.defineProperty called on non-object',
      model: 'gpt-5.5',
    })
    expect(ingested.warnings.map((warning) => warning.message)).toEqual(expect.arrayContaining([
      expect.stringContaining('deterministic extraction failed'),
      'Recovered PDF through smart import agent.',
    ]))
    expect(imported.bids[0].vendor_name).toBe('Fallback Supply')
    expect(imported.rfq.line_items).toHaveLength(1)
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
})
