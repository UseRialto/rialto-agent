import type {
  LineSelection,
  QuoteComparisonEvaluation,
  QuoteComparisonInput,
  RequestedLineItem,
  VendorLineQuote,
  VendorQuote,
  VendorQuoteEvaluation,
} from './model.js'

function lineTotal(line: VendorLineQuote, requested: RequestedLineItem) {
  if (typeof line.total === 'number' && Number.isFinite(line.total)) return line.total
  if (typeof line.unitPrice !== 'number' || !Number.isFinite(line.unitPrice)) return undefined
  if (line.quantityResolution === 'normalized-to-requested') return line.unitPrice * requested.requestedQuantity
  return line.unitPrice * (line.quotedQuantity ?? requested.requestedQuantity)
}

function hasQuantityMismatch(line: VendorLineQuote, requested: RequestedLineItem) {
  const quotedQuantity = line.quotedQuantity ?? requested.requestedQuantity
  const quotedUnit = line.quotedUnit ?? requested.requestedUnit
  return quotedQuantity !== requested.requestedQuantity || quotedUnit !== requested.requestedUnit
}

function evaluateVendorQuote(vendor: VendorQuote, requiredLines: RequestedLineItem[]): VendorQuoteEvaluation {
  let total = 0
  const missingLineItemIds: string[] = []
  const quantityMismatchLineItemIds: string[] = []
  const caveats: string[] = []

  for (const requested of requiredLines) {
    const quoteLine = vendor.lines.find((line) => line.lineItemId === requested.id)
    if (!quoteLine || quoteLine.noBid) {
      missingLineItemIds.push(requested.id)
      continue
    }

    const mismatch = hasQuantityMismatch(quoteLine, requested)
    if (mismatch && (!quoteLine.quantityResolution || quoteLine.quantityResolution === 'unresolved')) {
      quantityMismatchLineItemIds.push(requested.id)
      continue
    }

    const value = lineTotal(quoteLine, requested)
    if (typeof value !== 'number') {
      missingLineItemIds.push(requested.id)
      continue
    }
    total += value

    if (mismatch && quoteLine.quantityResolution === 'normalized-to-requested') {
      const quotedQuantity = quoteLine.quotedQuantity ?? requested.requestedQuantity
      if (quotedQuantity < requested.requestedQuantity) caveats.push(`${requested.description}: normalized up; availability may need confirmation.`)
      if (quotedQuantity > requested.requestedQuantity) caveats.push(`${requested.description}: normalized down; minimum order/package size may need confirmation.`)
    }
    if (mismatch && quoteLine.quantityResolution === 'accepted-vendor-quantity') {
      caveats.push(`${requested.description}: accepted vendor quantity/unit differs from request.`)
    }
    if (quoteLine.alternateScopeAccepted) {
      caveats.push(`${requested.description}: selected value uses accepted alternate scope.`)
    }
  }

  const partial = missingLineItemIds.length > 0 || quantityMismatchLineItemIds.length > 0
  return {
    vendorId: vendor.vendorId,
    vendorName: vendor.vendorName,
    completeComparable: !partial,
    partial,
    total,
    missingLineItemIds,
    quantityMismatchLineItemIds,
    caveats,
  }
}

function selectedPackageTotal(input: QuoteComparisonInput, requiredLines: RequestedLineItem[]) {
  const selectionsByLine = new Map(input.selections.map((selection) => [selection.lineItemId, selection]))
  let total = 0
  const caveats: string[] = []

  for (const line of input.lines) {
    const selection = selectionsByLine.get(line.id)
    if (line.scope === 'out-of-scope' || selection?.state === 'out-of-scope') continue
    if (!selection) {
      caveats.push(`${line.description}: no line-level selection.`)
      continue
    }
    if (selection.state === 'deferred') {
      caveats.push(`${line.description}: decision deferred.`)
      continue
    }
    if (selection.state === 'no-award') {
      caveats.push(`${line.description}: no award.`)
      continue
    }
    const vendor = input.vendorQuotes.find((quote) => quote.vendorId === selection.vendorId)
    const quoteLine = vendor?.lines.find((candidate) => candidate.lineItemId === line.id)
    if (!vendor || !quoteLine || quoteLine.noBid) {
      caveats.push(`${line.description}: selected vendor has no usable price.`)
      continue
    }
    const value = lineTotal(quoteLine, line)
    if (typeof value === 'number') total += value
    else caveats.push(`${line.description}: selected vendor price is missing.`)
  }

  const unresolvedRequired = requiredLines.some((line) => !selectionsByLine.has(line.id))
  const hasUnpricedDecision = input.selections.some((selection) => selection.state === 'deferred' || selection.state === 'no-award')
  return {
    label: hasUnpricedDecision ? 'selected-priced-total' as const : 'selected-package-total' as const,
    total,
    resolved: !unresolvedRequired,
    caveats,
  }
}

export function evaluateQuoteComparison(input: QuoteComparisonInput): QuoteComparisonEvaluation {
  const requiredLines = input.lines.filter((line) => line.scope !== 'out-of-scope')
  const vendors = input.vendorQuotes.map((vendor) => evaluateVendorQuote(vendor, requiredLines))
  const complete = vendors.filter((vendor) => vendor.completeComparable)
  const lowestCompleteComparableQuote = complete.sort((a, b) => a.total - b.total)[0]
  const lowerPartialTotals = lowestCompleteComparableQuote
    ? vendors.filter((vendor) => vendor.partial && vendor.total < lowestCompleteComparableQuote.total)
    : []

  return {
    vendors,
    lowestCompleteComparableQuote,
    lowerPartialTotals,
    selectedPackageTotal: selectedPackageTotal(input, requiredLines),
  }
}

