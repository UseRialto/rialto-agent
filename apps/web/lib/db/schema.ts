import { pgTable, text, integer, real, boolean, serial, uniqueIndex, index, vector } from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: text('role', { enum: ['contractor', 'vendor'] }).notNull(),
  company_info: text('company_info'),          // JSON blob
  onboarding_completed: boolean('onboarding_completed').notNull().default(false),
  created_at: text('created_at').notNull(),
})

// ---------------------------------------------------------------------------
// Contractor Mailboxes
// ---------------------------------------------------------------------------
export const contractorMailboxes = pgTable('contractor_mailboxes', {
  user_id: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider', { enum: ['google', 'microsoft_365'] }).notNull().default('google'),
  provider_account_id: text('provider_account_id').notNull().default(''),
  provider_sync_cursor: text('provider_sync_cursor').notNull().default(''),
  email_address: text('email_address').notNull().default(''),
  sender_name: text('sender_name').notNull().default(''),
  access_token: text('access_token').notNull().default(''),
  refresh_token: text('refresh_token').notNull().default(''),
  token_expires_at: text('token_expires_at').notNull().default(''),
  scope: text('scope').notNull().default(''),
  connected_at: text('connected_at').notNull().default(''),
  auth_state: text('auth_state').notNull().default(''),
  gmail_history_id: text('gmail_history_id').notNull().default(''),
  last_sync_at: text('last_sync_at').notNull().default(''),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (table) => ({
  authStateIdx: index('idx_contractor_mailboxes_auth_state').on(table.auth_state),
}))

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  owner_id: text('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  location: text('location').notNull(),
  general_contractor: text('general_contractor'),
  description: text('description'),
  budget: real('budget'),
  status: text('status', { enum: ['active', 'completed', 'archived'] }).notNull().default('active'),
  collaborator_ids: text('collaborator_ids'),  // JSON array
  rfq_categories: text('rfq_categories'),      // JSON array
  created_at: text('created_at').notNull(),
})

// ---------------------------------------------------------------------------
// Project Spec Documents - uploaded project manuals/addenda and extracted chunks
// ---------------------------------------------------------------------------
export const projectSpecDocuments = pgTable('project_spec_documents', {
  id: serial('id').primaryKey(),
  project_id: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  file_url: text('file_url').notNull(),
  mime_type: text('mime_type').notNull().default('application/pdf'),
  size_bytes: integer('size_bytes'),
  page_count: integer('page_count'),
  status: text('status', { enum: ['uploaded', 'processing', 'indexed', 'failed'] }).notNull().default('uploaded'),
  extraction_error: text('extraction_error'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (table) => ({
  projectStatusIdx: index('idx_project_spec_documents_project_status').on(table.project_id, table.status),
}))

export const projectSpecChunks = pgTable('project_spec_chunks', {
  id: serial('id').primaryKey(),
  document_id: integer('document_id').notNull().references(() => projectSpecDocuments.id, { onDelete: 'cascade' }),
  project_id: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  chunk_index: integer('chunk_index').notNull(),
  parent_chunk_id: integer('parent_chunk_id'),
  chunk_type: text('chunk_type', { enum: ['parent', 'child'] }).notNull().default('child'),
  page_start: integer('page_start').notNull(),
  page_end: integer('page_end').notNull(),
  section_number: text('section_number'),
  canonical_section_number: text('canonical_section_number'),
  section_title: text('section_title'),
  token_count: integer('token_count').notNull().default(0),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
  created_at: text('created_at').notNull(),
}, (table) => ({
  documentChunkUnique: uniqueIndex('project_spec_chunks_document_chunk_unique').on(table.document_id, table.chunk_index),
  projectIdx: index('idx_project_spec_chunks_project').on(table.project_id),
  sectionIdx: index('idx_project_spec_chunks_section').on(table.project_id, table.canonical_section_number),
}))

export const projectSpecPackages = pgTable('project_spec_packages', {
  id: serial('id').primaryKey(),
  project_id: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  trade: text('trade').notNull(),
  title: text('title').notNull(),
  status: text('status', { enum: ['pending', 'complete', 'failed'] }).notNull().default('pending'),
  source_document_ids_json: text('source_document_ids_json').notNull().default('[]'),
  selected_chunk_ids_json: text('selected_chunk_ids_json').notNull().default('[]'),
  content: text('content').notNull().default(''),
  diagnostics_json: text('diagnostics_json').notNull().default('{}'),
  error: text('error'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (table) => ({
  projectTradeUnique: uniqueIndex('project_spec_packages_project_trade_unique').on(table.project_id, table.trade),
  projectStatusIdx: index('idx_project_spec_packages_project_status').on(table.project_id, table.status),
}))

export const specProductLookupCache = pgTable('spec_product_lookup_cache', {
  id: serial('id').primaryKey(),
  lookup_key: text('lookup_key').notNull(),
  vendor_sku: text('vendor_sku'),
  manufacturer: text('manufacturer'),
  model: text('model'),
  provider: text('provider'),
  status: text('status', { enum: ['found', 'not_found', 'failed', 'skipped'] }).notNull().default('skipped'),
  query: text('query'),
  result_json: text('result_json').notNull().default('{}'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (table) => ({
  lookupKeyUnique: uniqueIndex('spec_product_lookup_cache_lookup_key_unique').on(table.lookup_key),
}))

// ---------------------------------------------------------------------------
// RFQs
// ---------------------------------------------------------------------------
export const rfqs = pgTable('rfqs', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  request_type: text('request_type', { enum: ['rfq', 'rfp'] }).notNull().default('rfq'),
  email_subject: text('email_subject'),
  email_body: text('email_body'),
  category: text('category'),
  status: text('status', { enum: ['draft', 'active', 'closed'] }).notNull().default('draft'),
  visibility: text('visibility', { enum: ['public', 'invited_only'] }).notNull().default('public'),
  anonymous_public_listing: boolean('anonymous_public_listing').notNull().default(false),
  procurement_objective: text('procurement_objective'),
  scope_summary: text('scope_summary'),
  desired_outcome: text('desired_outcome'),
  performance_requirements: text('performance_requirements'),
  approved_alternates: text('approved_alternates'),
  quantity_context: text('quantity_context'),
  site_conditions: text('site_conditions'),
  delivery_zip: text('delivery_zip'),
  delivery_logistics: text('delivery_logistics'),
  delivery_window: text('delivery_window'),
  phased_delivery: text('phased_delivery'),
  submittals_required: text('submittals_required'),
  lead_time_sensitivity: text('lead_time_sensitivity'),
  exclusions: text('exclusions'),
  unknowns_or_questions: text('unknowns_or_questions'),
  vendor_questions_requested: text('vendor_questions_requested'),
  vendor_guidance_requested: text('vendor_guidance_requested'),
  attachments_summary: text('attachments_summary'),
  procurement_requirements_json: text('procurement_requirements_json'),
  ai_spec_assistant_json: text('ai_spec_assistant_json'),
  commodity_watch_json: text('commodity_watch_json'),
  risk_flags_json: text('risk_flags_json'),
  vendor_response_fields_json: text('vendor_response_fields_json'),
  attachment_urls_json: text('attachment_urls_json'),
  source_rfq_id: text('source_rfq_id'),
  bid_deadline: text('bid_deadline'),
  created_at: text('created_at').notNull(),
  published_at: text('published_at'),
})

// ---------------------------------------------------------------------------
// RFQ Line Items
// ---------------------------------------------------------------------------
export const rfqLineItems = pgTable('rfq_line_items', {
  id: text('id').primaryKey(),
  rfq_id: text('rfq_id').notNull().references(() => rfqs.id, { onDelete: 'cascade' }),
  sku: text('sku'),
  description: text('description').notNull(),
  quantity: real('quantity').notNull(),
  unit: text('unit').notNull(),
  specs: text('specs'),
  constraints: text('constraints'),
  attributes_json: text('attributes_json'),
  certifications: text('certifications'),      // JSON array
  notes: text('notes'),
  contractor_budget: real('contractor_budget'),
  suggested_lead_time_days: integer('suggested_lead_time_days'),
  sort_order: integer('sort_order').notNull().default(0),
})

// ---------------------------------------------------------------------------
// Comparison Sheet View - live mutable working workbook state
// ---------------------------------------------------------------------------
export const comparisonSheetViews = pgTable('comparison_sheet_views', {
  rfq_id: text('rfq_id').primaryKey().references(() => rfqs.id, { onDelete: 'cascade' }),
  view_json: text('view_json').notNull().default('{}'),
  current_version_id: integer('current_version_id'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
})

export const comparisonSheetVersions = pgTable('comparison_sheet_versions', {
  id: serial('id').primaryKey(),
  rfq_id: text('rfq_id').notNull().references(() => rfqs.id, { onDelete: 'cascade' }),
  version_number: integer('version_number').notNull(),
  parent_version_id: integer('parent_version_id'),
  view_json: text('view_json').notNull().default('{}'),
  source: text('source', { enum: ['estimator-edit', 'agent-proposal', 'import', 'vendor-merge', 'restore', 'system'] }).notNull().default('estimator-edit'),
  summary: text('summary').notNull().default('Saved estimator workbook edit.'),
  actor_user_id: text('actor_user_id'),
  proposal_json: text('proposal_json'),
  created_at: text('created_at').notNull(),
}, (table) => ({
  rfqVersionUnique: uniqueIndex('comparison_sheet_versions_rfq_version_unique').on(table.rfq_id, table.version_number),
  rfqCreatedIdx: index('idx_comparison_sheet_versions_rfq_created').on(table.rfq_id, table.created_at),
}))

// ---------------------------------------------------------------------------
// RFQ Invites (vendors explicitly invited to an RFQ)
// ---------------------------------------------------------------------------
export const rfqInvites = pgTable('rfq_invites', {
  id: serial('id').primaryKey(),
  rfq_id: text('rfq_id').notNull().references(() => rfqs.id, { onDelete: 'cascade' }),
  vendor_id: text('vendor_id'),
  vendor_email: text('vendor_email'),
  vendor_name: text('vendor_name'),
  vendor_first_name: text('vendor_first_name'),
  vendor_last_name: text('vendor_last_name'),
  on_platform: boolean('on_platform').notNull().default(false),
})

// ---------------------------------------------------------------------------
// Bids - covers BOTH drafts (is_draft=true) and submitted bids (is_draft=false)
// ---------------------------------------------------------------------------
export const bids = pgTable('bids', {
  id: text('id').primaryKey(),
  rfq_id: text('rfq_id').notNull().references(() => rfqs.id, { onDelete: 'cascade' }),
  vendor_id: text('vendor_id'),
  vendor_email: text('vendor_email'),
  vendor_name: text('vendor_name').notNull(),
  designer_name: text('designer_name'),
  is_invited: boolean('is_invited').notNull().default(false),
  is_on_platform: boolean('is_on_platform').notNull().default(false),
  submitted_at: text('submitted_at').notNull(),
  total_price: real('total_price').notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  lead_time_days: integer('lead_time_days').notNull().default(0),
  notes: text('notes'),
  payment_terms: text('payment_terms'),
  deposit_terms: text('deposit_terms'),
  credit_terms: text('credit_terms'),
  escalation_clause: text('escalation_clause'),
  price_valid_until: text('price_valid_until'),
  shipping_terms: text('shipping_terms'),
  compliance_declarations_json: text('compliance_declarations_json'),
  risk_flags_json: text('risk_flags_json'),
  fulfillment_summary_json: text('fulfillment_summary_json'),
  buyer_decision_status: text('buyer_decision_status', { enum: ['preferred', 'alternate', 'hold', 'do_not_use'] }),
  decision_rationale: text('decision_rationale'),
  vendor_reliability_flag: text('vendor_reliability_flag', { enum: ['trusted', 'neutral', 'unreliable'] }),
  status: text('status', { enum: ['pending', 'under_review', 'shortlisted', 'rejected'] }).notNull().default('pending'),
  is_draft: boolean('is_draft').notNull().default(false),
  source: text('source', { enum: ['platform', 'email', 'magic_form', 'external_workbook'] }).notNull().default('platform'),
})

// ---------------------------------------------------------------------------
// Bid Line Items
// ---------------------------------------------------------------------------
export const bidLineItems = pgTable('bid_line_items', {
  id: serial('id').primaryKey(),
  bid_id: text('bid_id').notNull().references(() => bids.id, { onDelete: 'cascade' }),
  line_item_id: text('line_item_id').notNull().references(() => rfqLineItems.id, { onDelete: 'cascade' }),
  sku: text('sku'),
  description: text('description'),
  quantity: real('quantity'),
  quoted_quantity: real('quoted_quantity'),
  unit: text('unit'),
  unit_price: real('unit_price').notNull(),
  total_price: real('total_price').notNull(),
  lead_time_days: integer('lead_time_days').notNull().default(0),
  availability: text('availability', { enum: ['in_stock', 'can_source', 'unavailable'] }).notNull(),
  units_available: integer('units_available'),
  delivery_terms: text('delivery_terms'),
  notes: text('notes'),
  substitution_notes: text('substitution_notes'),
  quoted_product_details: text('quoted_product_details'),
  response_attributes_json: text('response_attributes_json'),
  is_alternate: boolean('is_alternate').notNull().default(false),
})

export const bidSpecComplianceReports = pgTable('bid_spec_compliance_reports', {
  id: serial('id').primaryKey(),
  bid_id: text('bid_id').notNull().references(() => bids.id, { onDelete: 'cascade' }),
  rfq_id: text('rfq_id').notNull().references(() => rfqs.id, { onDelete: 'cascade' }),
  project_id: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['pending', 'complete', 'failed', 'no_specs_available'] }).notNull().default('pending'),
  summary_status: text('summary_status', { enum: ['compliant', 'violation', 'needs_review', 'no_spec_found', 'not_quoted', 'no_specs_available', 'failed'] }).notNull().default('needs_review'),
  high_severity_count: integer('high_severity_count').notNull().default(0),
  checked_at: text('checked_at').notNull(),
  model: text('model'),
  error: text('error'),
}, (table) => ({
  bidUnique: uniqueIndex('bid_spec_compliance_reports_bid_unique').on(table.bid_id),
  rfqIdx: index('idx_bid_spec_compliance_reports_rfq').on(table.rfq_id),
}))

export const bidSpecComplianceItems = pgTable('bid_spec_compliance_items', {
  id: serial('id').primaryKey(),
  report_id: integer('report_id').notNull().references(() => bidSpecComplianceReports.id, { onDelete: 'cascade' }),
  bid_id: text('bid_id').notNull().references(() => bids.id, { onDelete: 'cascade' }),
  rfq_line_item_id: text('rfq_line_item_id').references(() => rfqLineItems.id, { onDelete: 'set null' }),
  status: text('status', { enum: ['compliant', 'violation', 'needs_review', 'no_spec_found', 'not_quoted'] }).notNull(),
  review_kind: text('review_kind', { enum: ['line_item', 'substitution'] }).notNull().default('line_item'),
  substitution_verdict: text('substitution_verdict', { enum: ['up_to_spec', 'not_up_to_spec', 'needs_review'] }),
  severity: text('severity', { enum: ['low', 'medium', 'high'] }).notNull().default('low'),
  requirement_summary: text('requirement_summary').notNull().default(''),
  vendor_summary: text('vendor_summary').notNull().default(''),
  explanation: text('explanation').notNull().default(''),
  suggested_follow_up: text('suggested_follow_up'),
  evidence_json: text('evidence_json').notNull().default('[]'),
  retrieval_diagnostics_json: text('retrieval_diagnostics_json').notNull().default('{}'),
  product_lookup_json: text('product_lookup_json').notNull().default('{}'),
  created_at: text('created_at').notNull(),
}, (table) => ({
  reportIdx: index('idx_bid_spec_compliance_items_report').on(table.report_id),
  bidItemIdx: index('idx_bid_spec_compliance_items_bid_item').on(table.bid_id, table.rfq_line_item_id),
}))

// ---------------------------------------------------------------------------
// RFQ Mail Sync / Quote Return Flow
// ---------------------------------------------------------------------------
export const rfqVendorRequests = pgTable('rfq_vendor_requests', {
  id: serial('id').primaryKey(),
  rfq_id: text('rfq_id').notNull().references(() => rfqs.id, { onDelete: 'cascade' }),
  contractor_user_id: text('contractor_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  vendor_name: text('vendor_name').notNull().default(''),
  vendor_email: text('vendor_email').notNull(),
  vendor_email_domain: text('vendor_email_domain').notNull().default(''),
  status: text('status').notNull().default('draft'),
  gmail_thread_id: text('gmail_thread_id').notNull().default(''),
  outbound_message_id: text('outbound_message_id').notNull().default(''),
  last_message_at: text('last_message_at').notNull().default(''),
  last_message_direction: text('last_message_direction').notNull().default(''),
  match_basis: text('match_basis').notNull().default(''),
  notes: text('notes').notNull().default(''),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (table) => ({
  requestUnique: uniqueIndex('rfq_vendor_requests_rfq_vendor_email_unique').on(table.rfq_id, table.vendor_email),
  rfqStatusIdx: index('idx_rfq_vendor_requests_rfq_status').on(table.rfq_id, table.status),
  threadIdx: index('idx_rfq_vendor_requests_thread').on(table.gmail_thread_id),
}))

export const rfqMagicLinks = pgTable('rfq_magic_links', {
  id: serial('id').primaryKey(),
  rfq_id: text('rfq_id').notNull().references(() => rfqs.id, { onDelete: 'cascade' }),
  vendor_request_id: integer('vendor_request_id').notNull().references(() => rfqVendorRequests.id, { onDelete: 'cascade' }),
  vendor_email: text('vendor_email').notNull(),
  token_hash: text('token_hash').notNull(),
  expires_at: text('expires_at').notNull(),
  first_opened_at: text('first_opened_at'),
  last_submitted_at: text('last_submitted_at'),
  completed_at: text('completed_at'),
  revoked_at: text('revoked_at'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (table) => ({
  tokenHashUnique: uniqueIndex('rfq_magic_links_token_hash_unique').on(table.token_hash),
  vendorRequestUnique: uniqueIndex('rfq_magic_links_vendor_request_unique').on(table.vendor_request_id),
  rfqVendorIdx: index('idx_rfq_magic_links_rfq_vendor').on(table.rfq_id, table.vendor_email),
}))

export const rfqEmailMessages = pgTable('rfq_email_messages', {
  id: serial('id').primaryKey(),
  contractor_user_id: text('contractor_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  gmail_message_id: text('gmail_message_id').notNull(),
  gmail_thread_id: text('gmail_thread_id').notNull().default(''),
  internet_message_id: text('internet_message_id').notNull().default(''),
  rfq_id: text('rfq_id').references(() => rfqs.id, { onDelete: 'set null' }),
  vendor_request_id: integer('vendor_request_id').references(() => rfqVendorRequests.id, { onDelete: 'set null' }),
  direction: text('direction').notNull().default(''),
  match_status: text('match_status').notNull().default('unassigned'),
  match_confidence: real('match_confidence').notNull().default(0),
  match_reason: text('match_reason').notNull().default(''),
  subject: text('subject').notNull().default(''),
  normalized_subject: text('normalized_subject').notNull().default(''),
  from_email: text('from_email').notNull().default(''),
  from_name: text('from_name').notNull().default(''),
  to_json: text('to_json').notNull().default('[]'),
  cc_json: text('cc_json').notNull().default('[]'),
  snippet: text('snippet').notNull().default(''),
  text_body: text('text_body').notNull().default(''),
  html_body: text('html_body').notNull().default(''),
  sent_at: text('sent_at').notNull().default(''),
  is_unread: boolean('is_unread').notNull().default(false),
  label_json: text('label_json').notNull().default('[]'),
  raw_payload_json: text('raw_payload_json').notNull().default('{}'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (table) => ({
  gmailMessageUnique: uniqueIndex('rfq_email_messages_gmail_message_id_unique').on(table.gmail_message_id),
  rfqSentIdx: index('idx_rfq_email_messages_rfq_sent_at').on(table.rfq_id, table.sent_at),
  threadIdx: index('idx_rfq_email_messages_thread_sent_at').on(table.gmail_thread_id, table.sent_at),
}))

export const rfqEmailAttachments = pgTable('rfq_email_attachments', {
  id: serial('id').primaryKey(),
  email_message_id: integer('email_message_id').notNull().references(() => rfqEmailMessages.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull().default(''),
  mime_type: text('mime_type').notNull().default(''),
  file_path: text('file_path').notNull().default(''),
  size_bytes: integer('size_bytes').notNull().default(0),
  extracted_text: text('extracted_text').notNull().default(''),
  extraction_confidence: real('extraction_confidence').notNull().default(0),
  source_kind: text('source_kind').notNull().default(''),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (table) => ({
  attachmentUnique: uniqueIndex('rfq_email_attachments_message_file_unique').on(table.email_message_id, table.file_path),
}))

export const rfqQuoteResponses = pgTable('rfq_quote_responses', {
  id: serial('id').primaryKey(),
  rfq_id: text('rfq_id').notNull().references(() => rfqs.id, { onDelete: 'cascade' }),
  vendor_request_id: integer('vendor_request_id').references(() => rfqVendorRequests.id, { onDelete: 'set null' }),
  email_message_id: integer('email_message_id').notNull().references(() => rfqEmailMessages.id, { onDelete: 'cascade' }),
  source_kind: text('source_kind').notNull().default(''),
  status: text('status').notNull().default('parsed'),
  confidence: real('confidence').notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  lead_time_text: text('lead_time_text').notNull().default(''),
  notes: text('notes').notNull().default(''),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (table) => ({
  emailUnique: uniqueIndex('rfq_quote_responses_email_message_id_unique').on(table.email_message_id),
}))

export const rfqQuoteLineItems = pgTable('rfq_quote_line_items', {
  id: serial('id').primaryKey(),
  quote_response_id: integer('quote_response_id').notNull().references(() => rfqQuoteResponses.id, { onDelete: 'cascade' }),
  rfq_line_item_id: text('rfq_line_item_id').references(() => rfqLineItems.id, { onDelete: 'set null' }),
  source_name: text('source_name').notNull().default(''),
  normalized_name: text('normalized_name').notNull().default(''),
  quantity: text('quantity').notNull().default(''),
  unit: text('unit').notNull().default(''),
  unit_price: text('unit_price').notNull().default(''),
  total_price: text('total_price').notNull().default(''),
  lead_time_text: text('lead_time_text').notNull().default(''),
  notes: text('notes').notNull().default(''),
  confidence: real('confidence').notNull().default(0),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (table) => ({
  quoteIdx: index('idx_rfq_quote_line_items_quote_response').on(table.quote_response_id),
}))

export const rfqReviewTasks = pgTable('rfq_review_tasks', {
  id: serial('id').primaryKey(),
  contractor_user_id: text('contractor_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  rfq_id: text('rfq_id').references(() => rfqs.id, { onDelete: 'cascade' }),
  vendor_request_id: integer('vendor_request_id').references(() => rfqVendorRequests.id, { onDelete: 'cascade' }),
  email_message_id: integer('email_message_id').references(() => rfqEmailMessages.id, { onDelete: 'cascade' }),
  quote_response_id: integer('quote_response_id').references(() => rfqQuoteResponses.id, { onDelete: 'cascade' }),
  task_type: text('task_type').notNull().default(''),
  status: text('status').notNull().default('open'),
  title: text('title').notNull().default(''),
  details_json: text('details_json').notNull().default('{}'),
  resolution_json: text('resolution_json').notNull().default('{}'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (table) => ({
  statusIdx: index('idx_rfq_review_tasks_status').on(table.status, table.created_at),
}))

export const vendorRelationships = pgTable('vendor_relationships', {
  id: serial('id').primaryKey(),
  contractor_user_id: text('contractor_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  vendor_id: text('vendor_id'),
  vendor_email: text('vendor_email').notNull(),
  vendor_name: text('vendor_name').notNull().default(''),
  trusted_status: text('trusted_status', { enum: ['trusted', 'neutral', 'unreliable'] }).notNull().default('neutral'),
  rating: integer('rating').notNull().default(3),
  terms_history_summary: text('terms_history_summary').notNull().default(''),
  qualification_notes: text('qualification_notes').notNull().default(''),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (table) => ({
  contractorVendorUnique: uniqueIndex('vendor_relationships_contractor_vendor_email_unique').on(table.contractor_user_id, table.vendor_email),
}))

export const negotiationMessages = pgTable('negotiation_messages', {
  id: serial('id').primaryKey(),
  rfq_id: text('rfq_id').notNull().references(() => rfqs.id, { onDelete: 'cascade' }),
  bid_id: text('bid_id').references(() => bids.id, { onDelete: 'cascade' }),
  vendor_id: text('vendor_id'),
  vendor_email: text('vendor_email'),
  author_role: text('author_role', { enum: ['contractor', 'vendor'] }).notNull(),
  author_name: text('author_name').notNull(),
  message: text('message').notNull(),
  created_at: text('created_at').notNull(),
}, (table) => ({
  rfqBidIdx: index('idx_negotiation_messages_rfq_bid').on(table.rfq_id, table.bid_id),
}))
