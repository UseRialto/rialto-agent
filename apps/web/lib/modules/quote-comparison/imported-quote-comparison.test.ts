import { describe, expect, it } from 'vitest'
import { buildImportedQuoteComparison } from './imported-quote-comparison'

describe('imported quote comparison', () => {
  it('builds a quote comparison import from uploaded quote files', async () => {
    const result = await buildImportedQuoteComparison({
      projectId: 'project-1',
      projectName: 'Riverton',
      title: 'Drywall quotes',
      files: [{
        name: 'quotes.csv',
        type: 'text/csv',
        buffer: Buffer.from('unused by fake ingestion'),
      }],
      ingestFile: async () => ({
        filename: 'quotes.csv',
        sourceKind: 'spreadsheet',
        text: [
          'Supplier,Item,SKU,Description,Qty,Unit,Unit Price,Total Price,Lead Time,Notes',
          'Acme,1,GWB-58,5/8 Type X Gypsum Board,100,sheet,18,1800,3 days,',
          'BuildCo,1,GWB-58,5/8 Type X Gypsum Board,100,sheet,26,2600,3 days,',
        ].join('\n'),
        warnings: [],
        diagnostics: { mode: 'normal' },
      }),
    })

    expect(result.imported.rfq.line_items).toHaveLength(1)
    expect(result.imported.bids.map((bid) => bid.vendor_name)).toEqual(['Acme', 'BuildCo'])
    expect(result.analyticsHighlights).toEqual(expect.arrayContaining([
      expect.objectContaining({
        selector: expect.objectContaining({ rowKey: result.imported.rfq.line_items[0].id }),
        note: expect.stringContaining('major vendor price difference'),
      }),
    ]))
  })

  it('retries failed PDF parsing through the smart agent path inside the module', async () => {
    const calls: Array<{ forceAgent?: boolean }> = []
    const result = await buildImportedQuoteComparison({
      projectId: 'project-1',
      projectName: 'Riverton',
      files: [{
        name: 'vendor.pdf',
        type: 'application/pdf',
        buffer: Buffer.from('unused by fake ingestion'),
      }],
      ingestFile: async (input) => {
        calls.push({ forceAgent: input.forceAgent })
        return {
          filename: 'vendor.pdf',
          sourceKind: input.forceAgent ? 'spreadsheet' : 'pdf',
          text: input.forceAgent
            ? [
                'Supplier,Item,SKU,Description,Qty,Unit,Unit Price,Total Price,Lead Time,Notes',
                'Acme,1,GWB-58,5/8 Type X Gypsum Board,100,sheet,18,1800,3 days,',
              ].join('\n')
            : 'not a priced quote',
          warnings: input.forceAgent ? [{ message: 'agent normalized pdf' }] : [],
          diagnostics: { mode: input.forceAgent ? 'agent-forced' : 'normal' },
        }
      },
    })

    expect(calls).toEqual([{ forceAgent: undefined }, { forceAgent: true }])
    expect(result.imported.bids[0].vendor_name).toBe('Acme')
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining('retried with the smart import agent') }),
      expect.objectContaining({ message: 'agent normalized pdf' }),
    ]))
  })
})
