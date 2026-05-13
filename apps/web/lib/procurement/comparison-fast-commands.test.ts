import { describe, expect, it } from 'vitest'
import { comparisonFastCommandPatch } from './comparison-fast-commands'

const schema = {
  columns: [
    { key: '__item', label: 'Item' },
    { key: '__description', label: 'Description' },
    { key: 'vendor:lnw:lead', label: 'L n W Supply Lead Time', metric: 'lead' },
    { key: 'vendor:lnw:alternate', label: 'L n W Supply Alt', metric: 'alternate' },
    { key: 'vendor:acme:lead', label: 'Acme Lead Time', metric: 'lead' },
    { key: 'vendor:acme:alternate', label: 'Acme Alt', metric: 'alternate' },
    { key: 'vendor:buildco:lead', label: 'BuildCo Lead Time', metric: 'lead' },
  ],
  lineItems: [
    {
      id: 'line-fast-114',
      description: '1 1/4 drywall screws',
      values: {
        'vendor:lnw:lead': '14d',
        'vendor:acme:lead': '23d',
        'vendor:buildco:lead': '',
      },
    },
    {
      id: 'line-lock-set',
      description: 'Classroom lockset',
      values: {
        'vendor:lnw:lead': '2 weeks',
        'vendor:acme:lead': '5 days',
        'vendor:buildco:lead': '8 days',
      },
    },
  ],
}

describe('comparisonFastCommandPatch', () => {
  it('sets every visible alternate cell without calling the product agent runtime', () => {
    const patch = comparisonFastCommandPatch('make all alt cells 99', schema)

    expect(patch).toMatchObject({
      summary: 'Set 4 alternate cells to 99.',
      setCells: [
        { rowKey: 'line-fast-114', colKey: 'vendor:lnw:alternate', value: '99' },
        { rowKey: 'line-fast-114', colKey: 'vendor:acme:alternate', value: '99' },
        { rowKey: 'line-lock-set', colKey: 'vendor:lnw:alternate', value: '99' },
        { rowKey: 'line-lock-set', colKey: 'vendor:acme:alternate', value: '99' },
      ],
      agentProposal: { kind: 'fast-comparison-command' },
    })
  })

  it('highlights the lowest lead time for a requested line item', () => {
    const patch = comparisonFastCommandPatch('highlight the lowest lead time for 1 1/4 drywall screws', schema)

    expect(patch).toMatchObject({
      summary: 'Highlighted the lowest lead time for 1 1/4 drywall screws.',
      addHighlights: [{
        selector: { kind: 'cell', rowKey: 'line-fast-114', colKey: 'vendor:lnw:lead' },
        color: '#bae6fd',
      }],
    })
  })

  it('understands weeks and days when comparing lead time values', () => {
    const patch = comparisonFastCommandPatch('highlight the fastest lead time for classroom lockset', schema)

    expect(patch?.addHighlights).toEqual([expect.objectContaining({
      selector: { kind: 'cell', rowKey: 'line-lock-set', colKey: 'vendor:acme:lead' },
    })])
  })
})
