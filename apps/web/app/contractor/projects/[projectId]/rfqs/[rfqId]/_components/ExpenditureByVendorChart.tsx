'use client'

import type { ContractorBid, ContractorRFQLineItem } from '@/lib/types/contractor'

interface Props {
  bids: ContractorBid[]
  lineItems: ContractorRFQLineItem[]
}

export function ExpenditureByVendorChart({ bids, lineItems }: Props) {
  if (bids.length === 0 || lineItems.length === 0) return null

  const maxPrice = Math.max(...bids.map((b) => b.total_price), 1)

  return (
    <div className="mt-5 rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-3">
        <h3 className="text-sm font-semibold text-gray-700">Expenditure Breakdown by Vendor</h3>
        <p className="mt-0.5 text-xs text-gray-400">Unit price per line item and total quote comparison</p>
      </div>

      {/* Tabular breakdown */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-400">
            <tr>
              <th className="px-4 py-2.5 text-left">Item</th>
              {bids.map((bid) => (
                <th key={bid.id} className="px-4 py-2.5 text-right whitespace-nowrap">
                  {bid.vendor_name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lineItems.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-gray-800">{item.description}</div>
                  {item.sku && <div className="mt-0.5 font-mono text-xs text-gray-400">{item.sku}</div>}
                  <div className="mt-0.5 text-xs text-gray-400">Qty: {item.quantity.toLocaleString()} {item.unit}</div>
                </td>
                {bids.map((bid) => {
                  const resp = bid.line_item_responses.find((r) => r.line_item_id === item.id)
                  if (!resp) return <td key={bid.id} className="px-4 py-2.5 text-right text-gray-300">-</td>
                  return (
                    <td key={bid.id} className="px-4 py-2.5 text-right">
                      <div className="font-medium text-gray-900">${resp.unit_price.toLocaleString()}/{item.unit}</div>
                      <div className="mt-0.5 text-xs text-gray-400">${resp.total_price.toLocaleString()} total</div>
                    </td>
                  )
                })}
              </tr>
            ))}
            {/* Total row */}
            <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
              <td className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Total Quote
              </td>
              {bids.map((bid) => (
                <td key={bid.id} className="px-4 py-2.5 text-right text-gray-900">
                  ${bid.total_price.toLocaleString()}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Bar chart */}
      <div className="border-t border-gray-100 px-5 py-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Total Quote Comparison</p>
        <div className="space-y-2.5">
          {[...bids].sort((a, b) => a.total_price - b.total_price).map((bid) => (
            <div key={bid.id} className="flex items-center gap-3">
              <span className="w-36 shrink-0 truncate text-xs text-gray-600">{bid.vendor_name}</span>
              <div className="flex-1 rounded bg-gray-100 overflow-hidden">
                <div
                  className="h-5 rounded bg-blue-500 transition-all duration-500"
                  style={{ width: `${(bid.total_price / maxPrice) * 100}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-xs font-semibold text-gray-900">
                ${bid.total_price.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
