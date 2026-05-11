import type { Bid } from '@/lib/types/bid'
import mockBids from '@/lib/fixtures/bids-mock.json'

// MVP: returns mock bids regardless of rfqId.
// Phase 2: replace with fetch(`/api/rfqs/${rfqId}/bids`)
export async function getBidsForRFQ(_rfqId: string): Promise<Bid[]> {
  return mockBids.bids as Bid[]
}

// MVP: mock award action - returns the bid with updated status.
// Phase 2: replace with fetch(`/api/bids/${bidId}/award`, { method: 'POST' })
export async function awardBid(bidId: string): Promise<Bid> {
  const bid = mockBids.bids.find((b) => b.id === bidId)
  if (!bid) throw new Error(`Bid ${bidId} not found`)
  return { ...bid, status: 'awarded' } as Bid
}
