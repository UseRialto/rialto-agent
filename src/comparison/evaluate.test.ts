import { describe, expect, it } from 'vitest'
import { evaluateQuoteComparison } from './evaluate.js'
import { sampleComparison } from '../demo/sample-comparison.js'

describe('evaluateQuoteComparison', () => {
  it('does not crown partial totals as lowest complete comparable quote', () => {
    const result = evaluateQuoteComparison(sampleComparison)
    expect(result.lowestCompleteComparableQuote?.vendorName).toBe('Acme Supply')
    expect(result.lowerPartialTotals.map((vendor) => vendor.vendorName)).toContain('BuildPro Materials')
  })

  it('keeps selected package totals separate from vendor quote totals', () => {
    const result = evaluateQuoteComparison(sampleComparison)
    expect(result.selectedPackageTotal.label).toBe('selected-priced-total')
    expect(result.selectedPackageTotal.caveats).toContain('Door closers: decision deferred.')
  })

  it('preserves quantity mismatch caveats after estimator resolution', () => {
    const result = evaluateQuoteComparison(sampleComparison)
    const buildPro = result.vendors.find((vendor) => vendor.vendorName === 'BuildPro Materials')
    const northstar = result.vendors.find((vendor) => vendor.vendorName === 'Northstar Hardware')
    expect(buildPro?.caveats.some((caveat) => caveat.includes('normalized up'))).toBe(true)
    expect(northstar?.caveats.some((caveat) => caveat.includes('accepted vendor quantity'))).toBe(true)
  })
})

