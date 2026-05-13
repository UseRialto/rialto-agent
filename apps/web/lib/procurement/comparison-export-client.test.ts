import { describe, expect, it } from 'vitest'
import { comparisonExportFilenameFromDisposition, comparisonExportFormFields } from './comparison-export-client'

describe('comparisonExportFormFields', () => {
  it('serializes the live comparison sheet rows for export', () => {
    const fields = comparisonExportFormFields({
      format: 'xlsx',
      title: 'Door Hardware Quote Comparison',
      rows: [
        ['Item', 'Qty', 'Acme Total'],
        ['Door hardware', '2 ea', '$500'],
      ],
    })

    expect(fields).toEqual({
      format: 'xlsx',
      title: 'Door Hardware Quote Comparison',
      rows: JSON.stringify([
        ['Item', 'Qty', 'Acme Total'],
        ['Door hardware', '2 ea', '$500'],
      ]),
    })
  })

  it('reads the server filename from the content disposition header', () => {
    expect(comparisonExportFilenameFromDisposition('attachment; filename="Riverton.xlsx"', 'fallback.xlsx')).toBe('Riverton.xlsx')
    expect(comparisonExportFilenameFromDisposition("attachment; filename*=UTF-8''Riverton%20Commons.xlsx", 'fallback.xlsx')).toBe('Riverton Commons.xlsx')
    expect(comparisonExportFilenameFromDisposition(null, 'fallback.xlsx')).toBe('fallback.xlsx')
  })
})
