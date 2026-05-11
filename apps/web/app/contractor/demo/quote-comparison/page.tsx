import Link from 'next/link'
import { BidDashboard } from '@/app/contractor/projects/[projectId]/rfqs/[rfqId]/_components/BidDashboard'
import type { ContractorBid, ContractorRFQ } from '@/lib/types/contractor'

const demoRFQ: ContractorRFQ = {
  id: 'rfq-demo-quote-comparison',
  project_id: 'proj-s001',
  title: 'South Tower Podium Package - Metals And Concrete Demo',
  request_type: 'rfq',
  status: 'active',
  category: 'Structural Steel',
  anonymous_public_listing: true,
  attachment_urls: [],
  line_items: [
    {
      id: 'li-demo-1',
      sku: 'STEEL-W14X82',
      description: 'W14x82 wide flange beams',
      quantity: 42,
      unit: 'tons',
      specs: 'ASTM A992',
      constraints: 'Shop primed',
      notes: 'Release in two drops',
      contractor_budget: 2900,
      suggested_lead_time_days: 21,
    },
    {
      id: 'li-demo-2',
      sku: 'CONC-4000-01',
      description: 'Ready-mix concrete 4000 PSI',
      quantity: 120,
      unit: 'cy',
      specs: 'ASTM C94',
      constraints: 'Pump placement on elevated deck',
      notes: 'Saturday pour window',
      contractor_budget: 185,
      suggested_lead_time_days: 7,
    },
    {
      id: 'li-demo-3',
      sku: 'DRAIN-CI-12',
      description: 'Cast iron roof drain assemblies',
      quantity: 12,
      unit: 'ea',
      specs: 'Cast iron body, flashing clamp, dome strainer',
      constraints: 'Coordinate outlet size with plumbing drawings',
      notes: 'Include hardware kits',
      contractor_budget: 425,
      suggested_lead_time_days: 14,
    },
  ],
  invites: [],
  invited_vendor_ids: [],
  invited_vendor_emails: [],
  visibility: 'public',
  bid_deadline: '2026-05-15',
  created_at: '2026-04-29T18:00:00.000Z',
}

const demoBids: ContractorBid[] = [
  {
    id: 'bid-demo-1',
    rfq_id: demoRFQ.id,
    vendor_name: 'Pacific Steel Supply',
    vendor_email: 'david@pacificsteel.com',
    is_invited: true,
    is_on_platform: true,
    submitted_at: '2026-04-29T18:30:00.000Z',
    total_price: 146290,
    currency: 'USD',
    lead_time_days: 19,
    terms: {
      payment_terms: 'Net 30',
      deposit_terms: '0% down',
      credit_terms: 'Open account',
      shipping_terms: 'Delivered',
    },
    line_item_responses: [
      {
        line_item_id: 'li-demo-1',
        sku: 'STEEL-W14X82',
        description: 'W14x82 wide flange beams',
        quantity: 42,
        quoted_quantity: 42,
        unit: 'tons',
        unit_price: 2550,
        total_price: 107100,
        lead_time_days: 19,
        availability: 'in_stock',
        delivery_terms: 'Delivered to site',
      },
      {
        line_item_id: 'li-demo-2',
        sku: 'CONC-4000-01',
        description: 'Ready-mix concrete 4000 PSI',
        quantity: 120,
        quoted_quantity: 120,
        unit: 'cy',
        unit_price: 284.58,
        total_price: 34149.6,
        lead_time_days: 4,
        availability: 'can_source',
        delivery_terms: 'Pump coordinated by supplier',
      },
      {
        line_item_id: 'li-demo-3',
        sku: 'DRAIN-CI-12',
        description: 'Cast iron roof drain assemblies',
        quantity: 12,
        quoted_quantity: 12,
        unit: 'ea',
        unit_price: 420,
        total_price: 5040,
        lead_time_days: 12,
        availability: 'in_stock',
        delivery_terms: 'Includes clamp, dome, and hardware kits',
      },
    ],
    compliance_declarations: [
      { code: 'made_in_usa', label: 'Made in USA', status: 'verified' },
    ],
    buyer_decision_status: 'preferred',
    decision_rationale: 'Best combined price and lead time for full coverage.',
    status: 'pending',
    source: 'platform',
    fulfillment_summary: {
      requested_quantity: 174,
      quoted_quantity: 174,
      coverage_ratio: 1,
      partial: false,
    },
  },
  {
    id: 'bid-demo-2',
    rfq_id: demoRFQ.id,
    vendor_name: 'Consolidated Materials',
    vendor_email: 'anna@consolidated.com',
    is_invited: true,
    is_on_platform: true,
    submitted_at: '2026-04-29T19:10:00.000Z',
    total_price: 153740,
    currency: 'USD',
    lead_time_days: 16,
    terms: {
      payment_terms: 'Net 20',
      deposit_terms: '50% down / 50% on delivery',
      credit_terms: 'Credit app required',
      shipping_terms: 'FOB Destination',
    },
    line_item_responses: [
      {
        line_item_id: 'li-demo-1',
        sku: 'STEEL-W14X82',
        description: 'W14x82 wide flange beams',
        quantity: 42,
        quoted_quantity: 42,
        unit: 'tons',
        unit_price: 2620,
        total_price: 110040,
        lead_time_days: 16,
        availability: 'can_source',
        delivery_terms: 'Delivered',
      },
      {
        line_item_id: 'li-demo-2',
        sku: 'CONC-4000-01',
        description: 'Ready-mix concrete 4000 PSI',
        quantity: 120,
        quoted_quantity: 90,
        unit: 'cy',
        unit_price: 432.89,
        total_price: 38960.1,
        lead_time_days: 5,
        availability: 'can_source',
        delivery_terms: 'Weekend pours require separate dispatch notice',
        substitution_notes: 'Can supply alternate mix sequencing for the balance.',
      },
      {
        line_item_id: 'li-demo-3',
        sku: 'DRAIN-CI-12',
        description: 'Cast iron roof drain assemblies',
        quantity: 12,
        quoted_quantity: 12,
        unit: 'ea',
        unit_price: 395,
        total_price: 4740,
        lead_time_days: 16,
        availability: 'can_source',
        delivery_terms: 'Outlet size to be confirmed before release',
      },
    ],
    buyer_decision_status: 'alternate',
    decision_rationale: 'Good backup option but partial concrete coverage.',
    status: 'pending',
    source: 'platform',
    fulfillment_summary: {
      requested_quantity: 174,
      quoted_quantity: 144,
      coverage_ratio: 0.83,
      partial: true,
    },
    risk_flags: [
      { code: 'partial_coverage', label: 'Partial coverage', severity: 'medium' },
    ],
  },
]

export default function DemoQuoteComparisonPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Contractor Demo</p>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">Quote Comparison Demo</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            This page uses fixture data so you can critique the current comparison, decision support, and preferred-award experience without waiting on live vendor quotes.
          </p>
        </div>
        <Link
          href="/contractor/projects/proj-s001"
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Back to Project
        </Link>
        <Link
          href="/contractor/demo/quote-comparison/live"
          className="rounded-md bg-[#fa6b04] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#e65f00]"
        >
          Open live PO test
        </Link>
        <Link
          href="/contractor/demo/quote-comparison/fresh"
          className="rounded-md border border-[#fa6b04] bg-white px-4 py-2 text-sm font-semibold text-[#fa6b04] shadow-sm hover:bg-[#fff3eb]"
        >
          Create fresh PO test
        </Link>
      </div>

      <BidDashboard projectId="proj-s001" projectName="Riverton Commons Office Park" rfq={demoRFQ} bids={demoBids} demoMode />
    </div>
  )
}
