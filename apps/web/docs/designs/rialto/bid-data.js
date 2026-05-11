// Mock data for Rialto Bid Comparison Dashboard
const MOCK_RFQ = {
  id: 'rfq-001',
  title: 'Structural Steel Package — Tower A',
  request_type: 'rfq',
  status: 'active',
  category: 'Structural Steel',
  bid_deadline: 'May 15, 2026',
  created_at: '2026-04-10T09:00:00Z',
  published_at: '2026-04-12T10:00:00Z',
  line_items: [
    { id: 'li-1', sku: 'W8X31-A36', description: 'W8x31 Wide Flange Beam, A36', quantity: 240, unit: 'LF', contractor_budget: 18 },
    { id: 'li-2', sku: 'HSS6X6X0.5', description: 'HSS 6x6x1/2 Square Tube, A500', quantity: 180, unit: 'LF', contractor_budget: 24 },
    { id: 'li-3', sku: 'PL0.5-A36', description: '1/2" Steel Plate, A36', quantity: 420, unit: 'SF', contractor_budget: 9 },
    { id: 'li-4', sku: 'AB0.75X12', description: '3/4" Anchor Bolts x 12", F1554-55', quantity: 96, unit: 'EA', contractor_budget: 14 },
    { id: 'li-5', sku: 'C8X18.75', description: 'C8x18.75 Channel, A36', quantity: 120, unit: 'LF', contractor_budget: 16 },
  ],
};

const MOCK_PROJECT = {
  id: 'proj-001',
  name: 'Westside Mixed-Use Tower',
  location: 'Seattle, WA 98101',
};

const MOCK_BIDS = [
  {
    id: 'bid-001',
    vendor_name: 'Pacific Steel Supply Co.',
    designer_name: 'R. Tanaka',
    total_price: 42800,
    lead_time_days: 14,
    submitted_at: '2026-04-22T14:30:00Z',
    status: 'active',
    source: 'platform',
    is_invited: true,
    is_on_platform: true,
    buyer_decision_status: 'preferred',
    decision_rationale: 'Lowest full-coverage price, certified A36, good past performance.',
    fulfillment_summary: { partial: false, coverage_ratio: 1.0, quoted_quantity: 1056, requested_quantity: 1056 },
    terms: { payment_terms: 'Net 30', deposit_terms: '10% upfront', shipping_terms: 'Delivered jobsite' },
    compliance_declarations: [
      { code: 'dbe', label: 'DBE Certified', status: 'compliant' },
      { code: 'baa', label: 'Buy American', status: 'compliant' },
    ],
    risk_flags: [],
    line_item_responses: [
      { line_item_id: 'li-1', sku: 'W8X31-A36', description: 'W8x31 Wide Flange Beam', unit_price: 15.80, total_price: 3792, lead_time_days: 10, availability: 'in_stock', units_available: 240, quoted_quantity: 240 },
      { line_item_id: 'li-2', sku: 'HSS6X6X0.5', description: 'HSS 6x6x1/2 Square Tube', unit_price: 21.40, total_price: 3852, lead_time_days: 14, availability: 'in_stock', units_available: 180, quoted_quantity: 180 },
      { line_item_id: 'li-3', sku: 'PL0.5-A36', description: '1/2" Steel Plate', unit_price: 7.90, total_price: 3318, lead_time_days: 12, availability: 'can_source', units_available: 420, quoted_quantity: 420 },
      { line_item_id: 'li-4', sku: 'AB0.75X12', description: '3/4" Anchor Bolts', unit_price: 12.20, total_price: 1171.20, lead_time_days: 7, availability: 'in_stock', units_available: 96, quoted_quantity: 96 },
      { line_item_id: 'li-5', sku: 'C8X18.75', description: 'C8x18.75 Channel', unit_price: 13.90, total_price: 1668, lead_time_days: 10, availability: 'in_stock', units_available: 120, quoted_quantity: 120 },
    ],
    negotiation_messages: [],
  },
  {
    id: 'bid-002',
    vendor_name: 'Consolidated Metal Works',
    designer_name: 'J. Patterson',
    total_price: 47350,
    lead_time_days: 10,
    submitted_at: '2026-04-23T09:15:00Z',
    status: 'active',
    source: 'platform',
    is_invited: true,
    is_on_platform: true,
    buyer_decision_status: 'alternate',
    decision_rationale: 'Faster lead time, slightly higher price. Good fallback.',
    fulfillment_summary: { partial: false, coverage_ratio: 1.0, quoted_quantity: 1056, requested_quantity: 1056 },
    terms: { payment_terms: 'Net 45', deposit_terms: 'None', shipping_terms: 'FOB origin' },
    compliance_declarations: [
      { code: 'baa', label: 'Buy American', status: 'compliant' },
    ],
    risk_flags: [
      { code: 'lead-time-risk', label: 'Single-source HSS tube' },
    ],
    line_item_responses: [
      { line_item_id: 'li-1', sku: 'W8X31-A36', description: 'W8x31 Wide Flange Beam', unit_price: 17.20, total_price: 4128, lead_time_days: 8, availability: 'in_stock', units_available: 240, quoted_quantity: 240 },
      { line_item_id: 'li-2', sku: 'HSS6X6X0.5', description: 'HSS 6x6x1/2 Square Tube', unit_price: 24.80, total_price: 4464, lead_time_days: 10, availability: 'in_stock', units_available: 180, quoted_quantity: 180 },
      { line_item_id: 'li-3', sku: 'PL0.5-A36', description: '1/2" Steel Plate', unit_price: 8.60, total_price: 3612, lead_time_days: 9, availability: 'in_stock', units_available: 420, quoted_quantity: 420 },
      { line_item_id: 'li-4', sku: 'AB0.75X12', description: '3/4" Anchor Bolts', unit_price: 13.50, total_price: 1296, lead_time_days: 5, availability: 'in_stock', units_available: 96, quoted_quantity: 96 },
      { line_item_id: 'li-5', sku: 'C8X18.75', description: 'C8x18.75 Channel', unit_price: 15.40, total_price: 1848, lead_time_days: 8, availability: 'in_stock', units_available: 120, quoted_quantity: 120 },
    ],
    negotiation_messages: [
      { id: 'msg-1', author_name: 'Sarah McCarthy', message: 'Can you confirm A36 mill certs ship with the order?', created_at: '2026-04-24T10:00:00Z' },
    ],
  },
  {
    id: 'bid-003',
    vendor_name: 'Northwest Steel Distributors',
    designer_name: null,
    total_price: 39200,
    lead_time_days: 21,
    submitted_at: '2026-04-24T16:45:00Z',
    status: 'active',
    source: 'magic_form',
    is_invited: false,
    is_on_platform: true,
    buyer_decision_status: null,
    decision_rationale: null,
    fulfillment_summary: { partial: true, coverage_ratio: 0.82, quoted_quantity: 866, requested_quantity: 1056 },
    terms: { payment_terms: 'Net 30', deposit_terms: '25% upfront', shipping_terms: 'Delivered jobsite' },
    compliance_declarations: [],
    risk_flags: [
      { code: 'partial', label: 'Partial coverage — missing anchor bolts' },
    ],
    line_item_responses: [
      { line_item_id: 'li-1', sku: 'W8X31-A36', description: 'W8x31 Wide Flange Beam', unit_price: 14.60, total_price: 3504, lead_time_days: 18, availability: 'in_stock', units_available: 240, quoted_quantity: 240 },
      { line_item_id: 'li-2', sku: 'HSS6X6X0.5', description: 'HSS 6x6x1/2 Square Tube', unit_price: 19.80, total_price: 3564, lead_time_days: 21, availability: 'can_source', units_available: 180, quoted_quantity: 180 },
      { line_item_id: 'li-3', sku: 'PL0.5-A36', description: '1/2" Steel Plate', unit_price: 7.20, total_price: 3024, lead_time_days: 16, availability: 'in_stock', units_available: 420, quoted_quantity: 420 },
      { line_item_id: 'li-4', sku: 'AB0.75X12', description: '3/4" Anchor Bolts', unit_price: 0, total_price: 0, lead_time_days: 0, availability: 'unavailable', units_available: 0, quoted_quantity: 0 },
      { line_item_id: 'li-5', sku: 'C8X18.75', description: 'C8x18.75 Channel', unit_price: 12.80, total_price: 1536, lead_time_days: 14, availability: 'in_stock', units_available: 120, quoted_quantity: 120 },
    ],
    negotiation_messages: [],
  },
  {
    id: 'bid-004',
    vendor_name: 'Atlas Iron & Fabrication',
    designer_name: 'M. Reyes',
    total_price: 51600,
    lead_time_days: 8,
    submitted_at: '2026-04-25T11:20:00Z',
    status: 'active',
    source: 'email',
    is_invited: true,
    is_on_platform: false,
    buyer_decision_status: 'hold',
    decision_rationale: 'Premium price but fastest lead time. Keep on hold for schedule-critical scenarios.',
    fulfillment_summary: { partial: false, coverage_ratio: 1.0, quoted_quantity: 1056, requested_quantity: 1056 },
    terms: { payment_terms: 'Net 15', deposit_terms: '30% upfront', shipping_terms: 'Delivered jobsite' },
    compliance_declarations: [],
    risk_flags: [
      { code: 'price', label: 'Above budget threshold' },
    ],
    line_item_responses: [
      { line_item_id: 'li-1', sku: 'W8X31-A36', description: 'W8x31 Wide Flange Beam', unit_price: 19.50, total_price: 4680, lead_time_days: 6, availability: 'in_stock', units_available: 240, quoted_quantity: 240 },
      { line_item_id: 'li-2', sku: 'HSS6X6X0.5', description: 'HSS 6x6x1/2 Square Tube', unit_price: 27.40, total_price: 4932, lead_time_days: 8, availability: 'in_stock', units_available: 180, quoted_quantity: 180 },
      { line_item_id: 'li-3', sku: 'PL0.5-A36', description: '1/2" Steel Plate', unit_price: 9.80, total_price: 4116, lead_time_days: 7, availability: 'in_stock', units_available: 420, quoted_quantity: 420 },
      { line_item_id: 'li-4', sku: 'AB0.75X12', description: '3/4" Anchor Bolts', unit_price: 16.40, total_price: 1574.40, lead_time_days: 4, availability: 'in_stock', units_available: 96, quoted_quantity: 96 },
      { line_item_id: 'li-5', sku: 'C8X18.75', description: 'C8x18.75 Channel', unit_price: 18.10, total_price: 2172, lead_time_days: 6, availability: 'in_stock', units_available: 120, quoted_quantity: 120 },
    ],
    negotiation_messages: [],
  },
];

// Expose globally
window.MOCK_RFQ = MOCK_RFQ;
window.MOCK_PROJECT = MOCK_PROJECT;
window.MOCK_BIDS = MOCK_BIDS;
