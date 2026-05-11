import { AppShell } from '@/components/layout/AppShell'
import { getSession } from '@/lib/auth/session'
import { getSubmittedBids } from '@/lib/api/vendor'
import { BidsByProject } from './_components/BidsByProject'

export const metadata = {
  title: 'My Quotes - Rialto Vendor',
}

export default async function VendorBidsPage() {
  const session = await getSession()
  const vendorId = session?.userId ?? ''

  const bids = await getSubmittedBids(vendorId)

  const shortlisted = bids.filter((b) => b.status === 'shortlisted').length
  const pending = bids.filter((b) => b.status === 'pending' || b.status === 'under_review').length

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-6">
          <h1
            className="text-xl font-semibold"
            style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}
          >
            My Quotes
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: '#4a6358' }}>
            Track the status of your submitted quotes across all projects.
          </p>
        </div>

        {/* Stats */}
        <div className="mb-5 grid grid-cols-3 gap-4">
          <div
            className="rounded-xl p-4 shadow-sm"
            style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}
          >
            <p className="text-xs font-medium" style={{ color: '#8a9e96' }}>Total Quotes Submitted</p>
            <p className="mt-1 text-2xl font-bold" style={{ color: '#1e3a2f' }}>{bids.length}</p>
          </div>
          <div
            className="rounded-xl p-4 shadow-sm"
            style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}
          >
            <p className="text-xs font-medium" style={{ color: '#8a9e96' }}>Awaiting Response</p>
            <p className="mt-1 text-2xl font-bold" style={{ color: '#fa6b04' }}>{pending}</p>
          </div>
          <div
            className="rounded-xl p-4 shadow-sm"
            style={{ background: '#e8f4ee', border: '1px solid #a8d5ba' }}
          >
            <p className="text-xs font-medium" style={{ color: '#2d6a4f' }}>Shortlisted</p>
            <p className="mt-1 text-2xl font-bold" style={{ color: '#2d6a4f' }}>{shortlisted}</p>
          </div>
        </div>

        <BidsByProject bids={bids} />
      </div>
    </AppShell>
  )
}
