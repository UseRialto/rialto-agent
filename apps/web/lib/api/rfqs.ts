import type { CreateRFQRequest, RFQ } from '@/lib/types/rfq'

// MVP: returns a mock RFQ. Phase 2: POST to /api/rfqs
export async function createRFQ(data: CreateRFQRequest): Promise<RFQ> {
  return {
    ...data,
    id: 'mock-rfq-123',
    status: 'open',
    posted_by: 'demo@insiteai.com',
    created_at: new Date().toISOString(),
    bid_count: 0,
  }
}
