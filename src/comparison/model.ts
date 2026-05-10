export interface RequestedLineItem {
  id: string
  description: string
  requestedQuantity: number
  requestedUnit: string
  scope: 'in-scope' | 'out-of-scope'
}

export interface VendorLineQuote {
  lineItemId: string
  vendorId: string
  unitPrice?: number
  total?: number
  quotedQuantity?: number
  quotedUnit?: string
  noBid?: 'explicit' | 'missing' | 'cannot-supply'
  alternateScopeAccepted?: boolean
  quantityResolution?: 'unresolved' | 'normalized-to-requested' | 'accepted-vendor-quantity'
}

export interface VendorQuote {
  vendorId: string
  vendorName: string
  lines: VendorLineQuote[]
}

export interface LineSelection {
  lineItemId: string
  state: 'selected-vendor' | 'no-award' | 'deferred' | 'out-of-scope'
  vendorId?: string
}

export interface QuoteComparisonInput {
  lines: RequestedLineItem[]
  vendorQuotes: VendorQuote[]
  selections: LineSelection[]
}

export interface VendorQuoteEvaluation {
  vendorId: string
  vendorName: string
  completeComparable: boolean
  partial: boolean
  total: number
  missingLineItemIds: string[]
  quantityMismatchLineItemIds: string[]
  caveats: string[]
}

export interface QuoteComparisonEvaluation {
  vendors: VendorQuoteEvaluation[]
  lowestCompleteComparableQuote?: VendorQuoteEvaluation
  lowerPartialTotals: VendorQuoteEvaluation[]
  selectedPackageTotal: {
    label: 'selected-package-total' | 'selected-priced-total'
    total: number
    resolved: boolean
    caveats: string[]
  }
}

