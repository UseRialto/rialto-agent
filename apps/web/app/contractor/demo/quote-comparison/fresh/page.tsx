import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { saveBidsForRFQ, saveProject, saveRFQ } from '@/lib/store/contractor-store'
import type { ContractorBid, ContractorProject, ContractorRFQ } from '@/lib/types/contractor'

const projectId = 'proj-s001'

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

export default async function FreshQuoteComparisonDemoPage() {
  const session = await getSession()
  const suffix = Date.now().toString(36)
  const rfqId = `rfq-po-handoff-fresh-${suffix}`
  const createdAt = new Date().toISOString()

  const lineItems: ContractorRFQ['line_items'] = [
    {
      id: `li-${suffix}-rebar`,
      sku: 'REBAR-G60',
      description: 'Grade 60 reinforcing steel, mixed bars',
      quantity: 118,
      unit: 'tons',
      specs: 'ASTM A615 Grade 60, bundled by pour sequence, certs required.',
      notes: 'Prioritize footings and mat slab releases.',
      contractor_budget: 1040,
      suggested_lead_time_days: 12,
    },
    {
      id: `li-${suffix}-forms`,
      sku: 'FORM-PLY-34',
      description: '3/4 inch form plywood and associated forming lumber',
      quantity: 6200,
      unit: 'sf',
      specs: 'B-B Plyform Class I or approved equivalent.',
      notes: 'Include edge protection material where available.',
      contractor_budget: 2.85,
      suggested_lead_time_days: 8,
    },
    {
      id: `li-${suffix}-vapor`,
      sku: 'VAPOR-15MIL',
      description: '15 mil underslab vapor barrier with tape and boots',
      quantity: 41000,
      unit: 'sf',
      specs: 'ASTM E1745 Class A, include seam tape and pipe boots.',
      contractor_budget: 0.42,
      suggested_lead_time_days: 10,
    },
    {
      id: `li-${suffix}-anchors`,
      sku: 'ANCHOR-BOLT',
      description: 'Anchor bolt assemblies with nuts and washers',
      quantity: 960,
      unit: 'ea',
      specs: 'F1554 Grade 55, hot dip galvanized where exposed.',
      notes: 'Package by gridline if possible.',
      contractor_budget: 18,
      suggested_lead_time_days: 18,
    },
  ]

  const northstarResponses = [
    response(lineItems[0], 985, 11, 118, 'in_stock', { delivery_terms: 'Two staged truckloads, first release within 11 days.' }),
    response(lineItems[1], 2.72, 7, 6200, 'in_stock', { delivery_terms: 'Delivered with rebar first drop.' }),
    response(lineItems[2], 0.39, 9, 41000, 'can_source', { notes: 'Includes tape and pipe boots.' }),
    response(lineItems[3], 21, 21, 960, 'can_source', { substitution_notes: 'Galvanized washers require mill confirmation.' }),
  ]

  const metroResponses = [
    response(lineItems[0], 1025, 8, 118, 'in_stock', { delivery_terms: 'Fastest rebar release; jobsite offload by others.' }),
    response(lineItems[1], 2.65, 10, 5000, 'can_source', { notes: 'Partial plywood lot available immediately.' }),
    response(lineItems[2], 0.45, 5, 41000, 'in_stock', { delivery_terms: 'Warehouse stock ready for pickup or delivery.' }),
    response(lineItems[3], 0, 0, 0, 'unavailable', { notes: 'Anchor assemblies excluded.' }),
  ]

  const deltaResponses = [
    response(lineItems[0], 960, 17, 118, 'can_source', { delivery_terms: 'Lowest rebar price, longer mill release.' }),
    response(lineItems[1], 2.9, 6, 6500, 'in_stock', { delivery_terms: 'Includes forming lumber allowance.' }),
    response(lineItems[2], 0.41, 12, 41000, 'can_source', { notes: 'Class A membrane, domestic stock.' }),
    response(lineItems[3], 17.5, 14, 1000, 'in_stock', { delivery_terms: 'Packaged by bolt diameter only.' }),
  ]

  const demoProject: ContractorProject = {
    id: projectId,
    name: 'Riverton Commons Office Park',
    owner_id: session?.userId ?? 'demo-user',
    location: 'Austin, TX',
    description: 'Demo project for quote comparison and purchase order handoff testing.',
    budget: 2500000,
    collaborator_ids: [],
    rfq_categories: ['Concrete', 'Steel', 'Mixed Materials'],
    created_at: '2026-02-25T18:00:00.000Z',
    status: 'active',
  }

  const demoRFQ: ContractorRFQ = {
    id: rfqId,
    project_id: projectId,
    title: `Fresh PO Handoff Test ${suffix.toUpperCase()}`,
    request_type: 'rfq',
    email_subject: `RFQ: Fresh PO Handoff Test ${suffix.toUpperCase()}`,
    email_body: 'Please provide pricing, lead time, exclusions, and delivery terms for the attached concrete prep package.',
    status: 'active',
    category: 'Concrete Prep',
    anonymous_public_listing: true,
    rfp_details: {
      scope_summary: 'Concrete prep materials package for testing PO handoff document download and coordinator submission.',
      exclusions: 'Installation labor, equipment rental, hoisting, and after-hours delivery premiums unless explicitly included.',
      delivery_window: 'Coordinate staged releases with the superintendent before PO release.',
      submittals_required: 'Product data, mill certs, warranty docs, delivery tickets, and batch or material traceability records.',
    },
    line_items: lineItems,
    invites: [
      {
        vendor_id: 'northstar-supply',
        vendor_email: 'maya@northstar.example',
        vendor_name: 'Northstar Supply Co.',
        vendor_first_name: 'Maya',
        vendor_last_name: 'Ortiz',
        on_platform: true,
      },
      {
        vendor_id: 'metro-foundation',
        vendor_email: 'eli@metrofoundation.example',
        vendor_name: 'Metro Foundation Materials',
        vendor_first_name: 'Eli',
        vendor_last_name: 'Kaplan',
        on_platform: true,
      },
      {
        vendor_id: 'delta-builders',
        vendor_email: 'priya@deltabuilders.example',
        vendor_name: 'Delta Builders Supply',
        vendor_first_name: 'Priya',
        vendor_last_name: 'Shah',
        on_platform: true,
      },
    ],
    invited_vendor_ids: ['northstar-supply', 'metro-foundation', 'delta-builders'],
    invited_vendor_emails: [],
    visibility: 'public',
    bid_deadline: '2026-05-22',
    created_at: createdAt,
    published_at: createdAt,
  }

  const demoBids: ContractorBid[] = [
    {
      id: `bid-${suffix}-northstar`,
      rfq_id: rfqId,
      vendor_id: 'northstar-supply',
      vendor_name: 'Northstar Supply Co.',
      vendor_email: 'maya@northstar.example',
      designer_name: 'Maya Ortiz',
      is_invited: true,
      is_on_platform: true,
      submitted_at: createdAt,
      total_price: total(northstarResponses),
      currency: 'USD',
      lead_time_days: 21,
      terms: { payment_terms: 'Net 30', shipping_terms: 'Delivered to jobsite, unloading by others' },
      line_item_responses: northstarResponses,
      buyer_decision_status: 'preferred',
      decision_rationale: 'Cleanest complete package with strong vapor barrier terms.',
      status: 'pending',
      source: 'platform',
      fulfillment_summary: { requested_quantity: 48278, quoted_quantity: 48278, coverage_ratio: 1, partial: false },
    },
    {
      id: `bid-${suffix}-metro`,
      rfq_id: rfqId,
      vendor_id: 'metro-foundation',
      vendor_name: 'Metro Foundation Materials',
      vendor_email: 'eli@metrofoundation.example',
      designer_name: 'Eli Kaplan',
      is_invited: true,
      is_on_platform: true,
      submitted_at: createdAt,
      total_price: total(metroResponses),
      currency: 'USD',
      lead_time_days: 10,
      terms: { payment_terms: 'Net 20', shipping_terms: 'FOB destination for stocked materials' },
      line_item_responses: metroResponses,
      buyer_decision_status: 'alternate',
      decision_rationale: 'Fast schedule, but excludes anchor assemblies and has partial plywood coverage.',
      status: 'pending',
      source: 'platform',
      fulfillment_summary: { requested_quantity: 48278, quoted_quantity: 46236, coverage_ratio: 0.89, partial: true },
    },
    {
      id: `bid-${suffix}-delta`,
      rfq_id: rfqId,
      vendor_id: 'delta-builders',
      vendor_name: 'Delta Builders Supply',
      vendor_email: 'priya@deltabuilders.example',
      designer_name: 'Priya Shah',
      is_invited: true,
      is_on_platform: true,
      submitted_at: createdAt,
      total_price: total(deltaResponses),
      currency: 'USD',
      lead_time_days: 17,
      terms: { payment_terms: '2% 10 Net 30', shipping_terms: 'Delivered to laydown yard' },
      line_item_responses: deltaResponses,
      buyer_decision_status: 'hold',
      decision_rationale: 'Lowest complete material cost, slower rebar release.',
      status: 'pending',
      source: 'platform',
      fulfillment_summary: { requested_quantity: 48278, quoted_quantity: 48618, coverage_ratio: 1, partial: false },
    },
  ]

  await saveProject(demoProject)
  await saveRFQ(demoRFQ)
  await saveBidsForRFQ(rfqId, demoBids)

  redirect(`/contractor/projects/${projectId}/rfqs/${rfqId}?section=purchase-order`)
}
