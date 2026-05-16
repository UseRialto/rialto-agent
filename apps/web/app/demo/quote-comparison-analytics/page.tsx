import { readFile } from 'node:fs/promises'
import { QuoteComparisonAnalyticsDemo } from './quote-comparison-analytics-demo'
import { createExternalQuoteImport } from '@/lib/procurement/external-quote-import'
import { DEFAULT_COMPARISON_SHEET_VIEW, type ComparisonSheetView } from '@/lib/procurement/comparison-sheet-state'
import { PRICING_MISTAKE_HIGHLIGHT } from '@/lib/procurement/comparison-analytics'
import type { ContractorBid } from '@/lib/types/contractor'
import type {
  BidSpecComplianceItem,
  BidSpecComplianceItemStatus,
  BidSpecComplianceReviewKind,
  BidSpecComplianceReport,
  BidSpecComplianceSubstitutionVerdict,
} from '@/lib/types/procurement'

export const metadata = { title: 'Building 14 Quote Comparison Demo - Rialto' }

const fixturePath = '/Users/tomasz/Desktop/rialto/data/test_files/07-120-line-multi-supplier-wide.csv'
const now = '2026-05-14T12:00:00.000Z'

export default async function QuoteComparisonAnalyticsDemoPage() {
  const text = await readFile(fixturePath, 'utf8')
  const imported = createExternalQuoteImport({
    projectId: 'project-building-14-demo',
    projectName: 'Building 14',
    filename: '07-120-line-multi-supplier-wide.csv',
    sourceKind: 'spreadsheet',
    text,
    now,
  })
  const rfq = {
    ...imported.rfq,
    id: 'rfq-building-14-demo',
    title: 'Building 14 Drywall Package Quote Comparison',
    rfp_details: {
      ...imported.rfq.rfp_details,
      scope_summary: 'Imported 120-line multi-supplier drywall comparison from test_files.',
      attachments_summary: 'Seeded from ~/Desktop/rialto/data/test_files/07-120-line-multi-supplier-wide.csv.',
    },
  }
  const lineIdBySource = new Map(imported.rfq.line_items.map((item, index) => [item.id, rfq.line_items[index]?.id ?? item.id]))
  const bids = imported.bids.map((bid) => ({
    ...bid,
    rfq_id: rfq.id,
    line_item_responses: bid.line_item_responses.map((response) => ({
      ...response,
      line_item_id: lineIdBySource.get(response.line_item_id) ?? response.line_item_id,
    })),
  }))
  const lnw = bids.find((bid) => bid.vendor_name.includes('L n W'))
  const buildco = bids.find((bid) => bid.vendor_name.includes('BuildCo'))
  const acme = bids.find((bid) => bid.vendor_name.includes('Acme'))
  const metro = bids.find((bid) => bid.vendor_name.includes('Metro'))
  markAlternate(lnw, rfq.line_items[7]?.id, 'Vendor proposed lighter-gauge track alternate in place of requested framing accessory.')
  markAlternate(acme, rfq.line_items[15]?.id, 'Vendor proposed imported fastener alternate with equivalent thread type.')
  markAlternate(buildco, rfq.line_items[34]?.id, 'Vendor proposed non-basis-of-design board alternate.')
  markAlternate(metro, rfq.line_items[63]?.id, 'Vendor proposed alternate sealant requiring submittal review.')
  attachSpecReports(rfq.id, bids, {
    lnwId: lnw?.id,
    acmeId: acme?.id,
    buildcoId: buildco?.id,
    metroId: metro?.id,
    lines: rfq.line_items.map((item) => item.id),
  })

  const view: ComparisonSheetView = {
    ...DEFAULT_COMPARISON_SHEET_VIEW,
    highlights: lnw && rfq.line_items[0] ? [
      {
        id: 'pricing-mistake-building-14-lnw-unit',
        selector: { kind: 'cell', rowKey: rfq.line_items[0].id, colKey: `vendor:${lnw.id}:unit_price` },
        color: PRICING_MISTAKE_HIGHLIGHT,
        note: 'Pricing mistake candidate: L n W unit price is a low outlier against the row median. Check whether this drywall line was quoted in square feet while the comparison row is in each/sheets.',
      },
      {
        id: 'pricing-mistake-building-14-lnw-total',
        selector: { kind: 'cell', rowKey: rfq.line_items[0].id, colKey: `vendor:${lnw.id}:total` },
        color: PRICING_MISTAKE_HIGHLIGHT,
        note: 'Pricing mistake candidate: this total follows the suspicious low unit price. Confirm the unit of measure before relying on the ranking.',
      },
    ] : [],
  }

  return <QuoteComparisonAnalyticsDemo rfq={rfq} bids={bids} initialView={view} />
}

function markAlternate(bid: ContractorBid | undefined, lineItemId: string | undefined, note: string) {
  if (!bid || !lineItemId) return
  const response = bid.line_item_responses.find((line) => line.line_item_id === lineItemId)
  if (!response) return
  response.is_alternate = true
  response.notes = note
  response.substitution_notes = note
  response.quoted_product_details = note.replace(/^Vendor proposed /, '')
}

function attachSpecReports(rfqId: string, bids: ContractorBid[], ids: { lnwId?: string; acmeId?: string; buildcoId?: string; metroId?: string; lines: string[] }) {
  const reports: BidSpecComplianceReport[] = []
  if (ids.lnwId) reports.push(report(ids.lnwId, rfqId, 'violation', [item(ids.lnwId, ids.lines[7], 'violation', 'substitution', 'not_up_to_spec', 'high', '20ga J track required at shaft wall returns.', 'Quoted lighter-gauge track alternate.', 'The proposed lighter-gauge track does not meet the scheduled 20ga requirement for this condition.')]))
  if (ids.acmeId) reports.push(report(ids.acmeId, rfqId, 'needs_review', [item(ids.acmeId, ids.lines[15], 'needs_review', 'substitution', 'needs_review', 'medium', 'Fasteners must match Type S screw requirement.', 'Quoted imported screw alternate.', 'The thread type appears comparable, but product data should be reviewed before accepting the alternate.')]))
  if (ids.buildcoId) reports.push(report(ids.buildcoId, rfqId, 'violation', [item(ids.buildcoId, ids.lines[34], 'violation', 'substitution', 'not_up_to_spec', 'high', 'Moisture resistant board required in wet-area walls.', 'Quoted non-basis-of-design board alternate.', 'The alternate board lacks the requested moisture-resistant basis-of-design documentation.')]))
  if (ids.metroId) reports.push(report(ids.metroId, rfqId, 'needs_review', [item(ids.metroId, ids.lines[63], 'needs_review', 'substitution', 'needs_review', 'medium', 'Sealant must match the rated assembly listing.', 'Quoted alternate sealant requiring submittal review.', 'The alternate should not be treated as clean until the listing and product data are confirmed.')]))
  for (const next of reports) {
    const bid = bids.find((candidate) => candidate.id === next.bid_id)
    if (bid) bid.spec_compliance_report = next
  }
}

function report(bidId: string, rfqId: string, status: 'violation' | 'needs_review', items: BidSpecComplianceItem[]): BidSpecComplianceReport {
  return { id: 0, bid_id: bidId, rfq_id: rfqId, project_id: 'project-building-14-demo', status: 'complete', summary_status: status, high_severity_count: items.filter((entry) => entry.status === 'violation' && entry.severity === 'high').length, checked_at: now, model: 'demo-fixture', items }
}

function item(bidId: string, lineId: string | undefined, status: BidSpecComplianceItemStatus, reviewKind: BidSpecComplianceReviewKind, verdict: BidSpecComplianceSubstitutionVerdict, severity: 'low' | 'medium' | 'high', requirement: string, vendorSummary: string, explanation: string): BidSpecComplianceItem {
  return { id: 0, report_id: 0, bid_id: bidId, rfq_line_item_id: lineId, status, review_kind: reviewKind, substitution_verdict: verdict, severity, requirement_summary: requirement, vendor_summary: vendorSummary, explanation, suggested_follow_up: 'Ask the vendor to provide product data and confirm compliance before award.', evidence: [{ document_name: 'Building 14 Drywall Specifications.pdf', page_start: 42, page_end: 42, section_number: '09 29 00', section_title: 'Gypsum Board', quote: requirement }], retrieval_diagnostics: { skipped_reason: 'Demo fixture evidence.' }, product_lookup: { status: 'skipped' }, created_at: now }
}
