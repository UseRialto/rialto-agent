import { describe, expect, it } from 'vitest'
import { createExternalQuoteImport } from './external-quote-import'
import { normalizeUnsupportedExternalQuoteFileWithAgent } from './external-quote-agent-extraction'

const modelNormalizedTable = [
  'Item\tSKU\tDescription\tQty\tUnit\tDelta Supply Unit Price\tDelta Supply Total\tDelta Supply Lead Time\tDelta Supply Notes\tOmega Materials Unit Price\tOmega Materials Total\tOmega Materials Lead Time\tOmega Materials Notes',
  'A001\tTRACK-20\t20ga track 10 ft\t125\tLF\t2.4\t300\t10 days\tXML source\t2.55\t318.75\t14 days\t',
  'A002\tSTUD-33\t3 5/8 in stud 12 ft\t80\tEA\t11.25\t900\t10 days\t\t10.95\t876\t14 days\talternate manufacturer note',
].join('\n')

describe('Unsupported external quote file agent extraction', () => {
  it('normalizes unsupported file text through the GPT-5.5 import agent path so the regular quote importer can create a comparison', async () => {
    const calls: Array<{ model: string; filename: string; sourceText: string }> = []
    const normalized = await normalizeUnsupportedExternalQuoteFileWithAgent({
      filename: 'delta-quote.xml',
      mimeType: 'application/xml',
      buffer: Buffer.from('<quote><vendor>Delta Supply</vendor><line sku="TRACK-20" /></quote>', 'utf8'),
      runModel: async (input) => {
        calls.push(input)
        return {
          title: 'Delta XML quote',
          normalizedText: modelNormalizedTable,
          verificationSummary: 'Checked 2 item rows and 4 vendor price cells against the XML source text.',
          warnings: ['Normalized from unsupported XML.'],
        }
      },
    })

    const imported = createExternalQuoteImport({
      projectId: 'project-1',
      projectName: 'Mike Bugs',
      filename: 'delta-quote.xml',
      sourceKind: 'spreadsheet',
      text: normalized.text,
      now: '2026-05-15T12:00:00.000Z',
    })

    expect(calls).toEqual([expect.objectContaining({
      model: 'gpt-5.5',
      filename: 'delta-quote.xml',
      sourceText: expect.stringContaining('<quote>'),
    })])
    expect(normalized.warnings).toContain('Normalized from unsupported XML.')
    expect(imported.rfq.line_items).toHaveLength(2)
    expect(imported.bids.map((bid) => bid.vendor_name)).toEqual(['Delta Supply', 'Omega Materials'])
    expect(imported.bids.flatMap((bid) => bid.line_item_responses).some((line) => line.is_alternate)).toBe(false)
    expect(imported.bids.find((bid) => bid.vendor_name === 'Omega Materials')?.line_item_responses[1].notes)
      .toContain('alternate manufacturer note')
  })
})
