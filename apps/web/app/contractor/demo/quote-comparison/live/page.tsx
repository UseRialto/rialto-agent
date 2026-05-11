import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { saveBidsForRFQ, saveProject, saveRFQ } from '@/lib/store/contractor-store'
import type { ContractorBid, ContractorProject, ContractorRFQ } from '@/lib/types/contractor'

const projectId = 'proj-s001'
const rfqId = 'rfq-po-handoff-demo'

const lineItems: ContractorRFQ['line_items'] = [
  {
    id: 'li-po-demo-steel',
    sku: 'W14x82',
    description: 'W14x82 wide flange beams ASTM A992 Grade 50',
    quantity: 42,
    unit: 'tons',
    specs: 'ASTM A992, Grade 50, shop-primed, mill certs required.',
    notes: 'Coordinate first drop with podium steel sequence.',
    contractor_budget: 2700,
    suggested_lead_time_days: 21,
  },
  {
    id: 'li-po-demo-concrete',
    sku: 'CONC-4000',
    description: 'Ready-mix concrete 4000 PSI pump mix',
    quantity: 85,
    unit: 'cy',
    specs: 'ASTM C94, 4-inch slump, pumpable mix design.',
    notes: 'Saturday pour window preferred.',
    contractor_budget: 190,
    suggested_lead_time_days: 7,
  },
  {
    id: 'li-po-demo-tile',
    sku: 'TILE-12X24',
    description: 'Porcelain floor tile 12x24 slip resistant',
    quantity: 3200,
    unit: 'sf',
    specs: 'DCOF wet >= 0.42, matching trim pieces required.',
    contractor_budget: 8,
    suggested_lead_time_days: 14,
  },
  {
    id: 'li-po-demo-roofing',
    sku: 'TPO-60',
    description: 'TPO roofing membrane 60mil white',
    quantity: 18500,
    unit: 'sf',
    specs: '60mil white TPO, manufacturer warranty submittal required.',
    contractor_budget: 8,
    suggested_lead_time_days: 18,
  },
]

function response(
  lineItem: ContractorRFQ['line_items'][number],
  unitPrice: number,
  leadTimeDays: number,
  quotedQuantity = lineItem.quantity,
  availability: ContractorBid['line_item_responses'][number]['availability'] = 'in_stock',
  extra?: Partial<ContractorBid['line_item_responses'][number]>,
): ContractorBid['line_item_responses'][number] {
  return {
    line_item_id: lineItem.id,
    sku: lineItem.sku,
    description: lineItem.description,
    quantity: lineItem.quantity,
    quoted_quantity: quotedQuantity,
    unit: lineItem.unit,
    unit_price: unitPrice,
    total_price: unitPrice * quotedQuantity,
    lead_time_days: leadTimeDays,
    availability,
    units_available: quotedQuantity,
    ...extra,
  }
}

function total(responses: ContractorBid['line_item_responses']) {
  return responses.reduce((sum, item) => sum + item.total_price, 0)
}

const vendorAbcResponses = [
  response(lineItems[0], 2700, 60, 50, 'can_source', { delivery_terms: 'Two truckload drops, excludes off-hours unloading.' }),
  response(lineItems[1], 180, 8, 80, 'in_stock', { delivery_terms: 'Pump dispatch included during normal hours.' }),
  response(lineItems[2], 7.5, 22, 3100, 'can_source', { substitution_notes: 'Matching bullnose trim not included.' }),
  response(lineItems[3], 0, 0, 0, 'unavailable', { notes: 'Roofing membrane excluded from this quote.' }),
]

const pacificResponses = [
  response(lineItems[0], 2800, 7, 42, 'in_stock', { delivery_terms: 'Available for immediate site delivery.' }),
  response(lineItems[1], 230, 5, 90, 'can_source', { delivery_terms: 'Weekend pour requires 72-hour notice.' }),
  response(lineItems[2], 9, 14, 3200, 'in_stock', { notes: 'Includes tile and setting materials.' }),
  response(lineItems[3], 9, 16, 20000, 'can_source', { delivery_terms: 'Manufacturer warranty packet included.' }),
]

const consolidatedResponses = [
  response(lineItems[0], 2500, 45, 45, 'can_source', { delivery_terms: 'Delivered to laydown yard only.' }),
  response(lineItems[1], 183, 6, 190, 'in_stock', { delivery_terms: 'Includes QC batch tickets.' }),
  response(lineItems[2], 8, 12, 3115, 'can_source', { substitution_notes: 'Alternate shade lot may be required.' }),
  response(lineItems[3], 9, 15, 20000, 'in_stock', { notes: 'White membrane in stock.' }),
]

const demoRFQ: ContractorRFQ = {
  id: rfqId,
  project_id: projectId,
  title: 'PO Handoff Test - Quote Comparison',
  request_type: 'rfq',
  email_subject: 'RFQ: PO Handoff Test - Quote Comparison',
  email_body: 'Please provide pricing and lead time for the attached package.',
  status: 'active',
  category: 'Mixed Materials',
  anonymous_public_listing: true,
  rfp_details: {
    scope_summary: 'Mixed materials package for testing quote comparison and PO handoff.',
    exclusions: 'Installation labor, hoisting, after-hours delivery premiums unless explicitly noted.',
    delivery_window: 'Coordinate with project superintendent before release.',
    submittals_required: 'Product data, mill certs, warranty docs, and delivery tickets.',
  },
  line_items: lineItems,
  invites: [
    { vendor_id: 'vendor-abc', vendor_email: 'quotes@vendorabc.example', vendor_name: 'Vendor ABC LLC', on_platform: true },
    { vendor_id: 'pacific-steel', vendor_email: 'quotes@pacificsteel.example', vendor_name: 'Pacific Steel Supply', on_platform: true },
    { vendor_id: 'consolidated', vendor_email: 'quotes@consolidated.example', vendor_name: 'Consolidated Materials Inc.', on_platform: true },
  ],
  invited_vendor_ids: ['vendor-abc', 'pacific-steel', 'consolidated'],
  invited_vendor_emails: [],
  visibility: 'public',
  bid_deadline: '2026-05-15',
  created_at: '2026-05-04T20:00:00.000Z',
  published_at: '2026-05-04T20:05:00.000Z',
}

const demoProject: ContractorProject = {
  id: projectId,
  name: 'Riverton Commons Office Park',
  owner_id: 'demo-user',
  location: 'Austin, TX',
  description: 'Demo project for quote comparison and purchase order handoff testing.',
  budget: 2500000,
  collaborator_ids: [],
  rfq_categories: ['Mixed Materials', 'Concrete', 'Steel'],
  created_at: '2026-02-25T18:00:00.000Z',
  status: 'active',
}

const demoBids: ContractorBid[] = [
  {
    id: 'bid-po-demo-vendor-abc',
    rfq_id: rfqId,
    vendor_id: 'vendor-abc',
    vendor_name: 'Vendor ABC LLC',
    vendor_email: 'quotes@vendorabc.example',
    is_invited: true,
    is_on_platform: true,
    submitted_at: '2026-05-04T21:00:00.000Z',
    total_price: total(vendorAbcResponses),
    currency: 'USD',
    lead_time_days: 60,
    terms: { payment_terms: 'Net 30', shipping_terms: 'Delivered, excludes off-hours unloading' },
    line_item_responses: vendorAbcResponses,
    buyer_decision_status: 'alternate',
    decision_rationale: 'Strong concrete and tile pricing, but excludes roofing.',
    status: 'pending',
    source: 'platform',
    fulfillment_summary: { requested_quantity: 21827, quoted_quantity: 3230, coverage_ratio: 0.71, partial: true },
  },
  {
    id: 'bid-po-demo-pacific',
    rfq_id: rfqId,
    vendor_id: 'pacific-steel',
    vendor_name: 'Pacific Steel Supply',
    vendor_email: 'quotes@pacificsteel.example',
    is_invited: true,
    is_on_platform: true,
    submitted_at: '2026-05-04T21:30:00.000Z',
    total_price: total(pacificResponses),
    currency: 'USD',
    lead_time_days: 16,
    terms: { payment_terms: 'Net 20', shipping_terms: 'FOB destination, jobsite delivery' },
    compliance_declarations: [{ code: 'domestic_materials', label: 'Domestic materials', status: 'verified' }],
    line_item_responses: pacificResponses,
    buyer_decision_status: 'preferred',
    decision_rationale: 'Fastest complete package with clean delivery terms.',
    status: 'pending',
    source: 'platform',
    fulfillment_summary: { requested_quantity: 21827, quoted_quantity: 23332, coverage_ratio: 1, partial: false },
  },
  {
    id: 'bid-po-demo-consolidated',
    rfq_id: rfqId,
    vendor_id: 'consolidated',
    vendor_name: 'Consolidated Materials Inc.',
    vendor_email: 'quotes@consolidated.example',
    is_invited: true,
    is_on_platform: true,
    submitted_at: '2026-05-04T22:00:00.000Z',
    total_price: total(consolidatedResponses),
    currency: 'USD',
    lead_time_days: 45,
    terms: { payment_terms: '2% 10 Net 30', shipping_terms: 'Delivered to laydown yard' },
    line_item_responses: consolidatedResponses,
    buyer_decision_status: 'hold',
    decision_rationale: 'Lowest steel, but slower schedule.',
    status: 'pending',
    source: 'platform',
    fulfillment_summary: { requested_quantity: 21827, quoted_quantity: 23350, coverage_ratio: 1, partial: false },
  },
]

export default async function LiveQuoteComparisonDemoPage() {
  const session = await getSession()
  await saveProject({
    ...demoProject,
    owner_id: session?.userId ?? demoProject.owner_id,
  })
  await saveRFQ(demoRFQ)
  await saveBidsForRFQ(rfqId, demoBids)

  redirect(`/contractor/projects/${projectId}/rfqs/${rfqId}?section=purchase-order`)
}
