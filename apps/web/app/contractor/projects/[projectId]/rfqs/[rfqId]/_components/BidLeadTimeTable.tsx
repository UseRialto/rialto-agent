import type { ContractorBid, ContractorRFQ } from '@/lib/types/contractor'

export function BidLeadTimeTable({ bids, rfq }: { bids: ContractorBid[]; rfq: ContractorRFQ }) {
  const sorted = [...bids].sort((a, b) => a.lead_time_days - b.lead_time_days)

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-3">
        <h3 className="text-sm font-semibold text-gray-700">Vendor Comparison Summary</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-400">
            <tr>
              <th className="px-4 py-2.5 text-left">Vendor</th>
              <th className="px-4 py-2.5 text-center">Type</th>
              <th className="px-4 py-2.5 text-right">Lead Time</th>
              <th className="px-4 py-2.5 text-center">In Stock</th>
              <th className="px-4 py-2.5 text-center">Can Source</th>
              <th className="px-4 py-2.5 text-center">Unavailable</th>
              <th className="px-4 py-2.5 text-right">Total Price</th>
              <th className="px-4 py-2.5 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((bid) => {
              const inStock    = bid.line_item_responses.filter((r) => r.availability === 'in_stock').length
              const canSource  = bid.line_item_responses.filter((r) => r.availability === 'can_source').length
              const unavailable = bid.line_item_responses.filter((r) => r.availability === 'unavailable').length

              // Units risk: any line item where vendor has fewer units than required
              const hasUnitsRisk = bid.line_item_responses.some((r) => {
                if (r.availability !== 'in_stock') return false
                if (r.units_available === undefined) return false
                const rfqItem = rfq.line_items.find((li) => li.id === r.line_item_id)
                return rfqItem ? r.units_available < rfqItem.quantity : false
              })

              return (
                <tr key={bid.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <div className="flex items-center gap-1.5">
                      {bid.is_on_platform && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                          Live
                        </span>
                      )}
                      {bid.vendor_name}
                      {hasUnitsRisk && (
                        <span
                          className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700"
                          title="Insufficient units on one or more items"
                        >
                          ⚠ Units
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      bid.source === 'email' ? 'bg-gray-100 text-gray-600'
                      : bid.source === 'magic_form' ? 'bg-emerald-100 text-emerald-700'
                      : bid.is_invited ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-500'
                    }`}>
                      {bid.source === 'email' ? 'Email' : bid.source === 'magic_form' ? 'Magic Form' : bid.is_invited ? 'Invited' : 'Marketplace'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{bid.lead_time_days} days</td>
                  <td className="px-4 py-3 text-center">
                    {inStock > 0 ? (
                      <span className="rounded bg-green-50 px-1.5 py-0.5 text-xs font-medium text-green-700">{inStock}</span>
                    ) : (
                      <span className="text-xs text-gray-300">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {canSource > 0 ? (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">{canSource}</span>
                    ) : (
                      <span className="text-xs text-gray-300">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {unavailable > 0 ? (
                      <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-600">{unavailable}</span>
                    ) : (
                      <span className="text-xs text-gray-300">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    ${bid.total_price.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      bid.status === 'awarded'     ? 'bg-green-100 text-green-700'
                      : bid.status === 'under_review' ? 'bg-amber-100 text-amber-800'
                      : bid.status === 'shortlisted' ? 'bg-purple-100 text-purple-700'
                      : bid.status === 'rejected'    ? 'bg-red-100 text-red-700'
                      : 'bg-gray-100 text-gray-500'
                    }`}>
                      {bid.status.charAt(0).toUpperCase() + bid.status.slice(1)}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
