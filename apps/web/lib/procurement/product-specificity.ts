import type { ContractorBidLineItemResponse, ContractorRFQLineItem } from '../types/contractor'

const PRODUCT_IDENTITY_KEYS = [
  'manufacturer',
  'brand',
  'model',
  'part',
  'sku',
  'product',
  'catalog',
]

function normalized(value: string | undefined) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function requestedProductIsSpecific(requested: ContractorRFQLineItem) {
  if (requested.sku.trim()) return true
  if (requested.specs?.trim() || requested.certifications?.length) return true
  return (requested.attributes ?? []).some((attribute) => {
    if (!attribute.value?.trim()) return false
    const identityText = `${attribute.key} ${attribute.label}`.toLowerCase()
    return PRODUCT_IDENTITY_KEYS.some((key) => identityText.includes(key))
  })
}

export function quotedProductIsSpecific(requested: ContractorRFQLineItem, line: Pick<ContractorBidLineItemResponse, 'sku' | 'description' | 'quoted_product_details'>) {
  const requestedSku = normalized(requested.sku)
  const quotedSku = normalized(line.sku)
  if (requestedSku && quotedSku === requestedSku) return true

  const detail = [
    line.sku,
    line.quoted_product_details,
    line.description !== requested.description ? line.description : '',
  ].filter(Boolean).join(' ').trim()
  if (!detail) return false
  if (requestedSku && normalized(detail).includes(requestedSku)) return true

  const words = detail.split(/\s+/).filter(Boolean)
  const hasCatalogLikeIdentifier = /\b[A-Z]{2,}[-/0-9A-Z]{2,}\b/.test(detail)
  const namesMaterialStandard = /\b(?:astm|ansi|ul|fm|csa|heavy[- ]?duty|fire[- ]?rated|type\s*x|15\/16|9\/16)\b/i.test(detail)
  return words.length >= 6 && (hasCatalogLikeIdentifier || namesMaterialStandard)
}

export function needsMoreProductDetail(requested: ContractorRFQLineItem, line: Pick<ContractorBidLineItemResponse, 'sku' | 'description' | 'quoted_product_details' | 'availability' | 'unit_price' | 'total_price'>) {
  return line.availability !== 'unavailable' &&
    (line.unit_price > 0 || line.total_price > 0) &&
    requestedProductIsSpecific(requested) &&
    !quotedProductIsSpecific(requested, line)
}
