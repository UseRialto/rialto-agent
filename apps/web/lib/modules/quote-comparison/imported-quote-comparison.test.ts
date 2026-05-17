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

  it('imports non-spreadsheet files after smart-agent normalization instead of exposing deterministic parser failures', async () => {
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
          sourceKind: 'spreadsheet',
          text: [
            'Supplier,Item,SKU,Description,Qty,Unit,Unit Price,Total Price,Lead Time,Notes',
            'Acme,1,GWB-58,5/8 Type X Gypsum Board,100,sheet,18,1800,3 days,',
          ].join('\n'),
          warnings: [{ message: 'agent normalized pdf and verified source rows' }],
          diagnostics: {
            mode: 'agent-forced',
            fallbackReason: 'Non-CSV/Excel quote file normalized through GPT-5.5 before deterministic import.',
          },
        }
      },
    })

    expect(calls).toEqual([{ forceAgent: undefined }])
    expect(result.imported.bids[0].vendor_name).toBe('Acme')
    expect(result.diagnostics.usedAgentFallback).toBe(true)
    expect(result.diagnostics.fallbackReasons).toEqual(['vendor.pdf: Non-CSV/Excel quote file normalized through GPT-5.5 before deterministic import.'])
    expect(result.warnings.map((warning) => warning.message)).toContain('agent normalized pdf and verified source rows')
  })
})
