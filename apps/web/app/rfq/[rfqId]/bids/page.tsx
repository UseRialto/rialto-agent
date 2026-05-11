import Link from 'next/link'
import { AppShell } from '@/components/layout/AppShell'
import { getBidsForRFQ } from '@/lib/api/bids'
import { BidComparisonTable } from './_components/BidComparisonTable'

interface Props {
  params: Promise<{ rfqId: string }>
}

export const metadata = {
  title: 'Quote Comparison - Rialto',
}

// Mock RFQ summary for MVP
const MOCK_RFQ = {
  material_name: 'Structural Steel - Wide Flange Beams',
  category: 'steel',
  quantity: 1000,
  unit: 'tons',
  delivery_date: '2026-07-15',
  delivery_location: '1200 Broadway, Denver, CO 80203',
}

export default async function BidsPage({ params }: Props) {
  const { rfqId } = await params
  const bids = await getBidsForRFQ(rfqId)

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-5">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/rfq/new" className="hover:text-gray-700">RFQs</Link>
            <span>›</span>
            <span className="text-gray-900 font-medium">Quote Comparison</span>
          </div>
          <h1 className="mt-1 text-xl font-semibold text-gray-900">Quote Comparison</h1>
        </div>

        {/* RFQ summary card */}
        <div className="mb-5 grid grid-cols-2 gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-4">
          <div>
            <p className="text-xs font-medium text-gray-400">Material</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-900">{MOCK_RFQ.material_name}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400">Quantity</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-900">
              {MOCK_RFQ.quantity.toLocaleString()} {MOCK_RFQ.unit}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400">Delivery By</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-900">{MOCK_RFQ.delivery_date}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400">Project Site</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-900 truncate">
              {MOCK_RFQ.delivery_location}
            </p>
          </div>
        </div>

        {/* Quote count + intelligence link */}
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{bids.length} quotes</span> received
            {bids.some((b) => !b.supplier.is_domestic) && (
              <span className="ml-1 text-gray-400">
                · including {bids.filter((b) => !b.supplier.is_domestic).length} international
              </span>
            )}
          </p>
          <Link
            href={`/intelligence/${MOCK_RFQ.category}?rfqId=${rfqId}`}
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            ⚡ View supply chain intelligence →
          </Link>
        </div>

        {/* Table */}
        <BidComparisonTable bids={bids} rfqId={rfqId} />
      </div>
    </AppShell>
  )
}
