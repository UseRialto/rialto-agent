import { describe, expect, it } from 'vitest'
import { comparisonExportFormFields } from './comparison-export-client'

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
})
