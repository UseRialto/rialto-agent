import { describe, expect, it } from 'vitest'
import { needsMoreProductDetail, quotedProductIsSpecific, requestedProductIsSpecific } from './product-specificity'
import type { ContractorRFQLineItem } from '../types/contractor'

const crossTee: ContractorRFQLineItem = {
  id: 'line-cross-tee',
  sku: 'CT-4-15/16-FW',
  description: '4 ft 15/16 in Fire-rated Cross Tee',
  quantity: 500,
  unit: 'ea',
  specs: 'ASTM C635 heavy-duty fire-rated exposed tee grid, 15/16 in face.',
}

describe('product specificity', () => {
  it('requires detailed vendor product identity for specific requested products', () => {
    expect(requestedProductIsSpecific(crossTee)).toBe(true)
    expect(needsMoreProductDetail(crossTee, {
      sku: '',
      description: crossTee.description,
      quoted_product_details: 'cross tee 4 ft',
      availability: 'can_source',
      unit_price: 1.25,
      total_price: 625,
    })).toBe(true)
  })

  it('accepts exact SKU or manufacturer/model-grade detail as specific enough', () => {
    expect(quotedProductIsSpecific(crossTee, {
      sku: 'CT-4-15/16-FW',
      description: crossTee.description,
      quoted_product_details: '',
    })).toBe(true)
    expect(needsMoreProductDetail(crossTee, {
      sku: '',
      description: crossTee.description,
      quoted_product_details: 'USG Donn DXL 4 ft 15/16 in fire-rated cross tee, ASTM C635 heavy duty',
      availability: 'can_source',
      unit_price: 1.25,
      total_price: 625,
    })).toBe(false)
  })
})
