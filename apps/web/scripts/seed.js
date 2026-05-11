/**
 * Seed script - populates Neon Postgres database with realistic dummy data.
 * Run: node scripts/seed.js  (or pnpm seed)
 *
 * Requires DATABASE_URL in apps/insiteai-web/.env.local
 * Inserts in FK dependency order. Idempotent - safe to run multiple times.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') })
const { neon } = require('@neondatabase/serverless')
const bcryptjs = require('bcryptjs')

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set. Add it to apps/insiteai-web/.env.local')
  process.exit(1)
}

const sql = neon(process.env.DATABASE_URL)

console.log('Seeding Rialto database...')

const OFF_PLATFORM_VENDOR_NAMES = {
  'sales@nucor-dist.com': 'Nucor Steel Distribution',
  'bids@nucor.com': 'Nucor Rebar Distribution',
  'precon@kone.com': 'KONE Preconstruction',
  'bids@schindler.com': 'Schindler Estimating',
  'sales@calportland.com': 'CalPortland',
  'quotes@martinmarietta.com': 'Martin Marietta',
  'quotes@westernhvac.com': 'Western HVAC Supply',
  'healthcare@johnsoncontrols.com': 'Johnson Controls Healthcare Team',
  'estimating@seattlesteel.com': 'Seattle Steel Estimating',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function upsertUser(user) {
  await sql`
    INSERT INTO users (id, email, password_hash, name, role, company_info, onboarding_completed, created_at)
    VALUES (${user.id}, ${user.email}, ${user.password_hash}, ${user.name}, ${user.role},
            ${JSON.stringify(user.company_info || null)}, ${user.onboarding_completed}, ${user.created_at})
    ON CONFLICT(id) DO UPDATE SET
      email = EXCLUDED.email,
      name = EXCLUDED.name,
      company_info = EXCLUDED.company_info,
      onboarding_completed = EXCLUDED.onboarding_completed
  `
}

async function upsertProject(p) {
  await sql`
    INSERT INTO projects (id, owner_id, name, location, description, budget, status, collaborator_ids, rfq_categories, created_at)
    VALUES (${p.id}, ${p.owner_id}, ${p.name}, ${p.location}, ${p.description || null}, ${p.budget || null},
            ${p.status || 'active'}, ${JSON.stringify(p.collaborator_ids || [])},
            ${JSON.stringify(p.rfq_categories || [])}, ${p.created_at})
    ON CONFLICT(id) DO UPDATE SET
      name = EXCLUDED.name, location = EXCLUDED.location, description = EXCLUDED.description,
      budget = EXCLUDED.budget, status = EXCLUDED.status
  `
}

async function upsertRFQ(rfq) {
  await sql`
    INSERT INTO rfqs (id, project_id, title, category, status, visibility, bid_deadline, created_at, published_at,
      pending_bid_id, pending_vendor_id, pending_vendor_email, pending_offered_at)
    VALUES (${rfq.id}, ${rfq.project_id}, ${rfq.title}, ${rfq.category || null}, ${rfq.status || 'draft'},
            ${rfq.visibility || 'public'}, ${rfq.bid_deadline || null}, ${rfq.created_at},
            ${rfq.published_at || null}, ${null}, ${null}, ${null}, ${null})
    ON CONFLICT(id) DO UPDATE SET
      title = EXCLUDED.title, status = EXCLUDED.status, visibility = EXCLUDED.visibility,
      bid_deadline = EXCLUDED.bid_deadline, published_at = EXCLUDED.published_at
  `

  // Line items - replace
  await sql`DELETE FROM rfq_line_items WHERE rfq_id = ${rfq.id}`
  for (const [idx, li] of (rfq.line_items || []).entries()) {
    await sql`
      INSERT INTO rfq_line_items (id, rfq_id, sku, description, quantity, unit, specs, certifications, notes,
        contractor_budget, suggested_lead_time_days, sort_order)
      VALUES (${li.id}, ${rfq.id}, ${li.sku || null}, ${li.description}, ${li.quantity}, ${li.unit},
              ${li.specs || null}, ${li.certifications ? JSON.stringify(li.certifications) : null},
              ${li.notes || null}, ${li.contractor_budget || null}, ${li.suggested_lead_time_days || null}, ${idx})
    `
  }

  // Invites - replace
  await sql`DELETE FROM rfq_invites WHERE rfq_id = ${rfq.id}`
  for (const invite of (rfq.invites || [])) {
    await sql`
      INSERT INTO rfq_invites (
        rfq_id, vendor_id, vendor_email, vendor_name, vendor_first_name, vendor_last_name, on_platform
      )
      VALUES (${rfq.id}, ${invite.vendor_id || null}, ${invite.vendor_email || null},
              ${invite.vendor_name || invite.vendor_email || invite.vendor_id || null},
              ${invite.vendor_first_name || null}, ${invite.vendor_last_name || null},
              ${invite.on_platform || false})
    `
  }
  for (const vid of (rfq.invited_vendor_ids || [])) {
    const known = {
      'vendor-001': { email: 'david@pacificsteel.com', name: 'Pacific Steel Supply', first: 'David', last: 'Park' },
      'vendor-002': { email: 'anna@consolidated.com', name: 'Consolidated Materials Inc.', first: 'Anna', last: 'Williams' },
      'demo-vendor': { email: 'vendor@demo.com', name: 'Demo Supply Co.', first: 'Demo', last: 'Vendor' },
    }[vid] || { email: null, name: vid, first: null, last: null }
    await sql`
      INSERT INTO rfq_invites (
        rfq_id, vendor_id, vendor_email, vendor_name, vendor_first_name, vendor_last_name, on_platform
      )
      VALUES (${rfq.id}, ${vid}, ${known.email}, ${known.name}, ${known.first}, ${known.last}, ${true})
    `
  }
  for (const em of (rfq.invited_vendor_emails || [])) {
    const vendorName = OFF_PLATFORM_VENDOR_NAMES[em] || em.split('@')[0]
    await sql`
      INSERT INTO rfq_invites (rfq_id, vendor_id, vendor_email, vendor_name, on_platform)
      VALUES (${rfq.id}, ${null}, ${em}, ${vendorName}, ${false})
    `
  }
}

async function insertNegotiationMessage(row) {
  await sql`
    INSERT INTO negotiation_messages (
      rfq_id, bid_id, vendor_id, vendor_email, author_role, author_name, message, created_at
    )
    VALUES (${row.rfq_id}, ${row.bid_id || null}, ${row.vendor_id || null}, ${row.vendor_email || null},
            ${row.author_role}, ${row.author_name}, ${row.message}, ${row.created_at})
  `
}

async function upsertBid(bid, rfqId) {
  await sql`
    INSERT INTO bids (id, rfq_id, vendor_id, vendor_email, vendor_name, is_invited, is_on_platform,
      submitted_at, total_price, currency, lead_time_days, notes, status, is_draft, po_number, source)
    VALUES (${bid.id}, ${rfqId}, ${bid.vendor_id || null}, ${bid.vendor_email || null}, ${bid.vendor_name},
            ${bid.is_invited || false}, ${bid.is_on_platform || false}, ${bid.submitted_at},
            ${bid.total_price}, ${bid.currency || 'USD'}, ${bid.lead_time_days}, ${bid.notes || null},
            ${bid.status || 'pending'}, ${false}, ${bid.po_number || null}, ${bid.source || 'platform'})
    ON CONFLICT(id) DO UPDATE SET
      status = EXCLUDED.status, total_price = EXCLUDED.total_price, source = EXCLUDED.source
  `

  // Line item responses - replace
  await sql`DELETE FROM bid_line_items WHERE bid_id = ${bid.id}`
  for (const r of (bid.line_item_responses || [])) {
    await sql`
      INSERT INTO bid_line_items (bid_id, line_item_id, sku, description, quantity, unit,
        unit_price, total_price, lead_time_days, availability, units_available, notes)
      VALUES (${bid.id}, ${r.line_item_id}, ${r.sku || null}, ${r.description || null}, ${r.quantity || null},
              ${r.unit || null}, ${r.unit_price}, ${r.total_price}, ${r.lead_time_days},
              ${r.availability}, ${r.units_available || null}, ${r.notes || null})
    `
  }
}

async function upsertOrder(order) {
  await sql`
    INSERT INTO orders (id, rfq_id, bid_id, project_id, vendor_id, vendor_name, po_number,
      agreed_price, delivery_date, delivery_location, awarded_at, current_stage, line_items_snapshot)
    VALUES (${order.id}, ${order.rfq_id}, ${order.bid_id}, ${order.project_id}, ${order.vendor_id || null},
            ${order.vendor_name}, ${order.po_number}, ${order.agreed_price}, ${order.delivery_date || null},
            ${order.delivery_location || null}, ${order.awarded_at}, ${order.current_stage},
            ${JSON.stringify(order.line_items_snapshot || [])})
    ON CONFLICT(id) DO UPDATE SET current_stage = EXCLUDED.current_stage
  `

  await sql`DELETE FROM order_stage_progress WHERE order_id = ${order.id}`
  for (const s of (order.stage_history || [])) {
    await sql`
      INSERT INTO order_stage_progress (order_id, stage, completed_at, notes, carrier, tracking_number, ship_date)
      VALUES (${order.id}, ${s.stage}, ${s.completed_at || null}, ${s.notes || null},
              ${s.carrier || null}, ${s.tracking_number || null}, ${s.ship_date || null})
    `
  }
}

async function upsertVendorRequest(row) {
  await sql`
    INSERT INTO rfq_vendor_requests (
      rfq_id, contractor_user_id, vendor_name, vendor_email, vendor_email_domain, status,
      gmail_thread_id, outbound_message_id, last_message_at, last_message_direction, match_basis,
      notes, created_at, updated_at
    )
    VALUES (${row.rfq_id}, ${row.contractor_user_id}, ${row.vendor_name || ''},
            ${row.vendor_email}, ${row.vendor_email_domain}, ${row.status},
            ${row.gmail_thread_id || ''}, ${row.outbound_message_id || ''},
            ${row.last_message_at || ''}, ${row.last_message_direction || ''},
            ${row.match_basis || ''}, ${row.notes || ''}, ${row.created_at}, ${row.updated_at})
    ON CONFLICT(rfq_id, vendor_email) DO UPDATE SET
      vendor_name = EXCLUDED.vendor_name,
      status = EXCLUDED.status,
      gmail_thread_id = EXCLUDED.gmail_thread_id,
      outbound_message_id = EXCLUDED.outbound_message_id,
      last_message_at = EXCLUDED.last_message_at,
      last_message_direction = EXCLUDED.last_message_direction,
      match_basis = EXCLUDED.match_basis,
      notes = EXCLUDED.notes,
      updated_at = EXCLUDED.updated_at
  `
  const rows = await sql`
    SELECT id FROM rfq_vendor_requests WHERE rfq_id = ${row.rfq_id} AND vendor_email = ${row.vendor_email}
  `
  return rows[0].id
}

async function upsertEmailMessage(row) {
  await sql`
    INSERT INTO rfq_email_messages (
      contractor_user_id, gmail_message_id, gmail_thread_id, internet_message_id, rfq_id,
      vendor_request_id, direction, match_status, match_confidence, match_reason, subject,
      normalized_subject, from_email, from_name, to_json, cc_json, snippet, text_body, html_body,
      sent_at, is_unread, label_json, raw_payload_json, created_at, updated_at
    )
    VALUES (${row.contractor_user_id}, ${row.gmail_message_id}, ${row.gmail_thread_id},
            ${row.internet_message_id || ''}, ${row.rfq_id || null}, ${row.vendor_request_id || null},
            ${row.direction}, ${row.match_status}, ${row.match_confidence}, ${row.match_reason || ''},
            ${row.subject || ''}, ${row.normalized_subject || ''}, ${row.from_email || ''},
            ${row.from_name || ''}, ${JSON.stringify(row.to_json || [])}, ${JSON.stringify(row.cc_json || [])},
            ${row.snippet || ''}, ${row.text_body || ''}, ${row.html_body || ''}, ${row.sent_at},
            ${row.is_unread || false}, ${JSON.stringify(row.label_json || [])},
            ${JSON.stringify(row.raw_payload_json || {})}, ${row.created_at}, ${row.updated_at})
    ON CONFLICT(gmail_message_id) DO UPDATE SET
      vendor_request_id = EXCLUDED.vendor_request_id,
      match_status = EXCLUDED.match_status,
      match_confidence = EXCLUDED.match_confidence,
      match_reason = EXCLUDED.match_reason,
      snippet = EXCLUDED.snippet,
      text_body = EXCLUDED.text_body,
      html_body = EXCLUDED.html_body,
      sent_at = EXCLUDED.sent_at,
      is_unread = EXCLUDED.is_unread,
      label_json = EXCLUDED.label_json,
      raw_payload_json = EXCLUDED.raw_payload_json,
      updated_at = EXCLUDED.updated_at
  `
  const rows = await sql`
    SELECT id FROM rfq_email_messages WHERE gmail_message_id = ${row.gmail_message_id}
  `
  return rows[0].id
}

async function upsertQuoteResponse(row) {
  await sql`
    INSERT INTO rfq_quote_responses (
      rfq_id, vendor_request_id, email_message_id, source_kind, status, confidence,
      currency, lead_time_text, notes, created_at, updated_at
    )
    VALUES (${row.rfq_id}, ${row.vendor_request_id || null}, ${row.email_message_id},
            ${row.source_kind || 'email'}, ${row.status || 'parsed'}, ${row.confidence || 0},
            ${row.currency || 'USD'}, ${row.lead_time_text || ''}, ${row.notes || ''},
            ${row.created_at}, ${row.updated_at})
    ON CONFLICT(email_message_id) DO UPDATE SET
      vendor_request_id = EXCLUDED.vendor_request_id,
      source_kind = EXCLUDED.source_kind,
      status = EXCLUDED.status,
      confidence = EXCLUDED.confidence,
      lead_time_text = EXCLUDED.lead_time_text,
      notes = EXCLUDED.notes,
      updated_at = EXCLUDED.updated_at
  `
  const rows = await sql`
    SELECT id FROM rfq_quote_responses WHERE email_message_id = ${row.email_message_id}
  `
  return rows[0].id
}

async function replaceQuoteLineItems(quoteResponseId, rows) {
  await sql`DELETE FROM rfq_quote_line_items WHERE quote_response_id = ${quoteResponseId}`
  for (const row of rows) {
    await sql`
      INSERT INTO rfq_quote_line_items (
        quote_response_id, rfq_line_item_id, source_name, normalized_name, quantity, unit,
        unit_price, total_price, lead_time_text, notes, confidence, created_at, updated_at
      )
      VALUES (${quoteResponseId}, ${row.rfq_line_item_id || null}, ${row.source_name},
              ${row.normalized_name || row.source_name}, ${row.quantity || ''}, ${row.unit || ''},
              ${row.unit_price || ''}, ${row.total_price || ''}, ${row.lead_time_text || ''},
              ${row.notes || ''}, ${row.confidence || 0}, ${row.created_at}, ${row.updated_at})
    `
  }
}

async function upsertReviewTask(row) {
  const existing = await sql`
    SELECT id FROM rfq_review_tasks
    WHERE task_type = ${row.task_type}
      AND (email_message_id IS NOT DISTINCT FROM ${row.email_message_id || null})
      AND (quote_response_id IS NOT DISTINCT FROM ${row.quote_response_id || null})
    LIMIT 1
  `

  if (existing.length > 0) {
    await sql`
      UPDATE rfq_review_tasks
      SET contractor_user_id = ${row.contractor_user_id},
          rfq_id = ${row.rfq_id || null},
          vendor_request_id = ${row.vendor_request_id || null},
          status = ${row.status || 'open'},
          title = ${row.title},
          details_json = ${JSON.stringify(row.details_json || {})},
          resolution_json = ${JSON.stringify(row.resolution_json || {})},
          updated_at = ${row.updated_at}
      WHERE id = ${existing[0].id}
    `
  } else {
    await sql`
      INSERT INTO rfq_review_tasks (
        contractor_user_id, rfq_id, vendor_request_id, email_message_id, quote_response_id,
        task_type, status, title, details_json, resolution_json, created_at, updated_at
      )
      VALUES (${row.contractor_user_id}, ${row.rfq_id || null}, ${row.vendor_request_id || null},
              ${row.email_message_id || null}, ${row.quote_response_id || null},
              ${row.task_type}, ${row.status || 'open'}, ${row.title},
              ${JSON.stringify(row.details_json || {})}, ${JSON.stringify(row.resolution_json || {})},
              ${row.created_at}, ${row.updated_at})
    `
  }
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const PASSWORD_HASH = bcryptjs.hashSync('password123', 10)

async function main() {
  // --- Users ---
  const usersData = [
    { id: 'contractor-001', email: 'sarah@mccarthy.com', password_hash: PASSWORD_HASH, name: 'Sarah Chen', role: 'contractor', created_at: '2026-01-01T00:00:00Z', onboarding_completed: true, company_info: { company_name: 'McCarthy Building Companies', phone: '415-555-0101', address: 'San Francisco, CA' } },
    { id: 'contractor-002', email: 'mike@turner.com', password_hash: PASSWORD_HASH, name: 'Mike Torres', role: 'contractor', created_at: '2026-01-15T00:00:00Z', onboarding_completed: true, company_info: { company_name: 'Turner Construction Co.', phone: '212-555-0202', address: 'New York, NY' } },
    { id: 'vendor-001', email: 'david@pacificsteel.com', password_hash: PASSWORD_HASH, name: 'David Park', role: 'vendor', created_at: '2026-01-10T00:00:00Z', onboarding_completed: true, company_info: { company_name: 'Pacific Steel Supply', phone: '503-555-0303', address: 'Portland, OR', materials: ['Structural Steel', 'Rebar', 'HSS / Tube Steel', 'Steel Decking'], certifications: ['AISC Certified', 'ISO 9001'], service_regions: ['Pacific Northwest', 'California', 'Mountain West'] } },
    { id: 'vendor-002', email: 'anna@consolidated.com', password_hash: PASSWORD_HASH, name: 'Anna Williams', role: 'vendor', created_at: '2026-01-20T00:00:00Z', onboarding_completed: true, company_info: { company_name: 'Consolidated Materials Inc.', phone: '312-555-0404', address: 'Chicago, IL', materials: ['Concrete', 'Masonry', 'Lumber', 'Roofing'], certifications: ['NRMCA Member', 'FSC Certified'], service_regions: ['Midwest', 'Southeast', 'Texas'] } },
    { id: 'demo-contractor', email: 'contractor@demo.com', password_hash: PASSWORD_HASH, name: 'Demo Contractor', role: 'contractor', created_at: '2026-01-01T00:00:00Z', onboarding_completed: true, company_info: { company_name: 'Demo GC Inc.' } },
    { id: 'demo-vendor', email: 'vendor@demo.com', password_hash: PASSWORD_HASH, name: 'Demo Vendor', role: 'vendor', created_at: '2026-01-01T00:00:00Z', onboarding_completed: true, company_info: { company_name: 'Demo Supply Co.' } },
  ]
  for (const u of usersData) await upsertUser(u)
  console.log('  ✓ users (6)')

  // --- Projects ---
  const projectsData = [
    { id: 'proj-s001', owner_id: 'contractor-001', name: 'Riverton Commons Office Park', location: 'Denver, CO', description: 'Mixed-use office park development featuring three Class-A towers and ground-floor retail along Riverton Boulevard.', budget: 62000000, collaborator_ids: [], rfq_categories: ['Structural Steel', 'Glazing', 'Concrete', 'Rebar'], created_at: '2026-01-15T00:00:00Z', status: 'active' },
    { id: 'proj-s002', owner_id: 'contractor-001', name: 'Summit Ridge Medical Plaza', location: 'Phoenix, AZ', description: 'Outpatient medical office complex comprising two interconnected buildings with surgical suites and specialty care clinics.', budget: 38500000, collaborator_ids: [], rfq_categories: ['MEP', 'Plumbing', 'Cladding', 'Electrical'], created_at: '2026-02-20T00:00:00Z', status: 'active' },
    { id: 'proj-m001', owner_id: 'contractor-002', name: 'Harborview Tower - Phase 2', location: 'Seattle, WA', description: 'High-rise mixed-use development on the Seattle waterfront. Phase 2 covers floors 18–32 plus rooftop terrace.', budget: 94000000, collaborator_ids: [], rfq_categories: ['Structural Steel', 'Glazing', 'MEP', 'Concrete'], created_at: '2026-03-01T00:00:00Z', status: 'active' },
  ]
  for (const p of projectsData) await upsertProject(p)
  console.log('  ✓ projects (3)')

  // --- RFQs ---
  const rfqsData = [
    { id: 'rfq-s001-a', project_id: 'proj-s001', title: 'Structural Steel Package - Tower A', status: 'active', category: 'Structural Steel', visibility: 'public', bid_deadline: '2026-05-15', created_at: '2026-04-10T08:00:00Z', published_at: '2026-04-10T08:30:00Z', invited_vendor_ids: ['vendor-001'], invited_vendor_emails: ['sales@nucor-dist.com'], line_items: [
      { id: 'li-s001a-1', sku: 'W14x82', description: 'W14x82 Wide Flange Beam, Grade 50', quantity: 95, unit: 'tons', specs: 'ASTM A992', contractor_budget: 9800, suggested_lead_time_days: 21 },
      { id: 'li-s001a-2', sku: 'HSS 10x10x1/2', description: 'HSS Square Tube 10x10x1/2"', quantity: 18, unit: 'tons', contractor_budget: 10200, suggested_lead_time_days: 14 },
      { id: 'li-s001a-3', sku: 'W18x97', description: 'W18x97 Wide Flange Beam, ASTM A992', quantity: 45, unit: 'tons', specs: 'ASTM A992', contractor_budget: 9500, suggested_lead_time_days: 21 },
    ]},
    { id: 'rfq-s001-b', project_id: 'proj-s001', title: 'Structural Rebar - Foundations & Core', status: 'active', category: 'Rebar', visibility: 'public', bid_deadline: '2026-05-10', created_at: '2026-04-11T09:00:00Z', published_at: '2026-04-11T09:30:00Z', invited_vendor_ids: [], invited_vendor_emails: ['bids@nucor.com'], line_items: [
      { id: 'li-s001b-1', sku: '#5 Rebar A615', description: '#5 Rebar ASTM A615 Grade 60', quantity: 85, unit: 'tons', specs: 'ASTM A615', contractor_budget: 850, suggested_lead_time_days: 10 },
      { id: 'li-s001b-2', sku: '#8 Rebar A615', description: '#8 Rebar ASTM A615 Grade 60', quantity: 50, unit: 'tons', specs: 'ASTM A615', contractor_budget: 900, suggested_lead_time_days: 10 },
    ]},
    { id: 'rfq-s001-draft', project_id: 'proj-s001', title: 'Elevator Systems - Tower A & B', status: 'draft', category: 'Elevator Systems', visibility: 'public', bid_deadline: '2026-06-01', created_at: '2026-04-14T11:00:00Z', invited_vendor_ids: [], invited_vendor_emails: ['precon@kone.com', 'bids@schindler.com'], line_items: [
      { id: 'li-s001d-1', sku: 'Otis-Gen3Core', description: 'Otis Gen3 Core Machine-Roomless Elevator', quantity: 4, unit: 'each', specs: 'ASME A17.1', contractor_budget: 460000, suggested_lead_time_days: 35 },
    ]},
    { id: 'rfq-s001-aw1', project_id: 'proj-s001', title: 'Foundation Concrete - Phase 1', status: 'awarded', category: 'Concrete', visibility: 'public', bid_deadline: '2026-03-10', created_at: '2026-02-25T08:00:00Z', published_at: '2026-02-25T08:30:00Z', invited_vendor_ids: [], invited_vendor_emails: ['sales@calportland.com', 'quotes@martinmarietta.com'], line_items: [
      { id: 'li-s001w1-1', sku: 'Ready-Mix 4000 PSI', description: 'Ready-Mix Concrete 4000 PSI', quantity: 2400, unit: 'cy', specs: 'ASTM C150' },
    ]},
    { id: 'rfq-s002-a', project_id: 'proj-s002', title: 'Medical-Grade HVAC Systems', status: 'active', category: 'MEP', visibility: 'public', bid_deadline: '2026-05-20', created_at: '2026-04-12T10:00:00Z', published_at: '2026-04-12T10:20:00Z', invited_vendor_ids: [], invited_vendor_emails: ['quotes@westernhvac.com', 'healthcare@johnsoncontrols.com'], line_items: [
      { id: 'li-s002a-1', sku: 'Carrier 50XC-120', description: 'Carrier 10-Ton Rooftop Unit', quantity: 6, unit: 'each', specs: 'ASHRAE 170', contractor_budget: 52000, suggested_lead_time_days: 28 },
      { id: 'li-s002a-2', sku: 'AHU-HEPA-30', description: 'Air Handling Unit 30T w/ HEPA Filtration', quantity: 3, unit: 'each', specs: 'ASHRAE 170', contractor_budget: 78000, suggested_lead_time_days: 35 },
    ]},
    { id: 'rfq-m001-a', project_id: 'proj-m001', title: 'High-Rise Structural Steel - Floors 18–32', status: 'active', category: 'Structural Steel', visibility: 'public', bid_deadline: '2026-05-25', created_at: '2026-04-08T09:00:00Z', published_at: '2026-04-08T09:30:00Z', invited_vendor_ids: ['vendor-001'], invited_vendor_emails: ['estimating@seattlesteel.com'], line_items: [
      { id: 'li-m001a-1', sku: 'W33x130', description: 'W33x130 Wide Flange Beam, ASTM A992', quantity: 120, unit: 'tons', specs: 'ASTM A992', contractor_budget: 10500, suggested_lead_time_days: 28 },
      { id: 'li-m001a-2', sku: 'W36x150', description: 'W36x150 Wide Flange Beam, ASTM A992', quantity: 80, unit: 'tons', specs: 'ASTM A992', contractor_budget: 11000, suggested_lead_time_days: 28 },
      { id: 'li-m001a-3', sku: '3" Composite Deck 18ga', description: '3" Composite Deck 18ga ASTM A653', quantity: 48000, unit: 'sf', specs: 'ASTM A653', contractor_budget: 4, suggested_lead_time_days: 21 },
    ]},
  ]
  for (const rfq of rfqsData) await upsertRFQ(rfq)
  console.log('  ✓ rfqs (6) + line_items + invites')

  // Clean up rfq-s001-b before seeding bids (email demo rows depend on fresh state)
  await sql`
    DELETE FROM bid_line_items
    WHERE bid_id IN (SELECT id FROM bids WHERE rfq_id = ${'rfq-s001-b'})
  `
  await sql`DELETE FROM bids WHERE rfq_id = ${'rfq-s001-b'}`

  // --- Bids ---
  const bidsData = [
    // rfq-s001-a: 2 bids
    { id: 'bid-s001a-v001', rfq_id: 'rfq-s001-a', vendor_id: 'vendor-001', vendor_email: 'david@pacificsteel.com', vendor_name: 'Pacific Steel Supply', is_invited: true, is_on_platform: true, submitted_at: '2026-04-10T14:00:00Z', total_price: 1673500, currency: 'USD', lead_time_days: 21, notes: 'All steel sourced from domestic mills. CWI inspection available on request.', status: 'pending', source: 'platform', line_item_responses: [
      { line_item_id: 'li-s001a-1', sku: 'W14x82', description: 'W14x82 Wide Flange Beam', quantity: 95, unit: 'tons', unit_price: 9700, total_price: 921500, lead_time_days: 21, availability: 'in_stock', units_available: 100 },
      { line_item_id: 'li-s001a-2', sku: 'HSS 10x10x1/2', description: 'HSS Square Tube', quantity: 18, unit: 'tons', unit_price: 10100, total_price: 181800, lead_time_days: 14, availability: 'in_stock', units_available: 20 },
      { line_item_id: 'li-s001a-3', sku: 'W18x97', description: 'W18x97 Wide Flange Beam', quantity: 45, unit: 'tons', unit_price: 9800, total_price: 441000, lead_time_days: 21, availability: 'can_source' },
    ]},
    { id: 'bid-s001a-v002', rfq_id: 'rfq-s001-a', vendor_email: 'sales@nucor-dist.com', vendor_name: 'Nucor Steel Distribution', is_invited: false, is_on_platform: false, submitted_at: '2026-04-11T09:30:00Z', total_price: 1598200, currency: 'USD', lead_time_days: 18, status: 'pending', source: 'email', line_item_responses: [
      { line_item_id: 'li-s001a-1', unit_price: 9250, total_price: 878750, lead_time_days: 18, availability: 'in_stock' },
      { line_item_id: 'li-s001a-2', unit_price: 9900, total_price: 178200, lead_time_days: 18, availability: 'in_stock' },
      { line_item_id: 'li-s001a-3', unit_price: 9580, total_price: 431100, lead_time_days: 14, availability: 'in_stock' },
    ]},
    // rfq-s001-b: 1 email-origin bid
    { id: 'bid-email-vr-demo-s001b', rfq_id: 'rfq-s001-b', vendor_email: 'bids@nucor.com', vendor_name: 'Nucor Rebar Distribution', is_invited: true, is_on_platform: false, submitted_at: '2026-04-12T11:00:00Z', total_price: 121250, currency: 'USD', lead_time_days: 10, status: 'under_review', source: 'email', notes: 'Email-origin quote needs review.', line_item_responses: [
      { line_item_id: 'li-s001b-1', unit_price: 830, total_price: 70550, lead_time_days: 10, availability: 'can_source' },
      { line_item_id: 'li-s001b-2', unit_price: 1014, total_price: 50700, lead_time_days: 10, availability: 'can_source' },
    ]},
    // rfq-s002-a: 1 bid
    { id: 'bid-s002a-ext1', rfq_id: 'rfq-s002-a', vendor_email: 'quotes@westernhvac.com', vendor_name: 'Western HVAC Supply', is_invited: false, is_on_platform: false, submitted_at: '2026-04-13T10:00:00Z', total_price: 546000, currency: 'USD', lead_time_days: 28, status: 'pending', source: 'email', line_item_responses: [
      { line_item_id: 'li-s002a-1', unit_price: 50000, total_price: 300000, lead_time_days: 28, availability: 'can_source' },
      { line_item_id: 'li-s002a-2', unit_price: 82000, total_price: 246000, lead_time_days: 35, availability: 'can_source' },
    ]},
    // rfq-m001-a: 1 bid from vendor-001
    { id: 'bid-m001a-v001', rfq_id: 'rfq-m001-a', vendor_id: 'vendor-001', vendor_email: 'david@pacificsteel.com', vendor_name: 'Pacific Steel Supply', is_invited: true, is_on_platform: true, submitted_at: '2026-04-09T15:00:00Z', total_price: 3108000, currency: 'USD', lead_time_days: 28, notes: 'Can expedite W33/W36 delivery for premium; contact us to discuss.', status: 'pending', source: 'platform', line_item_responses: [
      { line_item_id: 'li-m001a-1', unit_price: 10800, total_price: 1296000, lead_time_days: 28, availability: 'in_stock', units_available: 150 },
      { line_item_id: 'li-m001a-2', unit_price: 11200, total_price: 896000, lead_time_days: 28, availability: 'in_stock', units_available: 90 },
      { line_item_id: 'li-m001a-3', unit_price: 4.5, total_price: 216000, lead_time_days: 21, availability: 'in_stock', units_available: 50000 },
    ]},
    // rfq-s001-aw1: winning bid (awarded)
    { id: 'bid-s001aw1-winner', rfq_id: 'rfq-s001-aw1', vendor_email: 'sales@calportland.com', vendor_name: 'CalPortland', is_invited: false, is_on_platform: false, submitted_at: '2026-03-08T10:00:00Z', total_price: 533400, currency: 'USD', lead_time_days: 7, status: 'awarded', source: 'email', po_number: 'PO-2026-48001', line_item_responses: [
      { line_item_id: 'li-s001w1-1', unit_price: 222.25, total_price: 533400, lead_time_days: 7, availability: 'in_stock' },
    ]},
  ]
  for (const b of bidsData) await upsertBid(b, b.rfq_id)
  console.log('  ✓ bids (6) + bid_line_items')

  // --- Message Center demo threads ---
  const seededRfqIds = rfqsData.map((rfq) => rfq.id)
  await sql`DELETE FROM negotiation_messages WHERE rfq_id = ANY(${seededRfqIds})`
  const messageThreads = [
    {
      rfq_id: 'rfq-s001-a',
      bid_id: 'bid-s001a-v001',
      vendor_id: 'vendor-001',
      vendor_email: 'david@pacificsteel.com',
      vendor_name: 'Pacific Steel Supply',
      messages: [
        ['contractor', 'Sarah Chen', 'David, can you confirm whether the W18x97 tonnage can be held for a May 29 site delivery? We are trying to keep Tower A steel sequencing tight.', '2026-04-10T16:20:00Z'],
        ['vendor', 'Pacific Steel Supply', 'Yes, we can hold the W18x97 allocation through next Friday. Mill certs are available now; trucking would need a 72-hour release.', '2026-04-10T17:05:00Z'],
        ['contractor', 'Sarah Chen', 'Perfect. Please include the 72-hour release note in your final commercial assumptions so our PM does not miss it.', '2026-04-10T17:22:00Z'],
      ],
    },
    {
      rfq_id: 'rfq-s001-a',
      bid_id: 'bid-s001a-v002',
      vendor_email: 'sales@nucor-dist.com',
      vendor_name: 'Nucor Steel Distribution',
      messages: [
        ['contractor', 'Sarah Chen', 'Your price is competitive. Can you break out any freight premium if we split Tower A into two deliveries instead of one bulk drop?', '2026-04-11T10:15:00Z'],
        ['vendor', 'Nucor Steel Distribution', 'Two drops would add about $6,800 in freight. First drop can cover W14s and HSS, second drop can follow with W18s once released.', '2026-04-11T12:40:00Z'],
      ],
    },
    {
      rfq_id: 'rfq-s001-b',
      bid_id: 'bid-email-vr-demo-s001b',
      vendor_email: 'bids@nucor.com',
      vendor_name: 'Nucor Rebar Distribution',
      messages: [
        ['contractor', 'Sarah Chen', 'Can you confirm whether the #8 bars include epoxy coating? The structural notes call it out at the elevator pit only.', '2026-04-12T12:10:00Z'],
        ['vendor', 'Nucor Rebar Distribution', 'Base quote is black bar. We can add epoxy for the elevator pit material only; estimate is plus $4,250 and no schedule impact.', '2026-04-12T13:02:00Z'],
        ['contractor', 'Sarah Chen', 'Thanks. Please keep the base quote as-is and note the epoxy alternate separately.', '2026-04-12T13:18:00Z'],
      ],
    },
    {
      rfq_id: 'rfq-s001-draft',
      vendor_email: 'precon@kone.com',
      vendor_name: 'KONE Preconstruction',
      messages: [
        ['contractor', 'Sarah Chen', 'We are still drafting this package, but can you sanity check whether four MRL cars is enough for the office stack and retail lobby?', '2026-04-14T14:05:00Z'],
        ['vendor', 'KONE Preconstruction', 'Four MRL cars can work if one is service-rated. We would want lobby drawings and expected population before confirming cab speed.', '2026-04-14T15:11:00Z'],
      ],
    },
    {
      rfq_id: 'rfq-s001-draft',
      vendor_email: 'bids@schindler.com',
      vendor_name: 'Schindler Estimating',
      messages: [
        ['contractor', 'Sarah Chen', 'Early heads-up: elevator package is coming next week. Please flag any long-lead controller or door operator constraints you are seeing.', '2026-04-14T14:22:00Z'],
        ['vendor', 'Schindler Estimating', 'Controllers are running 26-30 weeks right now. Door operators are normal lead time if finishes are selected before release.', '2026-04-14T16:44:00Z'],
      ],
    },
    {
      rfq_id: 'rfq-s001-aw1',
      bid_id: 'bid-s001aw1-winner',
      vendor_email: 'sales@calportland.com',
      vendor_name: 'CalPortland',
      messages: [
        ['contractor', 'Sarah Chen', 'Can you confirm the 4000 PSI mix was batched with the approved admixture from submittal 03-31?', '2026-03-13T09:30:00Z'],
        ['vendor', 'CalPortland', 'Confirmed. Same admixture package as submittal 03-31, water reducer included, no chloride accelerator.', '2026-03-13T10:04:00Z'],
        ['contractor', 'Sarah Chen', 'Great. Please keep batch tickets attached to the delivery packet for the inspector.', '2026-03-13T10:18:00Z'],
      ],
    },
    {
      rfq_id: 'rfq-s001-aw1',
      vendor_email: 'quotes@martinmarietta.com',
      vendor_name: 'Martin Marietta',
      messages: [
        ['contractor', 'Sarah Chen', 'Thanks for pricing this one. We awarded elsewhere, but please stay warm for the podium slab package next month.', '2026-03-12T15:12:00Z'],
        ['vendor', 'Martin Marietta', 'Understood. Send the podium package when ready and we will sharpen the freight assumptions for the Denver yard.', '2026-03-12T16:03:00Z'],
      ],
    },
    {
      rfq_id: 'rfq-s002-a',
      bid_id: 'bid-s002a-ext1',
      vendor_email: 'quotes@westernhvac.com',
      vendor_name: 'Western HVAC Supply',
      messages: [
        ['contractor', 'Sarah Chen', 'For the HEPA AHUs, can you confirm whether the 35-day lead time starts at submittal approval or PO release?', '2026-04-13T11:25:00Z'],
        ['vendor', 'Western HVAC Supply', 'Lead time starts at approved submittals. If we can release on preliminary selections, we can protect a production slot.', '2026-04-13T12:17:00Z'],
        ['contractor', 'Sarah Chen', 'Please price the production-slot hold as an alternate and note how long the hold is valid.', '2026-04-13T12:31:00Z'],
      ],
    },
    {
      rfq_id: 'rfq-s002-a',
      vendor_email: 'healthcare@johnsoncontrols.com',
      vendor_name: 'Johnson Controls Healthcare Team',
      messages: [
        ['contractor', 'Sarah Chen', 'Can you include startup support for the surgical suite units, including TAB coordination?', '2026-04-12T13:05:00Z'],
        ['vendor', 'Johnson Controls Healthcare Team', 'Yes. We can include factory startup and one TAB coordination visit. Additional visits would be T&M.', '2026-04-12T15:48:00Z'],
      ],
    },
    {
      rfq_id: 'rfq-m001-a',
      bid_id: 'bid-m001a-v001',
      vendor_id: 'vendor-001',
      vendor_email: 'david@pacificsteel.com',
      vendor_name: 'Pacific Steel Supply',
      messages: [
        ['contractor', 'Mike Torres', 'David, we need floors 18-22 prioritized if the full package cannot ship together. Can you sequence the W33s first?', '2026-04-09T16:10:00Z'],
        ['vendor', 'Pacific Steel Supply', 'Yes. W33s can be released first with deck following one week later. W36s are the constraint if the mill date slips.', '2026-04-09T17:02:00Z'],
        ['contractor', 'Mike Torres', 'That works. Please mark W36 mill date as the critical path item in your quote assumptions.', '2026-04-09T17:26:00Z'],
      ],
    },
    {
      rfq_id: 'rfq-m001-a',
      vendor_email: 'estimating@seattlesteel.com',
      vendor_name: 'Seattle Steel Estimating',
      messages: [
        ['contractor', 'Mike Torres', 'Can you review whether the 3 inch composite deck number includes rooftop terrace waste factor?', '2026-04-08T13:40:00Z'],
        ['vendor', 'Seattle Steel Estimating', 'Our takeoff includes 3 percent waste. Rooftop terrace transitions may need another 1.5 percent depending on final edge details.', '2026-04-08T15:09:00Z'],
      ],
    },
  ]

  for (const thread of messageThreads) {
    for (const [authorRole, authorName, message, createdAt] of thread.messages) {
      await insertNegotiationMessage({
        rfq_id: thread.rfq_id,
        bid_id: thread.bid_id,
        vendor_id: thread.vendor_id,
        vendor_email: thread.vendor_email,
        author_role: authorRole,
        author_name: authorName,
        message,
        created_at: createdAt,
      })
    }
  }
  console.log('  ✓ message center threads (all seeded RFQs)')

  // --- Email integration demo data ---
  await sql`
    DELETE FROM rfq_email_attachments
    WHERE email_message_id IN (
      SELECT id FROM rfq_email_messages WHERE rfq_id = ${'rfq-s001-b'}
    )
  `
  await sql`DELETE FROM rfq_review_tasks WHERE rfq_id = ${'rfq-s001-b'}`
  await sql`
    DELETE FROM rfq_quote_line_items
    WHERE quote_response_id IN (
      SELECT id FROM rfq_quote_responses WHERE rfq_id = ${'rfq-s001-b'}
    )
  `
  await sql`DELETE FROM rfq_quote_responses WHERE rfq_id = ${'rfq-s001-b'}`
  await sql`DELETE FROM rfq_email_messages WHERE rfq_id = ${'rfq-s001-b'}`
  await sql`DELETE FROM rfq_vendor_requests WHERE rfq_id = ${'rfq-s001-b'}`

  const vendorRequestId = await upsertVendorRequest({
    rfq_id: 'rfq-s001-b',
    contractor_user_id: 'contractor-001',
    vendor_name: 'Nucor Rebar Distribution',
    vendor_email: 'bids@nucor.com',
    vendor_email_domain: 'nucor.com',
    status: 'quoted',
    gmail_thread_id: 'gmail-thread-rfq-s001-b-demo',
    outbound_message_id: 'gmail-msg-rfq-s001-b-outbound',
    last_message_at: '2026-04-12T11:00:00Z',
    last_message_direction: 'inbound',
    match_basis: 'rfq_invite_email',
    notes: 'Demo Gmail thread seeded for contractor mailbox review.',
    created_at: '2026-04-11T09:35:00Z',
    updated_at: '2026-04-12T11:05:00Z',
  })

  const outboundMessageId = await upsertEmailMessage({
    contractor_user_id: 'contractor-001',
    gmail_message_id: 'gmail-msg-rfq-s001-b-outbound',
    gmail_thread_id: 'gmail-thread-rfq-s001-b-demo',
    internet_message_id: '<rfq-s001-b-outbound@rialto.local>',
    rfq_id: 'rfq-s001-b',
    vendor_request_id: vendorRequestId,
    direction: 'outbound',
    match_status: 'matched',
    match_confidence: 1,
    match_reason: 'Seeded outbound RFQ invite email.',
    subject: 'RFQ: Structural Rebar - Foundations & Core',
    normalized_subject: 'rfq structural rebar foundations core',
    from_email: 'sarah@mccarthy.com',
    from_name: 'Sarah Chen',
    to_json: [{ email: 'bids@nucor.com', name: 'Nucor Rebar Distribution' }],
    cc_json: [],
    snippet: 'Please review the attached RFQ package and return pricing by May 10.',
    text_body: 'Hi team,\n\nPlease review the attached RFQ package for Structural Rebar - Foundations & Core and reply with your quote.\n\nThanks,\nSarah',
    html_body: '<p>Hi team,</p><p>Please review the attached RFQ package for <strong>Structural Rebar - Foundations &amp; Core</strong> and reply with your quote.</p><p>Thanks,<br/>Sarah</p>',
    sent_at: '2026-04-11T09:35:00Z',
    is_unread: false,
    label_json: ['SENT'],
    raw_payload_json: { seed: true, direction: 'outbound' },
    created_at: '2026-04-11T09:35:00Z',
    updated_at: '2026-04-11T09:35:00Z',
  })

  const inboundMessageId = await upsertEmailMessage({
    contractor_user_id: 'contractor-001',
    gmail_message_id: 'gmail-msg-rfq-s001-b-inbound',
    gmail_thread_id: 'gmail-thread-rfq-s001-b-demo',
    internet_message_id: '<rfq-s001-b-inbound@nucor.com>',
    rfq_id: 'rfq-s001-b',
    vendor_request_id: vendorRequestId,
    direction: 'inbound',
    match_status: 'matched',
    match_confidence: 0.99,
    match_reason: 'Matched by Gmail thread and invited vendor email.',
    subject: 'Re: RFQ: Structural Rebar - Foundations & Core',
    normalized_subject: 'rfq structural rebar foundations core',
    from_email: 'bids@nucor.com',
    from_name: 'Nucor Rebar Distribution',
    to_json: [{ email: 'sarah@mccarthy.com', name: 'Sarah Chen' }],
    cc_json: [],
    snippet: 'Attached is our pricing for #5 and #8 rebar. Lead time is 10 calendar days.',
    text_body: 'Sarah,\n\nAttached is our quote for the rebar package.\n\n#5 Rebar ASTM A615 Grade 60: 85 tons at $830/ton\n#8 Rebar ASTM A615 Grade 60: 50 tons at $1,014/ton\nLead time: 10 calendar days\n\nThanks,\nNucor Rebar Distribution',
    html_body: '<p>Sarah,</p><p>Attached is our quote for the rebar package.</p><ul><li>#5 Rebar ASTM A615 Grade 60: 85 tons at $830/ton</li><li>#8 Rebar ASTM A615 Grade 60: 50 tons at $1,014/ton</li><li>Lead time: 10 calendar days</li></ul><p>Thanks,<br/>Nucor Rebar Distribution</p>',
    sent_at: '2026-04-12T11:00:00Z',
    is_unread: true,
    label_json: ['INBOX', 'UNREAD'],
    raw_payload_json: { seed: true, direction: 'inbound' },
    created_at: '2026-04-12T11:00:00Z',
    updated_at: '2026-04-12T11:00:00Z',
  })

  const quoteResponseId = await upsertQuoteResponse({
    rfq_id: 'rfq-s001-b',
    vendor_request_id: vendorRequestId,
    email_message_id: inboundMessageId,
    source_kind: 'email_body',
    status: 'parsed',
    confidence: 0.97,
    currency: 'USD',
    lead_time_text: '10 calendar days',
    notes: 'Parsed from seeded inbound Gmail quote reply.',
    created_at: '2026-04-12T11:01:00Z',
    updated_at: '2026-04-12T11:01:00Z',
  })

  await replaceQuoteLineItems(quoteResponseId, [
    {
      rfq_line_item_id: 'li-s001b-1',
      source_name: '#5 Rebar ASTM A615 Grade 60',
      normalized_name: '#5 rebar astm a615 grade 60',
      quantity: '85',
      unit: 'tons',
      unit_price: '830',
      total_price: '70550',
      lead_time_text: '10 calendar days',
      notes: 'Matched from inbound quote email.',
      confidence: 0.98,
      created_at: '2026-04-12T11:01:00Z',
      updated_at: '2026-04-12T11:01:00Z',
    },
    {
      rfq_line_item_id: 'li-s001b-2',
      source_name: '#8 Rebar ASTM A615 Grade 60',
      normalized_name: '#8 rebar astm a615 grade 60',
      quantity: '50',
      unit: 'tons',
      unit_price: '1014',
      total_price: '50700',
      lead_time_text: '10 calendar days',
      notes: 'Matched from inbound quote email.',
      confidence: 0.98,
      created_at: '2026-04-12T11:01:00Z',
      updated_at: '2026-04-12T11:01:00Z',
    },
  ])

  await upsertReviewTask({
    contractor_user_id: 'contractor-001',
    rfq_id: 'rfq-s001-b',
    vendor_request_id: vendorRequestId,
    email_message_id: inboundMessageId,
    quote_response_id: quoteResponseId,
    task_type: 'review_email_quote',
    status: 'open',
    title: 'Review Nucor rebar email quote before award',
    details_json: {
      bid_id: 'bid-email-vr-demo-s001b',
      reason: 'Email-origin quote should be reviewed before PO award.',
      requested_vendor_email: 'bids@nucor.com',
      outbound_message_id: outboundMessageId,
    },
    resolution_json: {},
    created_at: '2026-04-12T11:02:00Z',
    updated_at: '2026-04-12T11:02:00Z',
  })

  // Remove any stray bids on rfq-s001-b other than the demo one
  await sql`
    DELETE FROM bid_line_items
    WHERE bid_id IN (
      SELECT id FROM bids WHERE rfq_id = ${'rfq-s001-b'} AND id != ${'bid-email-vr-demo-s001b'}
    )
  `
  await sql`
    DELETE FROM bids WHERE rfq_id = ${'rfq-s001-b'} AND id != ${'bid-email-vr-demo-s001b'}
  `
  console.log('  ✓ email integration demo rows (rfq-s001-b)')

  // --- Orders ---
  const ordersData = [
    {
      id: 'order-s001-aw1',
      rfq_id: 'rfq-s001-aw1',
      bid_id: 'bid-s001aw1-winner',
      project_id: 'proj-s001',
      vendor_id: null,
      vendor_name: 'CalPortland',
      po_number: 'PO-2026-48001',
      agreed_price: 533400,
      delivery_date: '2026-03-28',
      delivery_location: 'Denver, CO',
      awarded_at: '2026-03-12T10:00:00Z',
      current_stage: 'delivered',
      line_items_snapshot: [
        { id: 'li-s001w1-1', sku: 'Ready-Mix 4000 PSI', description: 'Ready-Mix Concrete 4000 PSI', quantity: 2400, unit: 'cy', specs: 'ASTM C150' },
      ],
      stage_history: [
        { stage: 'confirmed', completed_at: '2026-03-12T10:00:00Z', notes: 'PO confirmed. CalPortland scheduling batching at Aurora plant.' },
        { stage: 'packaged', completed_at: '2026-03-20T08:00:00Z', notes: 'Concrete mix verified and loaded at Aurora facility.' },
        { stage: 'shipped', completed_at: '2026-03-22T06:00:00Z', carrier: 'CalPortland Delivery Fleet', tracking_number: 'CPL-8812034', ship_date: '2026-03-22' },
        { stage: 'out_for_delivery', completed_at: '2026-03-27T07:00:00Z', notes: 'En route to Riverton Boulevard jobsite.' },
        { stage: 'delivered', completed_at: '2026-03-28T10:15:00Z', notes: 'Delivered and poured. Signed by Site Foreman J. Mathers.' },
      ],
    },
  ]
  for (const o of ordersData) await upsertOrder(o)
  console.log('  ✓ orders (1) + stage_progress (5 stages)')
}

main()
  .then(() => {
    console.log('\nDone! Log in with password: password123')
    console.log('  Contractors: sarah@mccarthy.com  /  mike@turner.com')
    console.log('  Vendors:     david@pacificsteel.com  /  anna@consolidated.com')
    console.log('  Demo:        contractor@demo.com  /  vendor@demo.com')
    process.exit(0)
  })
  .catch((err) => {
    console.error('\nSeed failed:', err)
    process.exit(1)
  })
