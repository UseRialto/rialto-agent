'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Check, Clock3, Columns3, Eraser, FileSpreadsheet, Lightbulb, Loader2, Plus, Redo2, RefreshCw, Rows3, Trash2, Undo2, UploadCloud } from 'lucide-react'
import type { ContractorBid, ContractorRFQ } from '@/lib/types/contractor'
import type { BidSpecComplianceEvidence, BidSpecComplianceItem, ProjectSpecDocumentSummary } from '@/lib/types/procurement'
import { buildLiveQuoteComparisonSummary } from '@/lib/procurement/quote-comparison'
import { submitComparisonExport, type ComparisonExportFormat } from '@/lib/procurement/comparison-export-client'
import { workbookVersionMetadataFromApprovedComparisonPatch } from '@/lib/procurement/comparison-agent-tools'
import { buildComparisonSheetSnapshot } from '@/lib/procurement/comparison-sheet-snapshot'
import {
  buildQuoteImportAnalyticsHighlights,
  DEFAULT_MAJOR_UNIT_PRICE_DIFFERENCE_PCT,
  IMPORT_REVIEW_HIGHLIGHT,
  importReviewCategoryFromHighlightId,
  importReviewCategoryLabel,
  PRICING_MISTAKE_HIGHLIGHT,
} from '@/lib/procurement/comparison-analytics'
import { uploadRequestAttachmentFile } from '@/lib/files/blob-client-upload'
import {
  addNegotiationMessageAction,
  createRemainderRFQAction,
  rerunBidSpecComplianceAction,
  updateBidDecisionAction,
} from '@/lib/actions/contractor'
import { applyPatch, useComparisonSheetView, type ComparisonViewPatch, type ManualColumn, type ManualLineItem } from './comparison-sheet-view'
import { BidComparisonAssistant } from './BidComparisonAssistant'

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return `$${n.toLocaleString()}`
}

function coveragePct(bid: ContractorBid) {
  return Math.round((bid.fulfillment_summary?.coverage_ratio ?? 1) * 100)
}

function sourceLabel(bid: ContractorBid) {
  if (bid.source === 'email') return 'Email'
  if (bid.source === 'magic_form') return 'Magic Form'
  if (bid.is_invited) return 'Invited'
  return 'Marketplace'
}

function decisionLabel(status: ContractorBid['buyer_decision_status']) {
  if (!status) return ''
  if (status === 'do_not_use') return 'Pass'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function workbookVersionSourceLabel(source: string) {
  if (source === 'agent-proposal') return 'AI edit'
  if (source === 'estimator-edit') return 'User edit'
  if (source === 'vendor-merge') return 'Vendor merge'
  if (source === 'restore') return 'Restore'
  return source.replace(/-/g, ' ')
}

function workbookVersionActorLabel(version: { source: string; actorName?: string; actorUserId?: string }) {
  if (version.source === 'agent-proposal') {
    return version.actorName ? `${version.actorName}` : 'Rialto AI'
  }
  return version.actorName ?? version.actorUserId ?? 'Unknown user'
}

function sourceFilenameFromUrl(url: string) {
  try {
    const pathname = url.startsWith('http') ? new URL(url).pathname : url
    return decodeURIComponent((pathname.split('/').pop() ?? url).replace(/^\d+-/, '')) || 'Source file'
  } catch {
    return url
  }
}

function isPdfSourceFile(url: string) {
  try {
    const pathname = url.startsWith('http') ? new URL(url).pathname : url.split('?')[0]
    return pathname.toLowerCase().endsWith('.pdf')
  } catch {
    return url.toLowerCase().split('?')[0].endsWith('.pdf')
  }
}

function SourceFilePreview({ url }: { url: string }) {
  if (isPdfSourceFile(url)) return <PdfSourcePreview url={url} />

  return (
    <iframe
      title={`Source file ${sourceFilenameFromUrl(url)}`}
      src={url}
      className="min-h-0 flex-1 bg-white"
    />
  )
}

function PdfSourcePreview({ url }: { url: string }) {
  return (
    <div className="min-h-0 flex-1 bg-[#f4f6f5]">
      <object
        data={url}
        type="application/pdf"
        className="h-full min-h-0 w-full"
        aria-label={`Source PDF ${sourceFilenameFromUrl(url)}`}
      >
        <div className="flex h-full min-h-80 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm font-semibold" style={{ color: '#587067' }}>
            This browser could not show the PDF preview inline.
          </p>
          <div className="flex items-center gap-2">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="rounded-md px-3 py-2 text-xs font-bold text-white"
              style={{ background: '#1e3a2f' }}
            >
              Open Source File
            </a>
            <a
              href={url}
              download={sourceFilenameFromUrl(url)}
              className="rounded-md border bg-white px-3 py-2 text-xs font-bold"
              style={{ borderColor: '#d9e0dc', color: '#4a6358' }}
            >
              Download
            </a>
          </div>
        </div>
      </object>
    </div>
  )
}

const DECISION_STYLES: Record<NonNullable<ContractorBid['buyer_decision_status']>, { label: string; bg: string; text: string; border: string }> = {
  preferred: { label: 'Preferred', bg: '#1e3a2f', text: '#ffffff', border: '#1e3a2f' },
  alternate: { label: 'Alternate', bg: '#4a6358', text: '#ffffff', border: '#4a6358' },
  hold: { label: 'Hold', bg: '#a85c2a', text: '#ffffff', border: '#a85c2a' },
  do_not_use: { label: 'Pass', bg: '#ffffff', text: '#8b2e2e', border: '#e8b4b4' },
}

const VENDOR_CHART_COLORS = [
  '#2d6a4f',
  '#fa6b04',
  '#4b6f8f',
  '#a85c2a',
  '#7c5c9e',
  '#c0392b',
  '#3f7f7f',
  '#8a6f3d',
  '#4a6358',
  '#b4577a',
]

const SUBSTITUTION_ATTACHMENTS_KEY = 'substitution_attachments'

type BidLineItemResponse = ContractorBid['line_item_responses'][number]
type RFQLineItem = ContractorRFQ['line_items'][number]

interface SubstitutionAttachment {
  filename: string
  url?: string
  sizeBytes?: number
  contentType?: string
}

function vendorColorKey(bid: ContractorBid) {
  const name = bid.vendor_name.trim().toLowerCase()
  return name || bid.vendor_id || bid.vendor_email?.toLowerCase() || bid.id
}

function buildVendorColorMap(bids: ContractorBid[]) {
  const keys = Array.from(new Set(bids.map(vendorColorKey))).sort((a, b) => a.localeCompare(b))
  const colorByKey = new Map(keys.map((key, index) => [key, VENDOR_CHART_COLORS[index % VENDOR_CHART_COLORS.length]]))
  return Object.fromEntries(bids.map((bid) => [bid.id, colorByKey.get(vendorColorKey(bid)) ?? VENDOR_CHART_COLORS[0]]))
}

function CoverageBadge({ bid }: { bid: ContractorBid }) {
  const full = !bid.fulfillment_summary?.partial && (bid.fulfillment_summary?.coverage_ratio ?? 1) >= 1
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={full
        ? { background: '#e8f4ee', color: '#2d6a4f', outline: '1px solid #a8d5ba' }
        : { background: '#fdf0e8', color: '#a85c2a', outline: '1px solid #e8c4a0' }}
    >
      {full ? 'Full Quote' : `Partial · ${coveragePct(bid)}%`}
    </span>
  )
}

function specComplianceLabel(bid: ContractorBid) {
  const status = bid.spec_compliance_report?.summary_status
  if (!status) return 'Pending'
  if (status === 'no_specs_available') return 'No specs'
  if (status === 'no_spec_found') return 'No spec found'
  if (status === 'not_quoted') return 'Not quoted'
  if (status === 'needs_review') return 'Needs review'
  if (status === 'violation') return 'Violation'
  if (status === 'failed') return 'Failed'
  return 'Compliant'
}

function SpecComplianceBadge({ bid }: { bid: ContractorBid }) {
  const status = bid.spec_compliance_report?.summary_status
  const style =
    status === 'violation'
      ? { background: '#fdeaea', color: '#c0392b', border: '#f5c6c6' }
      : status === 'needs_review' || !status || status === 'failed'
        ? { background: '#fdf0e8', color: '#a85c2a', border: '#e8c4a0' }
        : status === 'compliant'
          ? { background: '#e8f4ee', color: '#2d6a4f', border: '#a8d5ba' }
          : { background: '#ede8e2', color: '#4a6358', border: '#e2d9cf' }

  return (
    <span className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold" style={style}>
      {specComplianceLabel(bid)}
    </span>
  )
}

function compactTooltipText(value?: string, limit = 520) {
  if (!value) return ''
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > limit ? `${normalized.slice(0, limit - 1).trim()}...` : normalized
}

function SmartTooltip({
  tooltip,
  children,
}: {
  tooltip?: string
  children: ReactNode
}) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const displayTooltip = compactTooltipText(tooltip)

  function showTooltip(target: HTMLElement) {
    if (!displayTooltip) return
    const rect = target.getBoundingClientRect()
    const width = Math.min(420, window.innerWidth - 24)
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12)
    const below = rect.bottom + 10
    const top = below + 220 > window.innerHeight ? Math.max(12, rect.top - 230) : below
    setPosition({ top, left })
  }

  return (
    <span
      className="inline-flex"
      onMouseEnter={(event) => showTooltip(event.currentTarget)}
      onMouseLeave={() => setPosition(null)}
      onFocus={(event) => showTooltip(event.currentTarget)}
      onBlur={() => setPosition(null)}
    >
      {children}
      {displayTooltip && position && typeof document !== 'undefined' && createPortal(
        <span
          className="pointer-events-none fixed z-[100] max-h-56 overflow-auto whitespace-pre-line rounded-xl px-3 py-2 text-[11px] font-medium leading-relaxed shadow-2xl"
          style={{
            top: position.top,
            left: position.left,
            width: Math.min(420, window.innerWidth - 24),
            background: '#1e3a2f',
            color: '#ffffff',
            border: '1px solid #4a6358',
          }}
        >
          {displayTooltip}
        </span>,
        document.body,
      )}
    </span>
  )
}

function SpecComplianceControl({
  bid,
  onRecheck,
  disabled,
  busy,
}: {
  bid: ContractorBid
  onRecheck: (bid: ContractorBid) => void
  disabled: boolean
  busy: boolean
}) {
  const report = bid.spec_compliance_report
  const tooltip = report
    ? [
        `${specComplianceLabel(bid)}${report.high_severity_count > 0 ? ` · ${report.high_severity_count} high-severity issue${report.high_severity_count === 1 ? '' : 's'}` : ''}`,
        compactTooltipText(report.items.find((item) => item.status === 'violation')?.explanation, 360),
        compactTooltipText(report.items.find((item) => item.status === 'needs_review')?.explanation, 360),
        compactTooltipText(report.items.find((item) => item.status === 'no_spec_found')?.explanation, 360),
      ].filter(Boolean).join('\n')
    : 'Spec AI is pending for this quote.'

  return (
    <span className="inline-flex items-center gap-1.5">
      <SmartTooltip tooltip={tooltip}>
        <SpecComplianceBadge bid={bid} />
      </SmartTooltip>
      <button
        type="button"
        aria-label={`Recheck specs for ${bid.vendor_name}`}
        disabled={disabled || busy}
        onClick={() => onRecheck(bid)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs disabled:opacity-60"
        style={{ background: '#f5f0eb', borderColor: '#e2d9cf', color: '#4a6358' }}
      >
        <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
      </button>
    </span>
  )
}

function lineSpecFinding(bid: ContractorBid, lineItemId: string) {
  const findings = bid.spec_compliance_report?.items.filter((item) => item.rfq_line_item_id === lineItemId) ?? []
  return findings.find((item) => item.review_kind === 'substitution') ?? findings[0]
}

type SpecCheckState = 'Verified' | 'Violation' | 'Pending' | 'Up To Spec'

function specCheckStateFromFinding(finding?: BidSpecComplianceItem): SpecCheckState {
  if (finding?.substitution_verdict === 'up_to_spec') return 'Up To Spec'
  if (finding?.status === 'violation') return 'Violation'
  if (finding?.status === 'compliant') return 'Verified'
  return 'Pending'
}

function specCheckStyle(state: SpecCheckState) {
  if (state === 'Violation') return { background: '#fdeaea', color: '#c0392b', border: '#f5c6c6' }
  if (state === 'Verified' || state === 'Up To Spec') return { background: '#e8f4ee', color: '#2d6a4f', border: '#a8d5ba' }
  return { background: '#ede8e2', color: '#4a6358', border: '#e2d9cf' }
}

function specFindingTooltip(finding?: ReturnType<typeof lineSpecFinding>) {
  if (!finding) return 'Spec check is pending for this line item.'
  const evidence = finding.evidence?.[0]
  const evidenceText = evidence
    ? `${evidence.document_name}, p. ${evidence.page_start}${evidence.page_end !== evidence.page_start ? `-${evidence.page_end}` : ''}`
    : ''
  return [
    finding.review_kind === 'substitution'
      ? `Substitution verdict: ${finding.substitution_verdict === 'up_to_spec' ? 'up to spec' : 'not up to spec'}`
      : '',
    compactTooltipText(finding.explanation, 260),
    finding.requirement_summary ? `Spec: ${compactTooltipText(finding.requirement_summary, 140)}` : '',
    finding.vendor_summary ? `Vendor: ${compactTooltipText(finding.vendor_summary, 140)}` : '',
    evidenceText ? `Evidence: ${evidenceText}` : '',
  ].filter(Boolean).join('\n')
}

function SpecCheckBadge({
  state,
  tooltip,
  small = false,
}: {
  state: SpecCheckState
  tooltip?: string
  small?: boolean
}) {
  return (
    <SmartTooltip tooltip={tooltip}>
      <span
        className={`inline-flex rounded-full border font-bold ${small ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'}`}
        style={specCheckStyle(state)}
      >
        {state}
      </span>
    </SmartTooltip>
  )
}

function LineSpecBadge({ bid, lineItemId }: { bid: ContractorBid; lineItemId: string }) {
  const finding = lineSpecFinding(bid, lineItemId)
  return <SpecCheckBadge state={specCheckStateFromFinding(finding)} tooltip={specFindingTooltip(finding)} small />
}

function substitutionVerdictLabel(finding?: BidSpecComplianceItem) {
  if (finding?.substitution_verdict === 'up_to_spec') return 'Up-To-Spec Substitution'
  if (finding?.substitution_verdict === 'not_up_to_spec') return 'Not Up To Spec'
  if (finding?.substitution_verdict === 'needs_review') return 'Not Up To Spec'
  return 'Substitution'
}

function parseSubstitutionAttachments(response?: BidLineItemResponse): SubstitutionAttachment[] {
  const rawValue = response?.response_attributes?.find((attribute) => attribute.key === SUBSTITUTION_ATTACHMENTS_KEY)?.value
  if (!rawValue) return []
  try {
    const parsed = JSON.parse(rawValue) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((file): SubstitutionAttachment | undefined => {
        if (!file || typeof file !== 'object') return undefined
        const record = file as Record<string, unknown>
        const filename = typeof record.filename === 'string'
          ? record.filename
          : typeof record.name === 'string'
            ? record.name
            : ''
        if (!filename.trim()) return undefined
        const attachment: SubstitutionAttachment = { filename: filename.trim() }
        if (typeof record.url === 'string') attachment.url = record.url
        if (typeof record.size === 'number') attachment.sizeBytes = record.size
        if (typeof record.sizeBytes === 'number') attachment.sizeBytes = record.sizeBytes
        if (typeof record.contentType === 'string') attachment.contentType = record.contentType
        if (typeof record.type === 'string') attachment.contentType = record.type
        return attachment
      })
      .filter((file): file is SubstitutionAttachment => Boolean(file))
  } catch {
    return []
  }
}

function substitutionAttachmentText(attachments: SubstitutionAttachment[]) {
  if (attachments.length === 0) return 'None uploaded'
  return attachments.map((file) => file.url ? `${file.filename} (${file.url})` : file.filename).join(', ')
}

function substitutionPacketLines(item: RFQLineItem, response: BidLineItemResponse) {
  const attachments = parseSubstitutionAttachments(response)
  const alternateItem = response.description || response.sku || 'Not provided'
  const difference = response.quoted_product_details || response.substitution_notes || response.notes || 'Not provided'
  return [
    `Requested item: ${item.description}${item.sku ? ` (${item.sku})` : ''}`,
    `Alternate item: ${alternateItem}${response.sku ? ` (${response.sku})` : ''}`,
    `Difference / reason: ${compactTooltipText(difference, 420)}`,
    response.substitution_notes && response.substitution_notes !== response.quoted_product_details
      ? `Vendor note: ${compactTooltipText(response.substitution_notes, 300)}`
      : '',
    `Attachments: ${substitutionAttachmentText(attachments)}`,
  ].filter(Boolean)
}

function substitutionCellTooltip(item: RFQLineItem, response: BidLineItemResponse, finding?: BidSpecComplianceItem, fallback?: string) {
  const evidence = finding?.evidence?.[0]
  const evidenceText = evidence
    ? `${evidence.document_name}, p. ${evidence.page_start}${evidence.page_end !== evidence.page_start ? `-${evidence.page_end}` : ''}`
    : ''
  return [
    ...substitutionPacketLines(item, response),
    '',
    `Spec verdict: ${substitutionVerdictLabel(finding)}`,
    finding?.explanation ? `Spec reasoning: ${compactTooltipText(finding.explanation, 520)}` : fallback,
    finding?.requirement_summary ? `Spec: ${compactTooltipText(finding.requirement_summary, 180)}` : '',
    finding?.vendor_summary ? `Vendor facts: ${compactTooltipText(finding.vendor_summary, 180)}` : '',
    evidenceText ? `Relevant lines: ${evidenceText}` : '',
  ].filter(Boolean).join('\n')
}

function specDocumentUrlForEvidence(evidence: BidSpecComplianceEvidence, specDocuments: ProjectSpecDocumentSummary[]) {
  if (evidence.document_id) {
    const byId = specDocuments.find((document) => document.id === evidence.document_id)
    if (byId?.file_url) return byId.file_url
  }
  const evidenceName = evidence.document_name.trim().toLowerCase()
  return specDocuments.find((document) => document.filename.trim().toLowerCase() === evidenceName)?.file_url
}

function specDocumentHrefForEvidence(evidence: BidSpecComplianceEvidence, specDocuments: ProjectSpecDocumentSummary[]) {
  const url = specDocumentUrlForEvidence(evidence, specDocuments)
  if (!url) return undefined
  const separator = url.includes('#') ? '&' : '#'
  return `${url}${separator}page=${evidence.page_start}`
}

function SubstitutionPacketSummary({ item, response }: { item: RFQLineItem; response: BidLineItemResponse }) {
  const attachments = parseSubstitutionAttachments(response)
  const difference = response.quoted_product_details || response.substitution_notes || response.notes || 'Not provided'
  return (
    <div className="mt-2 rounded border bg-white px-3 py-2 text-[11px] leading-relaxed" style={{ borderColor: '#d9e0dc', color: '#4a6358' }}>
      <div className="grid gap-1 md:grid-cols-2">
        <p>
          <span className="font-bold" style={{ color: '#1e3a2f' }}>Alternate item:</span>{' '}
          {response.description || 'Not provided'}{response.sku ? ` (${response.sku})` : ''}
        </p>
        <p>
          <span className="font-bold" style={{ color: '#1e3a2f' }}>Requested item:</span>{' '}
          {item.description}{item.sku ? ` (${item.sku})` : ''}
        </p>
      </div>
      <p className="mt-1">
        <span className="font-bold" style={{ color: '#1e3a2f' }}>Difference / reason:</span>{' '}
        {difference}
      </p>
      {response.substitution_notes && response.substitution_notes !== response.quoted_product_details && (
        <p className="mt-1">
          <span className="font-bold" style={{ color: '#1e3a2f' }}>Vendor note:</span>{' '}
          {response.substitution_notes}
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span className="font-bold" style={{ color: '#1e3a2f' }}>Attachments:</span>
        {attachments.length === 0 ? (
          <span>None uploaded</span>
        ) : attachments.map((file) => file.url ? (
          <a key={`${file.filename}-${file.url}`} href={file.url} target="_blank" rel="noreferrer" className="rounded border px-1.5 py-0.5 font-semibold underline-offset-2 hover:underline" style={{ borderColor: '#d9e0dc', color: '#2d6a4f' }}>
            {file.filename}
          </a>
        ) : (
          <span key={file.filename} className="rounded border px-1.5 py-0.5 font-semibold" style={{ borderColor: '#d9e0dc', color: '#587067' }}>
            {file.filename}
          </span>
        ))}
      </div>
    </div>
  )
}

function SpecComplianceCaption({ bid }: { bid: ContractorBid }) {
  const report = bid.spec_compliance_report
  if (!report) {
    return (
      <p className="text-[11px] font-medium" style={{ color: '#a85c2a' }}>
        Spec RAG has not produced a report yet. Refresh after quote submission.
      </p>
    )
  }

  const checkedAt = new Date(report.checked_at).toLocaleString()
  const findingCount = report.items.length
  const notQuotedCount = report.items.filter((item) => item.status === 'not_quoted').length
  const evaluatedCount = Math.max(0, findingCount - notQuotedCount)
  const issueText = report.high_severity_count > 0
    ? ` · ${report.high_severity_count} high-severity issue${report.high_severity_count === 1 ? '' : 's'}`
    : ''
  const skippedText = notQuotedCount > 0
    ? ` · ${notQuotedCount} not quoted`
    : ''
  const modelText = report.model ? ` · ${report.model}` : ''

  return (
    <p className="text-[11px] font-medium" style={{ color: '#8a9e96' }}>
      Spec RAG evaluated {evaluatedCount} quoted line item{evaluatedCount === 1 ? '' : 's'} at {checkedAt}{skippedText}{issueText}{modelText}
    </p>
  )
}

function SourceBadge({ bid }: { bid: ContractorBid }) {
  const label = sourceLabel(bid)
  const style = bid.source === 'magic_form'
    ? { background: '#fff3eb', color: '#fa6b04' }
    : bid.is_invited
      ? { background: '#fdf0e8', color: '#a85c2a' }
      : { background: '#ede8e2', color: '#4a6358' }

  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={style}>
      {label}
    </span>
  )
}

function getVendorContact(rfq: ContractorRFQ, bid: ContractorBid) {
  if (bid.designer_name?.trim()) return bid.designer_name.trim()
  const invite = rfq.invites?.find((entry) =>
    (bid.vendor_id && entry.vendor_id === bid.vendor_id) ||
    (bid.vendor_email && entry.vendor_email?.toLowerCase() === bid.vendor_email.toLowerCase()) ||
    entry.vendor_name === bid.vendor_name
  )
  const inviteName = [invite?.vendor_first_name, invite?.vendor_last_name].filter(Boolean).join(' ').trim()
  if (inviteName) return inviteName
  if (bid.vendor_email) return bid.vendor_email.split('@')[0].replace(/[._-]+/g, ' ')
  return 'Procurement contact'
}

function escapeHtml(value: string | number | undefined | null) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function slugifyFilePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'po-packet'
}

function safeFilePart(value: string) {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90) || 'Project'
}

function xmlEscape(value: string | number | undefined | null) {
  return escapeHtml(value).replace(/\r?\n/g, '&#10;')
}

function csvSafeText(value: string | number | undefined | null) {
  return String(value ?? '').replace(/\r?\n/g, ' ').trim()
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let crc = index
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  }
  return crc >>> 0
})

function crc32(data: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function uint16(value: number) {
  return [value & 0xff, (value >>> 8) & 0xff]
}

function uint32(value: number) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]
}

function concatBytes(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const output = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

function encodeText(value: string) {
  return new TextEncoder().encode(value)
}

function createZipBlob(files: { path: string; data: Uint8Array | Blob | string }[]) {
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const file of files) {
    const name = encodeText(file.path)
    const data = typeof file.data === 'string'
      ? encodeText(file.data)
      : file.data instanceof Blob
        ? new Uint8Array()
        : file.data
    const checksum = crc32(data)
    const localHeader = new Uint8Array([
      ...uint32(0x04034b50),
      ...uint16(20),
      ...uint16(0x0800),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint32(checksum),
      ...uint32(data.length),
      ...uint32(data.length),
      ...uint16(name.length),
      ...uint16(0),
    ])
    const centralHeader = new Uint8Array([
      ...uint32(0x02014b50),
      ...uint16(20),
      ...uint16(20),
      ...uint16(0x0800),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint32(checksum),
      ...uint32(data.length),
      ...uint32(data.length),
      ...uint16(name.length),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint32(0),
      ...uint32(offset),
    ])
    localParts.push(localHeader, name, data)
    centralParts.push(centralHeader, name)
    offset += localHeader.length + name.length + data.length
  }

  const centralDirectory = concatBytes(centralParts)
  const centralOffset = offset
  const end = new Uint8Array([
    ...uint32(0x06054b50),
    ...uint16(0),
    ...uint16(0),
    ...uint16(files.length),
    ...uint16(files.length),
    ...uint32(centralDirectory.length),
    ...uint32(centralOffset),
    ...uint16(0),
  ])

  const zipBytes = concatBytes([...localParts, centralDirectory, end])
  const zipBuffer = zipBytes.buffer.slice(zipBytes.byteOffset, zipBytes.byteOffset + zipBytes.byteLength) as ArrayBuffer
  return new Blob([zipBuffer], { type: 'application/zip' })
}

async function blobToBytes(blob: Blob) {
  return new Uint8Array(await blob.arrayBuffer())
}

function createXlsxBlob(sheetName: string, rows: (string | number)[][]) {
  const safeSheetName = sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet'
  const worksheetRows = rows.map((row, rowIndex) => `
    <row r="${rowIndex + 1}">
      ${row.map((value, colIndex) => {
        const cell = `${String.fromCharCode(65 + colIndex)}${rowIndex + 1}`
        if (typeof value === 'number' && Number.isFinite(value)) {
          return `<c r="${cell}"${rowIndex === 0 ? ' s="1"' : ''}><v>${value}</v></c>`
        }
        return `<c r="${cell}" t="inlineStr"${rowIndex === 0 ? ' s="1"' : ''}><is><t>${xmlEscape(csvSafeText(value))}</t></is></c>`
      }).join('')}
    </row>
  `).join('')

  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0" showGridLines="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18" />
  <cols>${Array.from({ length: Math.max(...rows.map((row) => row.length), 1) }, (_, index) => `<col min="${index + 1}" max="${index + 1}" width="${index === 0 ? 34 : 18}" customWidth="1" />`).join('')}</cols>
  <sheetData>${worksheetRows}</sheetData>
  <autoFilter ref="A1:${String.fromCharCode(64 + Math.max(...rows.map((row) => row.length), 1))}${Math.max(rows.length, 1)}"/>
</worksheet>`
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="${xmlEscape(safeSheetName)}" sheetId="1" r:id="rId1" /></sheets>
</workbook>`
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><color theme="1"/><name val="Aptos"/></font>
    <font><b/><sz val="11"/><color rgb="FF1E3A2F"/><name val="Aptos"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEDE8E2"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFE2D9CF"/></left><right style="thin"><color rgb="FFE2D9CF"/></right><top style="thin"><color rgb="FFE2D9CF"/></top><bottom style="thin"><color rgb="FFE2D9CF"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`

  return createZipBlob([
    { path: '[Content_Types].xml', data: contentTypes },
    { path: '_rels/.rels', data: rels },
    { path: 'xl/workbook.xml', data: workbook },
    { path: 'xl/_rels/workbook.xml.rels', data: workbookRels },
    { path: 'xl/styles.xml', data: styles },
    { path: 'xl/worksheets/sheet1.xml', data: worksheet },
  ])
}

async function createPdfBlob({
  title,
  eyebrow,
  meta,
  sections,
}: {
  title: string
  eyebrow: string
  meta?: [string, string][]
  sections: { heading: string; rows?: (string | number)[][]; body?: string[] }[]
}) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const pageW = 612
  const pageH = 792
  const margin = 44
  const contentW = pageW - margin * 2
  const green = rgb(0.12, 0.23, 0.18)
  const muted = rgb(0.42, 0.52, 0.48)
  const orange = rgb(0.98, 0.42, 0.02)
  const line = rgb(0.86, 0.82, 0.76)
  let page = pdfDoc.addPage([pageW, pageH])
  let y = pageH - margin

  function wrapPdfText(text: string, activeFont: typeof font, size: number, maxWidth: number, maxLines?: number) {
    const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
    const lines: string[] = []
    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (activeFont.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate
        continue
      }
      if (current) lines.push(current)
      current = word
      if (maxLines && lines.length >= maxLines) break
    }
    if ((!maxLines || lines.length < maxLines) && current) lines.push(current)
    if (maxLines && lines.length > maxLines) lines.length = maxLines
    if (maxLines && lines.length === maxLines && words.length > lines.join(' ').split(' ').length) {
      let last = lines[maxLines - 1]
      while (last.length > 1 && activeFont.widthOfTextAtSize(`${last}...`, size) > maxWidth) {
        last = last.slice(0, -1)
      }
      lines[maxLines - 1] = `${last}...`
    }
    return lines
  }

  function newPage() {
    page = pdfDoc.addPage([pageW, pageH])
    y = pageH - margin
  }

  function drawTextBlock(text: string, x: number, maxWidth: number, size = 10, useBold = false, color = green) {
    const activeFont = useBold ? bold : font
    const words = text.replace(/\s+/g, ' ').trim().split(' ')
    let current = ''
    const lines: string[] = []
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (activeFont.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate
      else {
        if (current) lines.push(current)
        current = word
      }
    }
    if (current) lines.push(current)
    for (const textLine of lines) {
      if (y < margin + 28) newPage()
      page.drawText(textLine, { x, y, size, font: activeFont, color })
      y -= size + 5
    }
  }

  function drawSectionHeading(heading: string) {
    if (y < margin + 70) newPage()
    y -= 8
    page.drawText(heading, { x: margin, y, size: 16, font: bold, color: green })
    y -= 10
    page.drawLine({ start: { x: margin, y }, end: { x: pageW - margin, y }, thickness: 1, color: line })
    y -= 18
  }

  page.drawText(eyebrow.toUpperCase(), { x: margin, y, size: 9, font: bold, color: orange })
  y -= 22
  drawTextBlock(title, margin, contentW, 24, true, green)
  y -= 8
  if (meta?.length) {
    const colGap = 12
    const colW = (contentW - colGap) / 2
    const boxH = 58
    meta.forEach(([label, value], index) => {
      const x = margin + (index % 2) * (colW + colGap)
      const blockY = y - Math.floor(index / 2) * (boxH + 10)
      page.drawRectangle({ x, y: blockY - boxH + 6, width: colW, height: boxH, borderColor: line, borderWidth: 0.7, color: rgb(0.98, 0.97, 0.95) })
      page.drawText(label, { x: x + 10, y: blockY - 12, size: 8, font: bold, color: muted })
      wrapPdfText(value, bold, 9.5, colW - 20, 2).forEach((metaLine, lineIndex) => {
        page.drawText(metaLine, { x: x + 10, y: blockY - 30 - lineIndex * 12, size: 9.5, font: bold, color: green })
      })
    })
    y -= Math.ceil(meta.length / 2) * (boxH + 10) + 8
  }

  for (const section of sections) {
    drawSectionHeading(section.heading)
    for (const paragraph of section.body ?? []) {
      drawTextBlock(paragraph, margin, contentW, 10, false, muted)
      y -= 4
    }
    if (section.rows?.length) {
      const colCount = Math.max(...section.rows.map((row) => row.length))
      const colWidths = colCount === 5
        ? [108, 160, 82, 82, 92]
        : colCount === 4
          ? [150, 130, 122, 122]
          : Array.from({ length: colCount }, () => contentW / colCount)
      section.rows.forEach((row, rowIndex) => {
        const rowCells = row.map((cell, cellIndex) => {
          const size = rowIndex === 0 ? 8 : 8.7
          return wrapPdfText(String(cell ?? ''), rowIndex === 0 ? bold : font, size, (colWidths[cellIndex] ?? contentW / colCount) - 14, rowIndex === 0 ? 1 : 3)
        })
        const maxCellLines = Math.max(...rowCells.map((cellLines) => cellLines.length), 1)
        const rowH = rowIndex === 0 ? 26 : Math.max(34, 16 + maxCellLines * 11)
        if (y < margin + rowH + 12) newPage()
        page.drawRectangle({
          x: margin,
          y: y - rowH + 8,
          width: contentW,
          height: rowH,
          borderColor: line,
          borderWidth: 0.4,
          color: rowIndex === 0 ? rgb(0.93, 0.91, 0.88) : rgb(1, 1, 1),
        })
        let cellX = margin
        rowCells.forEach((cellLines, colIndex) => {
          const cellW = colWidths[colIndex] ?? contentW / colCount
          page.drawLine({ start: { x: cellX, y: y + 8 }, end: { x: cellX, y: y - rowH + 8 }, thickness: 0.35, color: line })
          cellLines.forEach((cellLine, lineIndex) => {
            page.drawText(cellLine, {
              x: cellX + 7,
              y: y - 10 - lineIndex * 11,
              size: rowIndex === 0 ? 8 : 8.7,
              font: rowIndex === 0 ? bold : font,
              color: rowIndex === 0 ? muted : green,
            })
          })
          cellX += cellW
        })
        page.drawLine({ start: { x: margin + contentW, y: y + 8 }, end: { x: margin + contentW, y: y - rowH + 8 }, thickness: 0.35, color: line })
        y -= rowH
      })
      y -= 10
    }
  }

  const bytes = await pdfDoc.save()
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return new Blob([buffer], { type: 'application/pdf' })
}

function DocumentPreviewTile({
  title,
  subtitle,
  fileType,
  preview,
  children,
}: {
  title: string
  subtitle: string
  fileType: 'PDF' | 'XLSX'
  preview: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group rounded-2xl p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg"
        style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}
      >
        <div className="h-36 overflow-hidden rounded-xl shadow-inner" style={{ background: '#f8f6f3', border: '1px solid #e2d9cf' }}>
          <div className="origin-top-left scale-[0.48] p-6" style={{ width: 620 }}>
            {preview}
          </div>
        </div>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold" style={{ color: '#1e3a2f' }}>{title}</p>
            <p className="mt-0.5 line-clamp-2 text-xs" style={{ color: '#8a9e96' }}>{subtitle}</p>
          </div>
          <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide" style={{ background: '#fff3eb', color: '#fa6b04' }}>
            {fileType}
          </span>
        </div>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <button
            type="button"
            aria-label="Close document preview"
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div className="relative flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 px-6 py-4" style={{ borderBottom: '1px solid #e2d9cf' }}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: '#8a9e96' }}>Quote Comparison Document</p>
                <h3 className="mt-1 text-xl font-bold" style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}>{title}</h3>
                <p className="mt-1 text-sm" style={{ color: '#4a6358' }}>{subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-1.5 text-sm font-semibold"
                style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#4a6358' }}
              >
                Close
              </button>
            </div>
            <div className="overflow-y-auto p-6" style={{ background: '#f5f0eb' }}>
              <div className="mx-auto max-w-4xl rounded-2xl bg-white p-8 shadow-sm" style={{ border: '1px solid #e2d9cf' }}>
                {children}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function AvailabilityBadge({ availability }: { availability?: ContractorBid['line_item_responses'][number]['availability'] }) {
  if (availability === 'unavailable' || !availability) {
    return (
      <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: '#fdeaea', color: '#c98787' }}>
        Unavailable
      </span>
    )
  }
  if (availability === 'can_source') {
    return (
      <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: '#fdf0e8', color: '#a85c2a' }}>
        Needs sourcing
      </span>
    )
  }
  return (
    <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: '#e8f4ee', color: '#2d6a4f' }}>
      In stock
    </span>
  )
}

function shortItemName(item: ContractorRFQ['line_items'][number], response?: ContractorBid['line_item_responses'][number]) {
  const label = item.sku || response?.sku || item.description
  const cleaned = label.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= 26) return cleaned
  const words = cleaned.split(' ')
  const short = words.slice(0, 4).join(' ')
  return short.length > 26 ? `${cleaned.slice(0, 23)}...` : `${short}...`
}

function availableQuantity(
  item: ContractorRFQ['line_items'][number],
  response?: ContractorBid['line_item_responses'][number],
) {
  if (!response || response.availability === 'unavailable') return 0
  return response.units_available ?? response.quoted_quantity ?? response.quantity ?? item.quantity
}

function coverageColor(ratio: number, availability?: ContractorBid['line_item_responses'][number]['availability']) {
  if (availability === 'unavailable' || ratio <= 0) return '#c0392b'
  if (availability === 'can_source' || ratio < 1) return '#fa6b04'
  return '#2d6a4f'
}

function CoverageDial({
  available,
  requested,
  availability,
}: {
  available: number
  requested: number
  availability?: ContractorBid['line_item_responses'][number]['availability']
}) {
  const ratio = requested > 0 ? Math.min(available / requested, 1) : 0
  const radius = 13
  const stroke = 5
  const circumference = 2 * Math.PI * radius
  const color = coverageColor(ratio, availability)

  return (
    <span className="inline-flex items-center gap-2">
      <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
        <circle cx="17" cy="17" r={radius} fill="none" stroke="#ede8e2" strokeWidth={stroke} />
        <circle
          cx="17"
          cy="17"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - ratio)}
          strokeLinecap="round"
          transform="rotate(-90 17 17)"
        />
      </svg>
      <span>
        <span className="block text-xs font-bold" style={{ color }}>{Math.round(ratio * 100)}%</span>
        <span className="block text-[10px]" style={{ color: '#8a9e96' }}>{available.toLocaleString()} / {requested.toLocaleString()}</span>
      </span>
    </span>
  )
}

function ScorecardLineItemTable({ rfq, bid }: { rfq: ContractorRFQ; bid: ContractorBid }) {
  return (
    <div className="mt-2 overflow-hidden rounded-2xl" style={{ border: '1px solid #e2d9cf', background: '#ffffff' }}>
      <table className="w-full text-sm">
        <thead className="text-[10px] font-bold uppercase tracking-wider" style={{ background: '#ede8e2', color: '#8a9e96' }}>
          <tr>
            <th className="px-3 py-3 text-left">Item</th>
            <th className="px-3 py-3 text-left">Spec</th>
            <th className="px-3 py-3 text-left">Available</th>
            <th className="px-3 py-3 text-right">Unit Price</th>
            <th className="px-3 py-3 text-right">Total</th>
            <th className="px-3 py-3 text-right">Lead</th>
          </tr>
        </thead>
        <tbody>
          {rfq.line_items.map((item) => {
            const response = bid.line_item_responses.find((entry) => entry.line_item_id === item.id)
            const available = availableQuantity(item, response)
            const unavailable = !response || response.availability === 'unavailable'

            return (
              <tr key={`${bid.id}-scorecard-line-${item.id}`} style={{ borderTop: '1px solid #e2d9cf' }}>
                <td className="px-3 py-3">
                  <p className="text-xs font-bold leading-snug" style={{ color: unavailable ? '#8a9e96' : '#1e3a2f' }}>
                    {shortItemName(item, response)}
                  </p>
                  {!item.sku && response?.sku && (
                    <p className="mt-0.5 text-[10px]" style={{ color: '#8a9e96', fontFamily: 'var(--font-dm-mono, monospace)' }}>{response.sku}</p>
                  )}
                </td>
                <td className="px-3 py-3 align-top">
                  <LineSpecBadge bid={bid} lineItemId={item.id} />
                </td>
                <td className="px-3 py-3">
                  <CoverageDial available={available} requested={item.quantity} availability={response?.availability} />
                </td>
                <td className="px-3 py-3 text-right text-xs font-semibold" style={{ color: unavailable ? '#8a9e96' : '#1e3a2f' }}>
                  {unavailable ? '-' : fmt(response.unit_price)}
                </td>
                <td className="px-3 py-3 text-right text-xs font-bold" style={{ color: unavailable ? '#8a9e96' : '#1e3a2f' }}>
                  {unavailable ? '-' : fmt(response.total_price)}
                </td>
                <td className="px-3 py-3 text-right text-xs font-semibold" style={{ color: unavailable ? '#8a9e96' : '#4a6358' }}>
                  {unavailable ? '-' : `${response.lead_time_days}d`}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const DASHBOARD_SETTINGS_STORAGE_KEY = 'rialto.bidComparison.dashboardSettings.v1'
const DEFAULT_DASHBOARD_SETTINGS = {
  expandedLineItems: false,
}

function ExpandedLineItems({ rfq }: { rfq: ContractorRFQ }) {
  return (
    <div className="mb-6">
      <h2 className="mb-3 text-sm font-semibold" style={{ color: '#1e3a2f' }}>
        Expanded Line Items ({rfq.line_items.length})
      </h2>
      <div className="overflow-hidden rounded-2xl" style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}>
        <table className="w-full text-sm">
          <thead className="text-xs font-semibold uppercase tracking-wider" style={{ background: '#ede8e2', color: '#8a9e96' }}>
            <tr>
              <th className="px-4 py-2.5 text-left">SKU</th>
              <th className="px-4 py-2.5 text-left">Description</th>
              <th className="px-4 py-2.5 text-right">Qty</th>
              <th className="px-4 py-2.5 text-left">Unit</th>
              <th className="px-4 py-2.5 text-left">Budget/Unit</th>
              <th className="px-4 py-2.5 text-left">Lead Time</th>
            </tr>
          </thead>
          <tbody>
            {rfq.line_items.map((item) => (
              <tr key={item.id} style={{ borderTop: '1px solid #e2d9cf' }}>
                <td className="px-4 py-2.5 text-xs" style={{ fontFamily: 'var(--font-dm-mono, monospace)', color: '#4a6358' }}>{item.sku || '-'}</td>
                <td className="px-4 py-2.5" style={{ color: '#4a6358' }}>{item.description}</td>
                <td className="px-4 py-2.5 text-right" style={{ color: '#1e3a2f' }}>{item.quantity}</td>
                <td className="px-4 py-2.5" style={{ color: '#8a9e96' }}>{item.unit}</td>
                <td className="px-4 py-2.5" style={{ color: '#8a9e96' }}>
                  {item.contractor_budget != null ? `$${item.contractor_budget.toLocaleString()}` : '-'}
                </td>
                <td className="px-4 py-2.5" style={{ color: '#8a9e96' }}>
                  {item.suggested_lead_time_days != null ? `${item.suggested_lead_time_days}d` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rfq.line_items.some((item) => item.constraints || (item.attributes ?? []).some((attribute) => attribute.value)) && (
        <div className="mt-3 rounded-2xl p-4" style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>Detailed Constraints</p>
          <div className="space-y-3">
            {rfq.line_items.map((item) => (
              <div key={`constraints-${item.id}`}>
                <p className="text-sm font-medium" style={{ color: '#1e3a2f' }}>{item.description}</p>
                {item.constraints && <p className="mt-1 text-sm" style={{ color: '#4a6358' }}>{item.constraints}</p>}
                <div className="mt-1 flex flex-wrap gap-2">
                  {(item.attributes ?? []).filter((attribute) => attribute.value).map((attribute) => (
                    <span key={`${item.id}-${attribute.key}`} className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: '#fff3eb', color: '#fa6b04', border: '1px solid #fdc89a' }}>
                      {attribute.label}: {attribute.value}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function BidScorecardGrid({
  rfq,
  bids,
  onRecheckSpecCompliance,
  recheckDisabled,
  recheckingBidIds,
}: {
  rfq: ContractorRFQ
  bids: ContractorBid[]
  onRecheckSpecCompliance: (bid: ContractorBid) => void
  recheckDisabled: boolean
  recheckingBidIds: Record<string, boolean>
}) {
  const [showLineItems, setShowLineItems] = useState(false)
  const comparisonSummary = useMemo(() => buildLiveQuoteComparisonSummary(rfq, bids), [rfq, bids])
  const lowestBid = comparisonSummary.lowestCompleteBid
  const fastestBid = comparisonSummary.fastestBid
  const sorted = comparisonSummary.sortedBids

  function expandAllLineItems(anchor: HTMLElement) {
    setShowLineItems(true)
    window.requestAnimationFrame(() => {
      anchor.closest('article')?.scrollIntoView({ block: 'start' })
    })
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm font-semibold" style={{ color: '#4a6358' }}>
          {bids.length} quotes received <span style={{ color: '#8a9e96' }}>· {comparisonSummary.fullQuoteCount} full quotes</span>
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {sorted.map((bid) => {
          const isLowest = lowestBid?.id === bid.id
          const isFastest = fastestBid?.id === bid.id

          return (
            <article
              key={`scorecard-${bid.id}`}
              className="flex flex-col overflow-hidden rounded-2xl shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
              style={{
                background: '#ffffff',
                border: '1px solid #e2d9cf',
              }}
            >
              <div
                className="h-1 w-full"
                style={{ background: '#e2d9cf' }}
              />
              <div className="flex flex-1 flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold leading-tight" style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}>
                      {bid.vendor_name}
                    </h3>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <SourceBadge bid={bid} />
                      {bid.designer_name && <span className="text-[10px]" style={{ color: '#8a9e96' }}>{bid.designer_name}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {isLowest && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: '#fa6b04', color: '#fff' }}>Best Value</span>}
                    {isFastest && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: '#a85c2a', color: '#fff' }}>Fastest</span>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl px-4 py-3" style={{ background: '#ede8e2' }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>Total Price</p>
                    <p className="mt-1 text-2xl font-bold leading-none" style={{ color: bid.fulfillment_summary?.partial ? '#a85c2a' : '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}>
                      {fmt(bid.total_price)}
                    </p>
                  </div>
                  <div className="rounded-xl px-4 py-3" style={{ background: '#ede8e2' }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>Lead Time</p>
                    <p className="mt-1 text-2xl font-bold leading-none" style={{ color: isFastest ? '#a85c2a' : '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}>
                      {bid.lead_time_days}<span className="text-sm font-semibold" style={{ color: '#8a9e96' }}>d</span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <CoverageBadge bid={bid} />
                  <SpecComplianceControl
                    bid={bid}
                    onRecheck={onRecheckSpecCompliance}
                    disabled={recheckDisabled}
                    busy={Boolean(recheckingBidIds[bid.id])}
                  />
                  {bid.terms?.payment_terms && (
                    <span className="rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ border: '1px solid #e2d9cf', color: '#4a6358' }}>
                      {bid.terms.payment_terms}
                    </span>
                  )}
                </div>
                <SpecComplianceCaption bid={bid} />

                {(bid.compliance_declarations ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {bid.compliance_declarations?.map((entry) => (
                      <span key={`${bid.id}-compliance-${entry.code}`} className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: '#e8f4ee', color: '#2d6a4f' }}>
                        {entry.label}
                      </span>
                    ))}
                  </div>
                )}

                {(bid.risk_flags ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {bid.risk_flags?.map((flag) => (
                      <span key={`${bid.id}-risk-${flag.code}`} className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: '#fdf0e8', color: '#a85c2a' }}>
                        {flag.label}
                      </span>
                    ))}
                  </div>
                )}

                {!showLineItems ? (
                  <button
                    type="button"
                    onClick={(event) => expandAllLineItems(event.currentTarget)}
                    className="w-full rounded-xl py-2.5 text-xs font-bold transition-all"
                    style={{ border: '1px solid #e2d9cf', color: '#4a6358', background: 'transparent' }}
                    aria-expanded={showLineItems}
                  >
                    View {rfq.line_items.length} line item{rfq.line_items.length !== 1 ? 's' : ''}
                  </button>
                ) : (
                  <>
                    <ScorecardLineItemTable rfq={rfq} bid={bid} />
                    <button
                      type="button"
                      onClick={() => setShowLineItems(false)}
                      className="w-full rounded-xl py-2.5 text-xs font-bold transition-all"
                      style={{ border: '1px solid #e2d9cf', color: '#4a6358', background: 'transparent' }}
                      aria-expanded={showLineItems}
                    >
                      Hide {rfq.line_items.length} line item{rfq.line_items.length !== 1 ? 's' : ''}
                    </button>
                  </>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function colLetter(index: number) {
  let n = index
  let s = ''
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}

function moneyShort(value: number | null | undefined) {
  if (value == null) return ''
  return formatSheetMoney(value)
}

function parseSheetNumber(value: string | undefined) {
  const normalized = String(value ?? '').replace(/[$,\sA-Za-z]/g, '')
  const number = Number(normalized)
  return Number.isFinite(number) ? number : undefined
}

function formatSheetMoney(value: number) {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatUploadBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function uploadFileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`
}

interface SheetColumn {
  key: string
  label: string
  kind: 'rfq-core' | 'rfq-attribute' | 'rfq-standard' | 'vendor' | 'derived' | 'manual'
  align: 'left' | 'right' | 'center'
  defaultWidth: number
  vendorId?: string
  vendorName?: string
  vendorMetric?: 'unit_price' | 'total' | 'lead' | 'alternate' | 'response_attr'
  responseFieldKey?: string
  derivedFormula?: string
}

function insertColumnAfter(cols: SheetColumn[], col: SheetColumn, insertAfterColKey?: string): SheetColumn[] {
  if (insertAfterColKey === '__before_first__') return [col, ...cols]
  if (!insertAfterColKey) return [...cols, col]
  const idx = cols.findIndex((entry) => entry.key === insertAfterColKey)
  if (idx === -1) return [...cols, col]
  return [...cols.slice(0, idx + 1), col, ...cols.slice(idx + 1)]
}

function appendUniqueByKey<T extends { key: string }>(base: T[], additions: T[] = []): T[] {
  const seen = new Set(base.map((entry) => entry.key))
  const uniqueAdditions = additions.filter((entry) => {
    if (seen.has(entry.key)) return false
    seen.add(entry.key)
    return true
  })
  return [...base, ...uniqueAdditions]
}

function manualVendorColumnInfo(column: ManualColumn): { groupLabel: string; vendorId: string; vendorMetric: SheetColumn['vendorMetric']; label: string } | null {
  const keyMatch = column.key.match(/^(vendor-[^:]+):(unit_price|total|lead|alternate)$/)
  const metric = column.vendorMetric ?? (keyMatch?.[2] as SheetColumn['vendorMetric'] | undefined)
  if (!column.groupLabel && !keyMatch) return null
  const labelFromMetric =
    metric === 'unit_price' ? 'Unit Price'
      : metric === 'total' ? 'Total Price'
        : metric === 'lead' ? 'Lead Time'
          : metric === 'alternate' ? 'Alt'
            : column.label
  const groupLabel = column.groupLabel ?? inferVendorGroupLabel(column.label, metric)
  return {
    groupLabel,
    vendorId: `manual:${keyMatch?.[1] ?? manualGroupSlug(column.groupLabel ?? column.key)}`,
    vendorMetric: metric,
    label: column.groupLabel || keyMatch ? labelFromMetric : column.label,
  }
}

function inferVendorGroupLabel(label: string, metric: SheetColumn['vendorMetric']) {
  if (metric === 'unit_price') return label.replace(/\s+unit\s+price\s*$/i, '').trim() || label
  if (metric === 'total') return label.replace(/\s+total(?:\s+price)?\s*$/i, '').trim() || label
  if (metric === 'lead') return label.replace(/\s+lead\s+time\s*$/i, '').trim() || label
  if (metric === 'alternate') return label.replace(/\s+(?:alternate\s*\/\s*notes|alternate|alt|notes)\s*$/i, '').trim() || label
  return label
}

function manualGroupSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'vendor'
}

function buildColumns(rfq: ContractorRFQ, bids: ContractorBid[], derivedColumns: { key: string; label: string; formula: string; insertAfterColKey?: string }[], manualColumns: ManualColumn[] = []): SheetColumn[] {
  const cols: SheetColumn[] = []
  cols.push({ key: '__item', label: 'Item', kind: 'rfq-core', align: 'left', defaultWidth: 150 })
  cols.push({ key: '__desc', label: 'Description', kind: 'rfq-core', align: 'left', defaultWidth: 300 })
  cols.push({ key: '__qty_unit', label: 'Qty', kind: 'rfq-core', align: 'right', defaultWidth: 110 })

  for (const bid of bids) {
    cols.push({ key: `vendor:${bid.id}:unit_price`, label: 'Unit Price', kind: 'vendor', align: 'right', defaultWidth: 104, vendorId: bid.id, vendorName: bid.vendor_name, vendorMetric: 'unit_price' })
    cols.push({ key: `vendor:${bid.id}:total`, label: 'Total Price', kind: 'vendor', align: 'right', defaultWidth: 112, vendorId: bid.id, vendorName: bid.vendor_name, vendorMetric: 'total' })
    cols.push({ key: `vendor:${bid.id}:lead`, label: 'Lead Time', kind: 'vendor', align: 'right', defaultWidth: 96, vendorId: bid.id, vendorName: bid.vendor_name, vendorMetric: 'lead' })
    for (const field of (rfq.vendor_response_fields ?? []).filter((entry) => entry.visible !== false).slice().sort((a, b) => a.order - b.order)) {
      cols.push({
        key: `vendor:${bid.id}:response:${field.key}`,
        label: field.label,
        kind: 'vendor',
        align: field.inputType === 'number' ? 'right' : 'left',
        defaultWidth: 132,
        vendorId: bid.id,
        vendorName: bid.vendor_name,
        vendorMetric: 'response_attr',
        responseFieldKey: field.key,
      })
    }
  }

  for (const mc of manualColumns) {
    const vendorInfo = manualVendorColumnInfo(mc)
    const col: SheetColumn = vendorInfo
      ? {
          key: `manual:${mc.key}`,
          label: vendorInfo.label,
          kind: 'vendor',
          align: vendorInfo.vendorMetric === 'alternate' || vendorInfo.vendorMetric === 'lead' ? 'left' : 'right',
          defaultWidth: vendorInfo.vendorMetric === 'alternate' ? 150 : 130,
          vendorId: vendorInfo.vendorId,
          vendorName: vendorInfo.groupLabel,
          vendorMetric: vendorInfo.vendorMetric,
        }
      : { key: `manual:${mc.key}`, label: mc.label, kind: 'manual', align: 'left', defaultWidth: 130 }
    const anchor = mc.insertAfterColKey?.startsWith('manual:') ? mc.insertAfterColKey : mc.insertAfterColKey
    cols.splice(0, cols.length, ...insertColumnAfter(cols, col, anchor))
  }

  for (const dc of derivedColumns) {
    const col: SheetColumn = { key: `derived:${dc.key}`, label: dc.label, kind: 'derived', align: 'right', defaultWidth: 130, derivedFormula: dc.formula }
    cols.splice(0, cols.length, ...insertColumnAfter(cols, col, dc.insertAfterColKey))
  }
  return cols
}

function valueForCol(item: ContractorRFQ['line_items'][number], col: SheetColumn, bids: ContractorBid[]): string {
  if (col.kind === 'rfq-core') {
    if (col.key === '__item') return item.sku || item.id
    if (col.key === '__desc') return item.description
    if (col.key === '__qty_unit') return `${item.quantity.toLocaleString()} ${item.unit}`
    return ''
  }
  if (col.kind === 'rfq-standard') {
    if (col.key === '__specs') return item.specs ?? ''
    if (col.key === '__constraints') return item.constraints ?? ''
    if (col.key === '__certifications') return (item.certifications ?? []).join(', ')
    if (col.key === '__notes') return item.notes ?? ''
    if (col.key === '__target_budget') return item.contractor_budget != null ? `$${item.contractor_budget.toLocaleString()}` : ''
    if (col.key === '__suggested_lead') return item.suggested_lead_time_days != null ? `${item.suggested_lead_time_days}d` : ''
    return ''
  }
  if (col.kind === 'rfq-attribute') {
    const attrKey = col.key.replace(/^attr:/, '')
    return item.attributes?.find((a) => a.key === attrKey)?.value ?? ''
  }
  if (col.kind === 'vendor' && col.vendorId && col.vendorMetric) {
    const bid = bids.find((b) => b.id === col.vendorId)
    const response = bid?.line_item_responses.find((r) => r.line_item_id === item.id)
    if (!response || response.availability === 'unavailable') return ''
    if (col.vendorMetric === 'unit_price') return moneyShort(response.unit_price)
    if (col.vendorMetric === 'total') return moneyShort(response.total_price)
    if (col.vendorMetric === 'lead') return `${response.lead_time_days}d`
    if (col.vendorMetric === 'response_attr' && col.responseFieldKey) {
      return response.response_attributes?.find((attribute) => attribute.key === col.responseFieldKey)?.value ?? ''
    }
  }
  if (col.kind === 'manual') return ''
  if (col.kind === 'derived' && col.derivedFormula) {
    return evaluateDerived(col.derivedFormula, item, bids)
  }
  return ''
}

function computeSmartWidth(col: SheetColumn, items: ContractorRFQ['line_items'], bids: ContractorBid[]): number {
  const samples = items.map((item) => valueForCol(item, col, bids).length)
  const maxData = samples.length ? Math.max(...samples) : 0
  const labelLen = col.label.length
  const charW = 7.2
  const padding = 22
  // Column-kind specific bounds
  const bounds: Record<SheetColumn['kind'], { min: number; max: number }> = {
    'rfq-core': col.key === '__desc' ? { min: 260, max: 420 } : col.key === '__item' ? { min: 120, max: 190 } : { min: 90, max: 150 },
    'rfq-standard': { min: 70, max: 220 },
    'rfq-attribute': { min: 70, max: 200 },
    'vendor': { min: 80, max: 140 },
    'derived': { min: 90, max: 160 },
    'manual': { min: 90, max: 200 },
  }
  const { min, max } = bounds[col.kind] ?? { min: 70, max: 200 }

  // If every cell is empty, base purely on a snug label width (cap shorter than max).
  if (maxData === 0) {
    const labelOnly = labelLen * charW + padding
    return Math.round(Math.max(min, Math.min(120, labelOnly)))
  }
  const widest = Math.max(maxData, labelLen) * charW + padding
  return Math.round(Math.max(min, Math.min(max, widest)))
}

function evaluateDerived(formula: string, item: ContractorRFQ['line_items'][number], bids: ContractorBid[]): string {
  const divideColumn = formula.trim().match(/^divide\(column\.([^,]+),\s*([0-9.]+)\)$/i)
  if (divideColumn) {
    const source = divideColumn[1]
    const divisor = Number(divideColumn[2])
    const value = source === '__qty_unit' ? item.quantity : null
    if (value == null || !Number.isFinite(value) || !Number.isFinite(divisor) || divisor === 0) return ''
    return (value / divisor).toLocaleString(undefined, { maximumFractionDigits: 3 })
  }
  const copyColumn = formula.trim().match(/^copy\(column\.([^)]+)\)$/i)
  if (copyColumn) {
    if (copyColumn[1] === '__qty_unit') return `${item.quantity.toLocaleString()} ${item.unit}`
    if (copyColumn[1] === '__item') return item.sku || item.id
    if (copyColumn[1] === '__desc') return item.description
  }
  const responses = bids.map((bid) => bid.line_item_responses.find((r) => r.line_item_id === item.id)).filter((r): r is NonNullable<typeof r> => Boolean(r) && r!.availability !== 'unavailable')
  const lookup: Record<string, number[]> = {
    'vendor.unit_price': responses.map((r) => r.unit_price),
    'vendor.total': responses.map((r) => r.total_price),
    'vendor.lead': responses.map((r) => r.lead_time_days),
    'vendor.lead_time': responses.map((r) => r.lead_time_days),
  }
  const match = formula.trim().match(/^(min|max|avg|spread)\((.+)\)$/i)
  if (!match) return ''
  const fn = match[1].toLowerCase()
  const seriesKey = match[2].trim()
  const values = lookup[seriesKey] ?? []
  if (values.length === 0) return ''
  if (fn === 'min') {
    const v = Math.min(...values)
    return seriesKey === 'vendor.lead' || seriesKey === 'vendor.lead_time' ? `${v}d` : moneyShort(v)
  }
  if (fn === 'max') {
    const v = Math.max(...values)
    return seriesKey === 'vendor.lead' || seriesKey === 'vendor.lead_time' ? `${v}d` : moneyShort(v)
  }
  if (fn === 'avg') {
    const v = values.reduce((a, b) => a + b, 0) / values.length
    return seriesKey === 'vendor.lead' || seriesKey === 'vendor.lead_time' ? `${Math.round(v)}d` : moneyShort(v)
  }
  if (fn === 'spread') {
    const v = Math.max(...values) - Math.min(...values)
    return seriesKey === 'vendor.lead' || seriesKey === 'vendor.lead_time' ? `${v}d` : moneyShort(v)
  }
  return ''
}

function vendorCellState(item: RFQLineItem, bid: ContractorBid, response?: BidLineItemResponse) {
  const finding = lineSpecFinding(bid, item.id)
  if (response?.is_alternate && finding?.review_kind === 'substitution' && finding.substitution_verdict === 'up_to_spec') {
    return {
      tone: 'up_to_spec_substitution' as const,
      tooltip: substitutionCellTooltip(item, response, finding, 'GPT-5.5 verified this substitution against the trade-scoped project spec package.'),
      finding,
    }
  }
  if (response?.is_alternate && finding?.review_kind === 'substitution') {
    return {
      tone: 'violation' as const,
      tooltip: substitutionCellTooltip(item, response, finding, 'GPT-5.5 needs more review before accepting this substitution against the project specs.'),
      finding,
    }
  }
  if (finding?.status === 'violation') {
    return {
      tone: 'violation' as const,
      tooltip: [
        finding.explanation || 'Quoted item violates the project specification.',
        response?.is_alternate ? 'Vendor also explicitly marked this line as an alternate or substitution.' : '',
      ].filter(Boolean).join(' '),
      finding,
    }
  }
  if (finding?.status === 'needs_review') {
    return {
      tone: 'review' as const,
      tooltip: [
        finding.explanation || 'Quoted item needs spec review before award.',
        response?.is_alternate ? 'Vendor also explicitly marked this line as an alternate or substitution.' : '',
      ].filter(Boolean).join(' '),
      finding,
    }
  }
  if (response?.is_alternate) {
    return {
      tone: 'alternate' as const,
      tooltip: substitutionCellTooltip(item, response, finding, 'Vendor explicitly marked this line as a substitution. Spec verification is pending or inconclusive.'),
      finding,
    }
  }
  return { tone: 'normal' as const, tooltip: '', finding }
}

function BidExcelSheet({
  rfq,
  bids,
  vendorColors,
  userKey,
  specDocuments,
  persistViewToServer = true,
}: {
  rfq: ContractorRFQ
  bids: ContractorBid[]
  vendorColors: Record<string, string>
  userKey: string
  specDocuments: ProjectSpecDocumentSummary[]
  persistViewToServer?: boolean
}) {
  const router = useRouter()
  const baseItems = rfq.line_items

  const { view, versions, canUndo, canRedo, replaceView, deleteColumns, hideColumns, showColumns, deleteLineItems, hideLineItems, showLineItems, addHighlights, removeHighlights, clearHighlights, addDerivedColumns, removeDerivedColumns, setColumnWidth, addManualColumns, addManualLineItems, setCellOverride, setCellOverrides, setColumnLabel, setLineItemOrder, restoreVersion, undo, redo } = useComparisonSheetView(userKey, rfq.id, { persistToServer: persistViewToServer })
  const [previewPatch, setPreviewPatch] = useState<ComparisonViewPatch | null>(null)
  const [priceDifferenceThresholdPct, setPriceDifferenceThresholdPct] = useState(DEFAULT_MAJOR_UNIT_PRICE_DIFFERENCE_PCT)
  const quoteImportInputRef = useRef<HTMLInputElement | null>(null)
  const [quoteImportOpen, setQuoteImportOpen] = useState(false)
  const [quoteImportFiles, setQuoteImportFiles] = useState<File[]>([])
  const [quoteImportBusy, setQuoteImportBusy] = useState(false)
  const [quoteImportError, setQuoteImportError] = useState('')
  const sourceFiles = (rfq.attachment_urls ?? []).filter((url): url is string => Boolean(url?.trim()))
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null)

  const items = useMemo(() => {
    let next = [...baseItems]
    for (const manual of view.manualLineItems ?? []) {
      const item = { ...manual, attributes: [], certifications: [] } satisfies ContractorRFQ['line_items'][number]
      if (manual.insertAfterLineItemId === '__before_first__') {
        next = [item, ...next]
        continue
      }
      const idx = manual.insertAfterLineItemId ? next.findIndex((entry) => entry.id === manual.insertAfterLineItemId) : -1
      if (idx === -1) next = [...next, item]
      else next = [...next.slice(0, idx + 1), item, ...next.slice(idx + 1)]
    }
    return next
  }, [baseItems, view.manualLineItems])

  const previewManualColumns = useMemo(
    () => appendUniqueByKey(view.manualColumns ?? [], previewPatch?.addManualColumns ?? []),
    [view.manualColumns, previewPatch],
  )
  const previewDerivedColumns = useMemo(
    () => appendUniqueByKey(view.derivedColumns, previewPatch?.addDerivedColumns ?? []),
    [view.derivedColumns, previewPatch],
  )
  const allCols = useMemo(() => {
    const cols = buildColumns(rfq, bids, previewDerivedColumns, previewManualColumns)
    return cols.map((col) => ({ ...col, label: view.columnLabelOverrides?.[col.key] ?? col.label }))
  }, [rfq, bids, previewDerivedColumns, previewManualColumns, view.columnLabelOverrides])
  const activeCols = useMemo(() => allCols.filter((c) => !(view.deletedColumnKeys ?? []).includes(c.key)), [allCols, view.deletedColumnKeys])
  const visibleCols = useMemo(() => activeCols.filter((c) => !view.hiddenColumnKeys.includes(c.key)), [activeCols, view.hiddenColumnKeys])
  const visibleItems = useMemo(() => {
    const ordered = view.lineItemOrder?.length
      ? [
          ...view.lineItemOrder.map((id) => items.find((item) => item.id === id)).filter((item): item is typeof items[number] => Boolean(item)),
          ...items.filter((item) => !view.lineItemOrder!.includes(item.id)),
        ]
      : items
    return ordered.filter((it) => !(view.deletedLineItemIds ?? []).includes(it.id) && !view.hiddenLineItemIds.includes(it.id))
  }, [items, view.deletedLineItemIds, view.hiddenLineItemIds, view.lineItemOrder])
  const comparisonSummary = useMemo(() => buildLiveQuoteComparisonSummary(rfq, bids), [rfq, bids])
  const visibleHighlights = useMemo(() => [
    ...view.highlights.filter((highlight) => highlight.color.toLowerCase() !== PRICING_MISTAKE_HIGHLIGHT),
    ...buildQuoteImportAnalyticsHighlights(rfq, bids, { majorUnitPriceDifferencePct: priceDifferenceThresholdPct }),
  ], [bids, priceDifferenceThresholdPct, rfq, view.highlights])
  const importReviewHighlights = useMemo(
    () => visibleHighlights.filter((highlight) => highlight.color.toLowerCase() === IMPORT_REVIEW_HIGHLIGHT),
    [visibleHighlights],
  )
  const importReviewCategoryEntries = useMemo(() => {
    const groups = new Map<NonNullable<ReturnType<typeof importReviewCategoryFromHighlightId>>, typeof importReviewHighlights>()
    for (const highlight of importReviewHighlights) {
      const category = importReviewCategoryFromHighlightId(highlight.id)
      if (!category) continue
      groups.set(category, [...(groups.get(category) ?? []), highlight])
    }
    return [...groups.entries()]
  }, [importReviewHighlights])
  const fullQuoteCount = comparisonSummary.fullQuoteCount
  const lowestBid = comparisonSummary.lowestCompleteBid
  const fastestBid = comparisonSummary.fastestBid

  // Smart default widths: compute from content + label so empty columns don't waste space.
  const computedWidths = useMemo(() => {
    const out: Record<string, number> = {}
    for (const c of allCols) out[c.key] = computeSmartWidth(c, visibleItems, bids)
    return out
  }, [allCols, visibleItems, bids])

  const colWidth = (col: SheetColumn) => view.columnWidths?.[col.key] ?? computedWidths[col.key] ?? col.defaultWidth

  // Highlight resolution: build a map of (rowKey, colKey) -> color
  const highlightMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const h of visibleHighlights) {
      if (h.selector.kind === 'cell') {
        map.set(`${h.selector.rowKey}|${h.selector.colKey}`, h.color)
      } else {
        const rule = h.selector.rule
        if (rule === 'fastest-lead-per-row') {
          for (const item of visibleItems) {
            const bestVendorIds = new Set<string>()
            let bestLead = Infinity
            for (const bid of bids) {
              const r = bid.line_item_responses.find((x) => x.line_item_id === item.id)
              if (!r || r.availability === 'unavailable') continue
              if (r.lead_time_days < bestLead) {
                bestLead = r.lead_time_days
                bestVendorIds.clear()
                bestVendorIds.add(bid.id)
              } else if (r.lead_time_days === bestLead) {
                bestVendorIds.add(bid.id)
              }
            }
            for (const vendorId of bestVendorIds) map.set(`${item.id}|vendor:${vendorId}:lead`, h.color)
          }
        } else if (rule === 'lowest-price-per-row') {
          for (const item of visibleItems) {
            const bestVendorIds = new Set<string>()
            let bestTotal = Infinity
            for (const bid of bids) {
              const r = bid.line_item_responses.find((x) => x.line_item_id === item.id)
              if (!r || r.availability === 'unavailable') continue
              if (r.total_price < bestTotal) {
                bestTotal = r.total_price
                bestVendorIds.clear()
                bestVendorIds.add(bid.id)
              } else if (r.total_price === bestTotal) {
                bestVendorIds.add(bid.id)
              }
            }
            for (const vendorId of bestVendorIds) {
              map.set(`${item.id}|vendor:${vendorId}:total`, h.color)
              map.set(`${item.id}|vendor:${vendorId}:unit_price`, h.color)
            }
          }
        }
      }
    }
    return map
  }, [visibleHighlights, visibleItems, bids])
  const highlightNoteMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const h of visibleHighlights) {
      if (h.selector.kind === 'cell' && h.note) map.set(`${h.selector.rowKey}|${h.selector.colKey}`, h.note)
    }
    return map
  }, [visibleHighlights])
  const highlightByCellMap = useMemo(() => {
    const map = new Map<string, typeof visibleHighlights[number]>()
    for (const h of visibleHighlights) {
      if (h.selector.kind === 'cell') map.set(`${h.selector.rowKey}|${h.selector.colKey}`, h)
    }
    return map
  }, [visibleHighlights])

  const previewCellMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const cell of previewPatch?.setCells ?? []) {
      map.set(`${cell.rowKey}|${cell.colKey}`, cell.value)
    }
    return map
  }, [previewPatch])
  const previewHighlightMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const h of previewPatch?.addHighlights ?? []) {
      if (h.selector.kind === 'cell') {
        map.set(`${h.selector.rowKey}|${h.selector.colKey}`, '#fef3c7')
      } else {
        const rule = h.selector.rule
        if (rule === 'fastest-lead-per-row') {
          for (const item of visibleItems) {
            const bestVendorIds = new Set<string>()
            let bestLead = Infinity
            for (const bid of bids) {
              const r = bid.line_item_responses.find((x) => x.line_item_id === item.id)
              if (!r || r.availability === 'unavailable') continue
              if (r.lead_time_days < bestLead) {
                bestLead = r.lead_time_days
                bestVendorIds.clear()
                bestVendorIds.add(bid.id)
              } else if (r.lead_time_days === bestLead) {
                bestVendorIds.add(bid.id)
              }
            }
            for (const vendorId of bestVendorIds) map.set(`${item.id}|vendor:${vendorId}:lead`, '#fef3c7')
          }
        } else if (rule === 'lowest-price-per-row') {
          for (const item of visibleItems) {
            const bestVendorIds = new Set<string>()
            let bestTotal = Infinity
            for (const bid of bids) {
              const r = bid.line_item_responses.find((x) => x.line_item_id === item.id)
              if (!r || r.availability === 'unavailable') continue
              if (r.total_price < bestTotal) {
                bestTotal = r.total_price
                bestVendorIds.clear()
                bestVendorIds.add(bid.id)
              } else if (r.total_price === bestTotal) {
                bestVendorIds.add(bid.id)
              }
            }
            for (const vendorId of bestVendorIds) {
              map.set(`${item.id}|vendor:${vendorId}:total`, '#fef3c7')
              map.set(`${item.id}|vendor:${vendorId}:unit_price`, '#fef3c7')
            }
          }
        }
      }
    }
    return map
  }, [previewPatch, visibleItems, bids])

  const bestByItem = useMemo(() => {
    const map = new Map<string, { totalVendorIds: Set<string>; leadVendorIds: Set<string> }>()
    for (const item of visibleItems) {
      const totalVendorIds = new Set<string>()
      const leadVendorIds = new Set<string>()
      let bestTotal = Infinity
      let bestLead = Infinity
      for (const bid of bids) {
        const response = bid.line_item_responses.find((entry) => entry.line_item_id === item.id)
        if (!response || response.availability === 'unavailable') continue
        if (response.total_price < bestTotal) {
          bestTotal = response.total_price
          totalVendorIds.clear()
          totalVendorIds.add(bid.id)
        } else if (response.total_price === bestTotal) {
          totalVendorIds.add(bid.id)
        }
        if (response.lead_time_days < bestLead) {
          bestLead = response.lead_time_days
          leadVendorIds.clear()
          leadVendorIds.add(bid.id)
        } else if (response.lead_time_days === bestLead) {
          leadVendorIds.add(bid.id)
        }
      }
      map.set(item.id, { totalVendorIds, leadVendorIds })
    }
    return map
  }, [visibleItems, bids])

  const getCellText = useCallback((item: typeof items[number], col: SheetColumn): string => (
    view.cellOverrides?.[`${item.id}|${col.key}`] ?? valueForCol(item, col, bids)
  ), [bids, view.cellOverrides])

  function formulaAwareCellUpdates(rowKey: string, colKey: string, value: string) {
    const updates = [{ rowKey, colKey, value }]
    const col = allCols.find((entry) => entry.key === colKey)
    const item = items.find((entry) => entry.id === rowKey)
    if (col?.kind !== 'vendor' || col.vendorMetric !== 'unit_price' || !col.vendorId || !item) return updates
    const totalCol = allCols.find((entry) =>
      entry.kind === 'vendor' &&
      entry.vendorId === col.vendorId &&
      entry.vendorMetric === 'total'
    )
    const unitPrice = parseSheetNumber(value)
    if (!totalCol || unitPrice == null || !Number.isFinite(item.quantity)) return updates
    updates.push({
      rowKey,
      colKey: totalCol.key,
      value: formatSheetMoney(unitPrice * item.quantity),
    })
    return updates
  }

  const [editingCell, setEditingCell] = useState<{ rowKey: string; colKey: string } | null>(null)
  const [editingHeader, setEditingHeader] = useState<{ colKey: string } | null>(null)
  const [editingGroupHeader, setEditingGroupHeader] = useState<{ groupKey: string } | null>(null)
  const [draftValue, setDraftValue] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; rowKey?: string; colKey?: string } | null>(null)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [exportError, setExportError] = useState('')
  const [historyMenuOpen, setHistoryMenuOpen] = useState(false)
  const [rangeStart, setRangeStart] = useState<{ r: number; c: number } | null>(null)
  const [isDraggingRange, setIsDraggingRange] = useState(false)
  const isDraggingRangeRef = useRef(false)
  const manualInsertCounterRef = useRef(0)

  function startCellEdit(item: typeof items[number], col: SheetColumn) {
    setEditingCell({ rowKey: item.id, colKey: col.key })
    setDraftValue(getCellText(item, col))
  }

  function commitCellEdit() {
    if (!editingCell) return
    setCellOverrides(formulaAwareCellUpdates(editingCell.rowKey, editingCell.colKey, draftValue))
    setEditingCell(null)
  }

  function startHeaderEdit(col: SheetColumn) {
    setEditingHeader({ colKey: col.key })
    setDraftValue(col.label)
  }

  function commitHeaderEdit() {
    if (!editingHeader) return
    setColumnLabel(editingHeader.colKey, draftValue)
    setEditingHeader(null)
  }

  function groupOverrideKey(groupKey: string) {
    return `group:${groupKey}`
  }

  function groupKeyForColumn(col: SheetColumn, fallbackIndex = 0) {
    return col.vendorId ? `vendor:${col.vendorId}` : `requested:${fallbackIndex}`
  }

  function groupLabelForColumn(col: SheetColumn, fallbackIndex = 0) {
    const groupKey = groupKeyForColumn(col, fallbackIndex)
    return view.columnLabelOverrides?.[groupOverrideKey(groupKey)] ?? (col.vendorName || 'Requested Item')
  }

  function startGroupHeaderEdit(col: SheetColumn, fallbackIndex = 0) {
    const groupKey = groupKeyForColumn(col, fallbackIndex)
    setEditingGroupHeader({ groupKey })
    setDraftValue(groupLabelForColumn(col, fallbackIndex))
  }

  function commitGroupHeaderEdit() {
    if (!editingGroupHeader) return
    setColumnLabel(groupOverrideKey(editingGroupHeader.groupKey), draftValue)
    setEditingGroupHeader(null)
  }

  function makeManualColumn(anchorKey: string | undefined, side: 'left' | 'right') {
    const anchorIndex = anchorKey ? visibleCols.findIndex((col) => col.key === anchorKey) : -1
    const insertAfterColKey = side === 'right'
      ? anchorKey
      : anchorIndex > 0
        ? visibleCols[anchorIndex - 1]?.key
        : '__before_first__'
    const col: ManualColumn = {
      key: `col-${manualInsertCounterRef.current += 1}`,
      label: 'New Column',
      insertAfterColKey,
    }
    addManualColumns([col])
    setContextMenu(null)
  }

  function makeManualRow(rowKey: string | undefined, side: 'above' | 'below') {
    const rowIndex = rowKey ? visibleItems.findIndex((item) => item.id === rowKey) : -1
    const insertAfterLineItemId = side === 'below'
      ? rowKey
      : rowIndex > 0
        ? visibleItems[rowIndex - 1]?.id
        : '__before_first__'
    const row: ManualLineItem = {
      id: `manual-row-${manualInsertCounterRef.current += 1}`,
      sku: '',
      description: '',
      quantity: 0,
      unit: '',
      insertAfterLineItemId,
    }
    addManualLineItems([row])
    setContextMenu(null)
  }

  function clearCell(rowKey: string | undefined, colKey: string | undefined) {
    if (rowKey && colKey) setCellOverride(rowKey, colKey, '')
    setContextMenu(null)
  }

  function deleteContextColumn(colKey: string | undefined) {
    if (colKey) deleteColumns([colKey])
    setContextMenu(null)
  }

  function deleteContextRow(rowKey: string | undefined) {
    if (rowKey) deleteLineItems([rowKey])
    setContextMenu(null)
  }

  function deleteContextCells(rowKey: string | undefined, colKey: string | undefined) {
    const cells = selectedDataCells()
    const clickedCellIsSelected = cells.some((cell) => cell.item.id === rowKey && cell.col.key === colKey)
    if (cells.length > 1 && clickedCellIsSelected) {
      setCellOverrides(cells.map((cell) => ({ rowKey: cell.item.id, colKey: cell.col.key, value: '' })))
    } else if (rowKey && colKey) {
      setCellOverride(rowKey, colKey, '')
    }
    setContextMenu(null)
  }

  function renameColumnInline(colKey: string | undefined) {
    const col = colKey ? allCols.find((entry) => entry.key === colKey) : undefined
    if (col) startHeaderEdit(col)
    setContextMenu(null)
  }

  function setSelectedCellValue(value: string) {
    const col = visibleCols[sel.c]
    if (col && sel.r === fieldHeaderRowIdx) {
      setColumnLabel(col.key, value)
      return
    }
    const item = visibleItems[sel.r - dataStartRow]
    if (col && item) setCellOverrides(formulaAwareCellUpdates(item.id, col.key, value))
  }

  function selectedDataCells() {
    const cells: Array<{ item: typeof items[number]; col: SheetColumn; r: number; c: number }> = []
    for (let r = selectedRange.r1; r <= selectedRange.r2; r += 1) {
      const item = visibleItems[r - dataStartRow]
      if (!item) continue
      for (let c = selectedRange.c1; c <= selectedRange.c2; c += 1) {
        const col = visibleCols[c]
        if (col) cells.push({ item, col, r, c })
      }
    }
    return cells
  }

  function clearSelectedRange() {
    const cells = selectedDataCells()
    if (cells.length === 0) {
      setSelectedCellValue('')
      return
    }
    setCellOverrides(cells.map((cell) => ({ rowKey: cell.item.id, colKey: cell.col.key, value: '' })))
  }

  function copySelectedRange() {
    const rows: string[][] = []
    for (let r = selectedRange.r1; r <= selectedRange.r2; r += 1) {
      const row: string[] = []
      for (let c = selectedRange.c1; c <= selectedRange.c2; c += 1) {
        const col = visibleCols[c]
        if (r === fieldHeaderRowIdx && col) row.push(col.label)
        else {
          const item = visibleItems[r - dataStartRow]
          row.push(item && col ? getCellText(item, col) : '')
        }
      }
      rows.push(row)
    }
    return rows.map((row) => row.join('\t')).join('\n')
  }

  function writeSelectedRangeToClipboard() {
    const value = copySelectedRange()
    if (!value) return
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(value).catch(() => writeTextWithTextareaFallback(value))
      return
    }
    writeTextWithTextareaFallback(value)
  }

  function writeTextWithTextareaFallback(value: string) {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.style.top = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    containerRef.current?.focus()
  }

  function onCopySelectedRange(event: React.ClipboardEvent<HTMLDivElement>) {
    if (editingCell || editingHeader || editingGroupHeader) return
    const value = copySelectedRange()
    if (!value) return
    event.preventDefault()
    event.clipboardData.setData('text/plain', value)
  }

  function onPasteIntoSelection(event: React.ClipboardEvent<HTMLDivElement>) {
    if (editingCell || editingHeader || editingGroupHeader) return
    const text = event.clipboardData.getData('text/plain')
    if (!text) return
    event.preventDefault()
    pasteTextToSelection(text)
  }

  function pasteTextToSelection(text: string) {
    const rows = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').map((row) => row.split('\t'))
    if (rows.length === 1 && rows[0].length === 1) {
      const cells = selectedDataCells()
      if (cells.length > 1) {
        setCellOverrides(cells.map((cell) => ({ rowKey: cell.item.id, colKey: cell.col.key, value: rows[0][0] })))
        return
      }
      setSelectedCellValue(rows[0][0])
      return
    }
    const cellUpdates: Array<{ rowKey: string; colKey: string; value: string }> = []
    rows.forEach((row, rowOffset) => {
      row.forEach((value, colOffset) => {
        const r = selectedRange.r1 + rowOffset
        const c = selectedRange.c1 + colOffset
        const col = visibleCols[c]
        if (!col) return
        if (r === fieldHeaderRowIdx) {
          setColumnLabel(col.key, value)
          return
        }
        const item = visibleItems[r - dataStartRow]
      if (item) cellUpdates.push(...formulaAwareCellUpdates(item.id, col.key, value))
      })
    })
    if (cellUpdates.length > 0) setCellOverrides(cellUpdates)
  }

  function sortRowsByColumn(colKey: string | undefined, direction: 'asc' | 'desc') {
    const col = colKey ? allCols.find((entry) => entry.key === colKey) : undefined
    if (!col) { setContextMenu(null); return }
    const sorted = [...items].sort((a, b) => {
      const av = getCellText(a, col)
      const bv = getCellText(b, col)
      const an = Number(av.replace(/[$,\sA-Za-z]/g, ''))
      const bn = Number(bv.replace(/[$,\sA-Za-z]/g, ''))
      const result = Number.isFinite(an) && Number.isFinite(bn)
        ? an - bn
        : av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' })
      return direction === 'asc' ? result : -result
    })
    setLineItemOrder(sorted.map((item) => item.id))
    setContextMenu(null)
  }

  function sortLabelsForColumn(colKey: string | undefined) {
    const col = colKey ? allCols.find((entry) => entry.key === colKey) : undefined
    const sample = col ? visibleItems.map((item) => getCellText(item, col)).find((value) => value.trim()) : ''
    const numeric = col?.align === 'right' || parseSheetNumber(sample) != null
    return numeric
      ? { asc: 'Sort Smallest to Largest', desc: 'Sort Largest to Smallest' }
      : { asc: 'Sort A to Z', desc: 'Sort Z to A' }
  }

  function sortRowsByCellColor(rowKey: string | undefined, colKey: string | undefined) {
    if (!rowKey || !colKey) { setContextMenu(null); return }
    const targetColor = highlightMap.get(`${rowKey}|${colKey}`)
    if (!targetColor) { setContextMenu(null); return }
    const sorted = [...items].sort((a, b) => {
      const ah = highlightMap.get(`${a.id}|${colKey}`) === targetColor ? 0 : 1
      const bh = highlightMap.get(`${b.id}|${colKey}`) === targetColor ? 0 : 1
      return ah - bh
    })
    setLineItemOrder(sorted.map((item) => item.id))
    setContextMenu(null)
  }

  function hideBlankRowsForColumn(colKey: string | undefined) {
    const col = colKey ? allCols.find((entry) => entry.key === colKey) : undefined
    if (!col) { setContextMenu(null); return }
    hideLineItems(visibleItems.filter((item) => getCellText(item, col).trim() === '').map((item) => item.id))
    setContextMenu(null)
  }

  function openContextMenu(e: React.MouseEvent, rowKey?: string, colKey?: string) {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, rowKey, colKey })
  }

  function startRangeSelect(r: number, c: number, event?: React.MouseEvent) {
    containerRef.current?.focus()
    if (event?.shiftKey) {
      isDraggingRangeRef.current = false
      setRangeStart((start) => start ?? sel)
      setSel({ r, c })
      setIsDraggingRange(false)
      return
    }
    isDraggingRangeRef.current = true
    setSel({ r, c })
    setRangeStart({ r, c })
    setIsDraggingRange(true)
  }

  function extendRangeSelect(r: number, c: number) {
    if (!isDraggingRangeRef.current) return
    setSel({ r, c })
  }

  function exportRows(): (string | number)[][] {
    return [
      visibleCols.map((col, index) => col.kind === 'vendor' ? `${groupLabelForColumn(col, index)} ${col.label}` : col.label),
      ...visibleItems.map((item) => visibleCols.map((col) => getCellText(item, col))),
    ]
  }

  async function exportViaServer(format: ComparisonExportFormat) {
    setExportError('')
    try {
      const result = await submitComparisonExport({
        format,
        title: rfq.title,
        rows: exportRows(),
      })
      downloadBlob(result.blob, result.filename)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Export failed.')
    }
  }

  async function restoreWorkbookVersion(versionId: number) {
    await restoreVersion(versionId)
    setHistoryMenuOpen(false)
  }

  async function applyWorkbookHistoryCommand(command: 'undo' | 'redo') {
    if (command === 'undo') {
      if (!canUndo) return false
      await undo()
      return true
    }
    if (!canRedo) return false
    await redo()
    return true
  }

  // Layout constants
  const GUTTER_W = 44
  const ROW_H = 32
  const COL_LETTER_TOP = 0
  const GROUP_HEADER_TOP = ROW_H
  const FIELD_HEADER_TOP = ROW_H * 2
  // Excel-feel filler: extra empty rows below the data and extra empty columns to the right.
  const EXTRA_COLS = 10
  const EXTRA_ROWS = 28
  const EXTRA_COL_W = 90

  // Row layout (0-indexed sel.r → 1-indexed CSS gridRow = sel.r + 1):
  //   0:                       column letters (sticky top:0)
  //   1:                       group header (sticky top:ROW_H)
  //   2:                       field header (sticky top:2*ROW_H)
  //   3+...:                   data rows
  //   then totals, then empty filler rows.
  const groupHeaderRowIdx = 1
  const fieldHeaderRowIdx = 2
  const dataStartRow = 3
  const totalsRow = dataStartRow + visibleItems.length
  const lastEmptyRow = totalsRow + EXTRA_ROWS
  const totalGridCols = visibleCols.length + EXTRA_COLS

  // Cell selection — bounds extend through the empty filler rows + cols.
  const [sel, setSel] = useState<{ r: number; c: number }>({ r: dataStartRow, c: 0 })
  const [openSpecBubble, setOpenSpecBubble] = useState<{ itemId: string; bidId: string; anchor: { top: number; left: number } } | null>(null)
  const [openPricingMistakeBubble, setOpenPricingMistakeBubble] = useState<{ itemId: string; colKey: string; anchor: { top: number; left: number } } | null>(null)
  const rangeAnchor = rangeStart ?? sel
  const selectedRange = {
    r1: Math.min(rangeAnchor.r, sel.r),
    r2: Math.max(rangeAnchor.r, sel.r),
    c1: Math.min(rangeAnchor.c, sel.c),
    c2: Math.max(rangeAnchor.c, sel.c),
  }

  function isInSelectedRange(r: number, c: number) {
    return r >= selectedRange.r1 && r <= selectedRange.r2 && c >= selectedRange.c1 && c <= selectedRange.c2
  }
  const activeSpecBubble = useMemo(() => {
    if (!openSpecBubble) return undefined
    const item = visibleItems.find((entry) => entry.id === openSpecBubble.itemId)
    const bid = bids.find((entry) => entry.id === openSpecBubble.bidId)
    const response = bid?.line_item_responses.find((entry) => entry.line_item_id === openSpecBubble.itemId)
    if (!item || !bid || !response?.is_alternate) return undefined
    const finding = lineSpecFinding(bid, item.id)
    return finding?.review_kind === 'substitution' ? { finding, item, bid, response, anchor: openSpecBubble.anchor } : undefined
  }, [bids, openSpecBubble, visibleItems])
  const activePricingMistakeBubble = useMemo(() => {
    if (!openPricingMistakeBubble) return undefined
    const item = visibleItems.find((entry) => entry.id === openPricingMistakeBubble.itemId)
    const col = visibleCols.find((entry) => entry.key === openPricingMistakeBubble.colKey)
    const highlight = visibleHighlights.find((entry) =>
      entry.selector.kind === 'cell' &&
      entry.selector.rowKey === openPricingMistakeBubble.itemId &&
      entry.selector.colKey === openPricingMistakeBubble.colKey &&
      (entry.color.toLowerCase() === PRICING_MISTAKE_HIGHLIGHT || entry.color.toLowerCase() === IMPORT_REVIEW_HIGHLIGHT),
    )
    if (!item || !col || !highlight) return undefined
    return { item, col, highlight, anchor: openPricingMistakeBubble.anchor }
  }, [openPricingMistakeBubble, visibleHighlights, visibleCols, visibleItems])

  function approveImportReviewHighlights(ids: string[]) {
    const existing = new Set(view.highlights.map((highlight) => highlight.id))
    const removable = ids.filter((id) => existing.has(id))
    if (removable.length === 0) return
    removeHighlights(removable)
    if (openPricingMistakeBubble && removable.some((id) => activePricingMistakeBubble?.highlight.id === id)) {
      setOpenPricingMistakeBubble(null)
    }
  }

  useEffect(() => {
    setSel((s) => ({ r: Math.min(s.r, lastEmptyRow), c: Math.min(s.c, Math.max(0, totalGridCols - 1)) }))
  }, [lastEmptyRow, totalGridCols])

  const containerRef = useRef<HTMLDivElement>(null)

  function bubbleAnchor(target: HTMLElement) {
    const rect = target.getBoundingClientRect()
    const width = Math.min(460, window.innerWidth - 24)
    return {
      top: Math.min(Math.max(12, rect.bottom + 8), window.innerHeight - 220),
      left: Math.min(Math.max(12, rect.left), window.innerWidth - width - 12),
    }
  }

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [contextMenu])

  useEffect(() => {
    if (!isDraggingRange) return
    const stop = () => {
      isDraggingRangeRef.current = false
      setIsDraggingRange(false)
    }
    window.addEventListener('mouseup', stop)
    return () => window.removeEventListener('mouseup', stop)
  }, [isDraggingRange])

  function moveSel(dr: number, dc: number, extendRange = false) {
    if (!extendRange) {
      setRangeStart(null)
    } else {
      setRangeStart((start) => start ?? sel)
    }
    setSel((s) => {
      let r = s.r + dr
      let c = s.c + dc
      r = Math.max(0, Math.min(lastEmptyRow, r))
      c = Math.max(0, Math.min(totalGridCols - 1, c))
      return { r, c }
    })
  }

  function isTextEditingTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false
    return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
  }

  useEffect(() => {
    function onWindowKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isTextEditingTarget(event.target)) return
      if (editingCell || editingHeader || editingGroupHeader) return
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return

      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) void redo()
        else void undo()
      } else if (key === 'y') {
        event.preventDefault()
        void redo()
      }
    }

    window.addEventListener('keydown', onWindowKeyDown)
    return () => window.removeEventListener('keydown', onWindowKeyDown)
  }, [editingCell, editingGroupHeader, editingHeader, redo, undo])

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (editingCell || editingHeader || editingGroupHeader) {
      if (e.key === 'Escape') { e.preventDefault(); setEditingCell(null); setEditingHeader(null); setEditingGroupHeader(null) }
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      if (e.shiftKey) void redo()
      else void undo()
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault()
      void redo()
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); dispatchAssistant(true); return }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
      e.preventDefault()
      writeSelectedRangeToClipboard()
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
      return
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault()
      clearSelectedRange()
      return
    }
    if (e.key === 'Enter') {
      const col = visibleCols[sel.c]
      const item = visibleItems[sel.r - dataStartRow]
      if (col && sel.r === groupHeaderRowIdx) { e.preventDefault(); startGroupHeaderEdit(col, sel.c); return }
      if (col && sel.r === fieldHeaderRowIdx) { e.preventDefault(); startHeaderEdit(col); return }
      if (col && item) { e.preventDefault(); startCellEdit(item, col); return }
    }
    if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1) {
      const col = visibleCols[sel.c]
      const item = visibleItems[sel.r - dataStartRow]
      if (col && sel.r === groupHeaderRowIdx) {
        e.preventDefault()
        setEditingGroupHeader({ groupKey: groupKeyForColumn(col, sel.c) })
        setDraftValue(e.key)
        return
      }
      if (col && sel.r === fieldHeaderRowIdx) {
        e.preventDefault()
        setEditingHeader({ colKey: col.key })
        setDraftValue(e.key)
        return
      }
      if (col && item) {
        e.preventDefault()
        setEditingCell({ rowKey: item.id, colKey: col.key })
        setDraftValue(e.key)
        return
      }
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1, 0, e.shiftKey) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1, 0, e.shiftKey) }
    else if (e.key === 'ArrowRight' || e.key === 'Tab') { e.preventDefault(); moveSel(0, 1, e.shiftKey) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); moveSel(0, -1, e.shiftKey) }
    else if (e.key === 'Home') { e.preventDefault(); setRangeStart(e.shiftKey ? (rangeStart ?? sel) : null); setSel((s) => ({ ...s, c: 0 })) }
    else if (e.key === 'End') { e.preventDefault(); setRangeStart(e.shiftKey ? (rangeStart ?? sel) : null); setSel((s) => ({ ...s, c: totalGridCols - 1 })) }
    else if (e.key === 'PageDown') { e.preventDefault(); moveSel(10, 0, e.shiftKey) }
    else if (e.key === 'PageUp') { e.preventDefault(); moveSel(-10, 0, e.shiftKey) }
  }

  // Compute formula-bar value
  function getSelValue(): string {
    const { r, c } = sel
    const col = visibleCols[c]
    if (!col) return ''
    if (r === 0) return colLetter(c)
    if (r === groupHeaderRowIdx) {
      return groupLabelForColumn(col, c)
    }
    if (r === fieldHeaderRowIdx) return col.label
    if (r === totalsRow) {
      if (col.kind === 'vendor' && col.vendorId) {
        const bid = bids.find((b) => b.id === col.vendorId)
        if (!bid) return ''
        if (col.vendorMetric === 'total') return moneyShort(bid.total_price)
        if (col.vendorMetric === 'lead') return `${bid.lead_time_days}d`
      }
      return c === 0 ? 'Total' : ''
    }
    const item = visibleItems[r - dataStartRow]
    if (!item) return ''
    const previewValue = previewCellMap.get(`${item.id}|${col.key}`)
    if (previewValue !== undefined) return previewValue
    if (col.kind === 'vendor' && col.vendorMetric === 'total' && col.vendorId) {
      const unitCol = allCols.find((entry) => entry.kind === 'vendor' && entry.vendorId === col.vendorId && entry.vendorMetric === 'unit_price')
      const unitValue = unitCol ? getCellText(item, unitCol) : ''
      if (unitValue) return `=${unitValue}*${item.quantity}`
    }
    return getCellText(item, col)
  }

  // Column resize: drag handle on column-letter cell
  const resizeRef = useRef<{ key: string; startX: number; startW: number } | null>(null)
  function onResizeStart(col: SheetColumn, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    resizeRef.current = { key: col.key, startX: e.clientX, startW: colWidth(col) }
    function onMove(ev: MouseEvent) {
      const ref = resizeRef.current
      if (!ref) return
      const next = Math.max(50, ref.startW + (ev.clientX - ref.startX))
      setColumnWidth(ref.key, next)
    }
    function onUp() {
      resizeRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // AI assistant — driven entirely by the rialto:bid-comparison-assistant event so that
  // the floating SiteAssistant button (or a keyboard shortcut) can open/close it.
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [assistantClosing, setAssistantClosing] = useState(false)
  const closingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    function onEvent(e: Event) {
      const open = Boolean((e as CustomEvent<{ open?: boolean }>).detail?.open)
      if (closingTimerRef.current) clearTimeout(closingTimerRef.current)
      if (open) {
        setAssistantClosing(false)
        setAssistantOpen(true)
      } else {
        setPreviewPatch(null)
        setAssistantClosing(true)
        closingTimerRef.current = setTimeout(() => {
          setAssistantOpen(false)
          setAssistantClosing(false)
        }, 260)
      }
    }
    window.addEventListener('rialto:bid-comparison-assistant', onEvent)
    return () => window.removeEventListener('rialto:bid-comparison-assistant', onEvent)
  }, [])

  // Tell the global SiteAssistant button that, on this page, clicks should open the
  // bid-comparison pill instead of the chat sidebar. We set both a window global
  // (so a late-mounting SiteAssistant can pick it up) and emit the event (so an
  // already-listening one updates).
  useEffect(() => {
    if (typeof window === 'undefined') return
    type RialtoWindow = Window & { __rialtoPreferredAssistant?: string | null }
    ;(window as RialtoWindow).__rialtoPreferredAssistant = 'bid-comparison'
    window.dispatchEvent(new CustomEvent('rialto:set-preferred-assistant', { detail: { kind: 'bid-comparison' } }))
    return () => {
      ;(window as RialtoWindow).__rialtoPreferredAssistant = null
      window.dispatchEvent(new CustomEvent('rialto:set-preferred-assistant', { detail: { kind: null } }))
    }
  }, [])

  function dispatchAssistant(open: boolean) {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('rialto:bid-comparison-assistant', { detail: { open } }))
  }

  function applyPatchToView(patch: ComparisonViewPatch) {
    let nextView = applyPatch(view, patch)
    if (patch.sortRowsByColumn) {
      const col = allCols.find((entry) => entry.key === patch.sortRowsByColumn!.colKey)
      if (col) {
        const sorted = [...items].sort((a, b) => {
          const av = getCellText(a, col)
          const bv = getCellText(b, col)
          const an = Number(av.replace(/[$,\sA-Za-z]/g, ''))
          const bn = Number(bv.replace(/[$,\sA-Za-z]/g, ''))
          const result = Number.isFinite(an) && Number.isFinite(bn)
            ? an - bn
            : av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' })
          return patch.sortRowsByColumn!.direction === 'asc' ? result : -result
        })
        nextView = { ...nextView, lineItemOrder: sorted.map((item) => item.id) }
      }
    }
    if (patch.filterBlankRowsByColumnKey) {
      const col = allCols.find((entry) => entry.key === patch.filterBlankRowsByColumnKey)
      if (col) {
        const blankIds = visibleItems.filter((item) => getCellText(item, col).trim() === '').map((item) => item.id)
        nextView = {
          ...nextView,
          hiddenLineItemIds: Array.from(new Set([...nextView.hiddenLineItemIds, ...blankIds])),
        }
      }
    }
    replaceView(nextView, workbookVersionMetadataFromApprovedComparisonPatch(patch))
    setPreviewPatch(null)
    dispatchAssistant(false)
  }

  // Sheet schema for the assistant
  // Mark each column "empty" if no visible item supplies a value — lets the AI hide empties.
  const emptyColumnKeys = useMemo(() => {
    const set = new Set<string>()
    for (const col of activeCols) {
      const anyValue = visibleItems.some((it) => getCellText(it, col).trim().length > 0)
      if (!anyValue) set.add(col.key)
    }
    return set
  }, [activeCols, visibleItems, getCellText])

  const sheetSchema = useMemo(() => ({
    columns: activeCols.map((c) => ({
      key: c.key,
      label: c.label,
      kind: c.kind,
      vendorId: c.vendorId,
      vendorName: c.vendorName,
      metric: c.vendorMetric,
      isEmpty: emptyColumnKeys.has(c.key),
    })),
    lineItems: items.map((i) => ({
      id: i.id,
      description: i.description,
      values: Object.fromEntries(activeCols.map((col) => [col.key, getCellText(i, col)])),
    })),
    vendors: bids.map((b) => ({ id: b.id, name: b.vendor_name })),
  }), [activeCols, items, bids, emptyColumnKeys, getCellText])

  const comparisonSheetSnapshot = useMemo(() => buildComparisonSheetSnapshot({
    sheetId: `sheet:${rfq.id}`,
    quoteRequestId: rfq.id,
    columns: sheetSchema.columns,
    rows: sheetSchema.lineItems,
    vendors: sheetSchema.vendors,
    view,
  }), [rfq.id, sheetSchema, view])

  // Visual constants
  const baseBorder = '1px solid #d9e0dc'
  const strongBorder = '1px solid #a8bbb1'
  const frozenColumnKey = '__item'
  const cellBase: React.CSSProperties = { borderRight: baseBorder, borderBottom: baseBorder, padding: '0 10px', fontSize: 12, lineHeight: `${ROW_H - 2}px`, height: ROW_H, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', boxSizing: 'border-box', display: 'flex', alignItems: 'center', userSelect: 'none', WebkitUserSelect: 'none' }
  const headerCellBase: React.CSSProperties = { ...cellBase, background: '#edf3f0', color: '#1e3a2f', fontWeight: 700, justifyContent: 'center' }
  const groupHeaderBase: React.CSSProperties = { ...headerCellBase, background: '#1e3a2f', color: '#ffffff', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0 }
  const gutterBase: React.CSSProperties = { ...headerCellBase, color: '#587067', fontWeight: 600, fontSize: 11, background: '#f4f7f5' }
  const cellTextStyle: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', background: 'transparent', userSelect: 'none', WebkitUserSelect: 'none' }

  function alignToJustify(a: 'left' | 'right' | 'center') { return a === 'right' ? 'flex-end' : a === 'center' ? 'center' : 'flex-start' }

  function selRing(r: number, c: number): React.CSSProperties {
    return sel.r === r && sel.c === c
      ? { boxShadow: 'inset 0 0 0 2px #2563eb', background: '#dbeafe' }
      : {}
  }

  // Hidden columns chip tray
  const hiddenColEntries = view.hiddenColumnKeys
    .map((key) => activeCols.find((c) => c.key === key))
    .filter((c): c is SheetColumn => Boolean(c))

  function addQuoteImportFiles(fileList: FileList | null) {
    if (!fileList) return
    const incoming = Array.from(fileList)
    setQuoteImportFiles((current) => {
      const existing = new Set(current.map(uploadFileKey))
      return [
        ...current,
        ...incoming.filter((file) => {
          const key = uploadFileKey(file)
          if (existing.has(key)) return false
          existing.add(key)
          return true
        }),
      ]
    })
  }

  async function submitAdditionalQuoteImport() {
    if (quoteImportFiles.length === 0 || quoteImportBusy) return
    setQuoteImportBusy(true)
    setQuoteImportError('')
    try {
      const uploadFolder = `quote-imports/${rfq.id}-${crypto.randomUUID().slice(0, 8)}`
      const uploadedFiles = await Promise.all(quoteImportFiles.map((file) => uploadRequestAttachmentFile(file, uploadFolder)))
      const formData = new FormData()
      formData.append('uploadedFiles', JSON.stringify(uploadedFiles))
      const response = await fetch(`/api/rfqs/${rfq.id}/external-quote-import`, {
        method: 'POST',
        body: formData,
      })
      const json = await response.json() as { redirectTo?: string; error?: string }
      if (!response.ok || !json.redirectTo) throw new Error(json.error ?? 'Import failed.')
      setQuoteImportFiles([])
      setQuoteImportOpen(false)
      router.push(json.redirectTo)
      router.refresh()
    } catch (error) {
      setQuoteImportError(error instanceof Error ? error.message : 'Import failed.')
    } finally {
      setQuoteImportBusy(false)
    }
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col" style={{ background: '#eef3f0' }}>
      <div className="shrink-0 border-b" style={{ borderColor: '#d9e0dc', background: '#f8faf9' }}>
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: '#1e3a2f', color: '#ffffff' }}>
              <FileSpreadsheet className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold" style={{ color: '#1e3a2f' }}>{rfq.title}</p>
              <p className="truncate text-xs" style={{ color: '#587067' }}>
                {visibleItems.length} line items · {bids.length} vendor quotes · {fullQuoteCount} complete
              </p>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="rounded-md border bg-white px-2.5 py-1 text-xs font-semibold" style={{ borderColor: '#d9e0dc', color: '#1e3a2f' }}>
              Lowest complete: {lowestBid ? `${lowestBid.vendor_name} ${fmt(lowestBid.total_price)}` : 'None'}
            </span>
            <span className="rounded-md border bg-white px-2.5 py-1 text-xs font-semibold" style={{ borderColor: '#d9e0dc', color: '#1e3a2f' }}>
              Fastest: {fastestBid ? `${fastestBid.vendor_name} ${fastestBid.lead_time_days}d` : 'None'}
            </span>
            <div className="flex items-center rounded-md border bg-white" style={{ borderColor: '#d9e0dc' }}>
              <button
                type="button"
                onClick={() => void undo()}
                disabled={!canUndo}
                aria-label="Undo last workbook edit"
                title="Undo"
                className="flex h-8 w-8 items-center justify-center transition disabled:cursor-not-allowed disabled:opacity-35"
                style={{ color: '#4a6358' }}
              >
                <Undo2 className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => void redo()}
                disabled={!canRedo}
                aria-label="Redo workbook edit"
                title="Redo"
                className="flex h-8 w-8 items-center justify-center border-l transition disabled:cursor-not-allowed disabled:opacity-35"
                style={{ borderColor: '#d9e0dc', color: '#4a6358' }}
              >
                <Redo2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="relative" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                onClick={() => setHistoryMenuOpen((open) => !open)}
                className="flex h-8 items-center gap-1.5 rounded-md border bg-white px-2.5 text-xs font-bold transition"
                style={{ borderColor: '#d9e0dc', color: '#4a6358' }}
              >
                <Clock3 className="h-4 w-4" aria-hidden="true" />
                History
              </button>
              {historyMenuOpen && (
                <div className="absolute right-0 top-[calc(100%+6px)] z-30 max-h-80 w-72 overflow-auto rounded-md border bg-white p-1 shadow-xl" style={{ borderColor: '#d9e0dc' }}>
                  {versions.length === 0 ? (
                    <div className="px-3 py-2 text-xs font-medium" style={{ color: '#8a9e96' }}>No saved versions yet.</div>
                  ) : versions.map((version) => (
                    <button
                      key={version.id}
                      type="button"
                      onClick={() => void restoreWorkbookVersion(version.id)}
                      className="block w-full rounded px-3 py-2 text-left hover:bg-[#edf3f0]"
                    >
                      <span className="block text-xs font-bold" style={{ color: '#1e3a2f' }}>
                        Version {version.versionNumber} · {workbookVersionSourceLabel(version.source)}
                      </span>
                      <span className="block truncate text-[11px] font-semibold" style={{ color: version.source === 'agent-proposal' ? '#a85c2a' : '#4a6358' }}>
                        {workbookVersionActorLabel(version)}
                      </span>
                      <span className="block truncate text-[11px]" style={{ color: '#587067' }}>{version.summary}</span>
                      <span className="block text-[10px]" style={{ color: '#8a9e96' }}>{new Date(version.createdAt).toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setQuoteImportOpen(true)}
              className="flex h-8 items-center gap-1.5 rounded-md border bg-white px-2.5 text-xs font-bold transition"
              style={{ borderColor: '#d9e0dc', color: '#4a6358' }}
            >
              <UploadCloud className="h-4 w-4" aria-hidden="true" />
              Add Quote
            </button>
            {sourceFiles.length > 0 && (
              <button
                type="button"
                onClick={() => setSourcePreviewUrl((current) => current ?? sourceFiles[0] ?? null)}
                className="flex h-8 items-center gap-1.5 rounded-md border bg-white px-2.5 text-xs font-bold transition"
                style={{ borderColor: '#d9e0dc', color: '#4a6358' }}
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                Source Files
              </button>
            )}
            <div className="relative" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                onClick={() => setExportMenuOpen((open) => !open)}
                className="rounded-md border bg-white px-3 py-1.5 text-xs font-bold transition"
                style={{ borderColor: '#d9e0dc', color: '#4a6358' }}
              >
                Export
              </button>
              {exportMenuOpen && (
                <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-40 rounded-md border bg-white p-1 shadow-xl" style={{ borderColor: '#d9e0dc' }}>
                  <button type="button" onClick={() => { void exportViaServer('csv'); setExportMenuOpen(false) }} className="block w-full rounded px-3 py-2 text-left text-xs font-semibold hover:bg-[#edf3f0]" style={{ color: '#1e3a2f' }}>CSV</button>
                  <button type="button" onClick={() => { void exportViaServer('xlsx'); setExportMenuOpen(false) }} className="block w-full rounded px-3 py-2 text-left text-xs font-semibold hover:bg-[#edf3f0]" style={{ color: '#1e3a2f' }}>Excel</button>
                  <button type="button" onClick={() => { void exportViaServer('pdf'); setExportMenuOpen(false) }} className="block w-full rounded px-3 py-2 text-left text-xs font-semibold hover:bg-[#edf3f0]" style={{ color: '#1e3a2f' }}>PDF</button>
                </div>
              )}
            </div>
            {exportError && (
              <span className="rounded-md border bg-white px-2.5 py-1 text-xs font-semibold" style={{ borderColor: '#f0c4c4', color: '#9f2d2d' }}>
                {exportError}
              </span>
            )}
          </div>
        </div>

        {quoteImportOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
            <button
              type="button"
              aria-label="Close quote import"
              className="absolute inset-0 bg-black/45"
              onClick={() => {
                if (!quoteImportBusy) setQuoteImportOpen(false)
              }}
            />
            <div className="relative flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl" style={{ border: '1px solid #d9e0dc' }}>
              <div className="flex items-start justify-between gap-4 border-b px-5 py-4" style={{ borderColor: '#d9e0dc' }}>
                <div>
                  <p className="text-xs font-semibold uppercase" style={{ color: '#587067' }}>Quote Import</p>
                  <h3 className="mt-1 text-lg font-bold" style={{ color: '#1e3a2f' }}>Add quotes to this comparison</h3>
                </div>
                <button
                  type="button"
                  disabled={quoteImportBusy}
                  onClick={() => setQuoteImportOpen(false)}
                  className="rounded-md border px-3 py-1.5 text-xs font-bold disabled:opacity-60"
                  style={{ borderColor: '#d9e0dc', color: '#4a6358' }}
                >
                  Close
                </button>
              </div>
              <div className="overflow-y-auto p-5">
                <input
                  ref={quoteImportInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.csv,.tsv,.xlsx,.xls,.xsl,.xml,.txt,application/pdf,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/xml,application/xml,text/plain"
                  className="sr-only"
                  onChange={(event) => {
                    addQuoteImportFiles(event.currentTarget.files)
                    event.currentTarget.value = ''
                  }}
                />
                <button
                  type="button"
                  onClick={() => quoteImportInputRef.current?.click()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    addQuoteImportFiles(event.dataTransfer.files)
                  }}
                  className="flex min-h-40 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 py-7 text-center"
                  style={{ borderColor: '#d6c9bd', background: '#fbfaf8', color: '#4a6358' }}
                >
                  <UploadCloud className="h-8 w-8" style={{ color: '#2d6a4f' }} />
                  <span className="mt-3 text-sm font-bold">Drop additional quote files here</span>
                  <span className="mt-1 text-xs" style={{ color: '#8a9e96' }}>New vendor quote files will be imported into the current comparison.</span>
                </button>
                {quoteImportFiles.length > 0 && (
                  <div className="mt-4 grid gap-2">
                    {quoteImportFiles.map((file) => {
                      const key = uploadFileKey(file)
                      return (
                        <div key={key} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2" style={{ borderColor: '#e2d9cf' }}>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold" style={{ color: '#1e3a2f' }}>{file.name}</p>
                            <p className="text-xs" style={{ color: '#8a9e96' }}>{formatUploadBytes(file.size)}</p>
                          </div>
                          <button
                            type="button"
                            disabled={quoteImportBusy}
                            onClick={() => setQuoteImportFiles((current) => current.filter((entry) => uploadFileKey(entry) !== key))}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-md disabled:opacity-60"
                            style={{ color: '#b84a3a' }}
                            aria-label={`Remove ${file.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
                {quoteImportError && (
                  <div className="mt-4 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: '#f5c6c6', background: '#fff7f7', color: '#9b2c2c' }}>
                    {quoteImportError}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 border-t px-5 py-4" style={{ borderColor: '#d9e0dc' }}>
                <span className="text-xs font-semibold" style={{ color: '#587067' }}>
                  {quoteImportFiles.length} file{quoteImportFiles.length === 1 ? '' : 's'} selected
                </span>
                <button
                  type="button"
                  disabled={quoteImportFiles.length === 0 || quoteImportBusy}
                  onClick={() => void submitAdditionalQuoteImport()}
                  className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ background: '#fa6b04' }}
                >
                  {quoteImportBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {quoteImportBusy ? 'Importing...' : 'Add to Comparison'}
                </button>
              </div>
            </div>
          </div>
        )}

        {sourcePreviewUrl && (
          <div className="fixed bottom-6 right-6 top-24 z-40 flex w-[min(46rem,46vw)] min-w-[28rem] flex-col overflow-hidden rounded-xl border bg-white shadow-2xl" style={{ borderColor: '#d9e0dc' }}>
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: '#d9e0dc', background: '#f8faf9' }}>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase" style={{ color: '#587067' }}>Source Files</p>
                <p className="truncate text-sm font-bold" style={{ color: '#1e3a2f' }}>{sourceFilenameFromUrl(sourcePreviewUrl)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={sourcePreviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border bg-white px-3 py-1.5 text-xs font-bold"
                  style={{ borderColor: '#d9e0dc', color: '#4a6358' }}
                >
                  Open
                </a>
                <a
                  href={sourcePreviewUrl}
                  download={sourceFilenameFromUrl(sourcePreviewUrl)}
                  className="rounded-md border bg-white px-3 py-1.5 text-xs font-bold"
                  style={{ borderColor: '#d9e0dc', color: '#4a6358' }}
                >
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => setSourcePreviewUrl(null)}
                  className="rounded-md border px-3 py-1.5 text-xs font-bold"
                  style={{ borderColor: '#d9e0dc', color: '#4a6358' }}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto border-b px-3 py-2" style={{ borderColor: '#d9e0dc' }}>
              {sourceFiles.map((url) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setSourcePreviewUrl(url)}
                  className="max-w-52 shrink-0 truncate rounded-md border px-2.5 py-1 text-xs font-semibold"
                  style={url === sourcePreviewUrl
                    ? { borderColor: '#1e3a2f', background: '#1e3a2f', color: '#ffffff' }
                    : { borderColor: '#d9e0dc', background: '#ffffff', color: '#4a6358' }}
                >
                  {sourceFilenameFromUrl(url)}
                </button>
              ))}
            </div>
            <SourceFilePreview url={sourcePreviewUrl} />
          </div>
        )}

        <div className="flex min-h-9 items-stretch border-t" style={{ borderColor: '#d9e0dc', background: '#ffffff' }}>
          <div className="flex items-center justify-center" style={{ width: 94, borderRight: baseBorder, fontSize: 12, fontWeight: 700, color: '#2563eb', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
            {visibleCols[sel.c] ? `${colLetter(sel.c)}${sel.r + 1}` : '-'}
          </div>
          <div style={{ width: 30, borderRight: baseBorder, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#587067', fontStyle: 'italic' }}>fx</div>
          <input
            value={getSelValue()}
            onChange={(event) => setSelectedCellValue(event.target.value)}
            className="flex-1 px-3 py-2 outline-none"
            style={{ fontSize: 12, color: '#1f2328', fontFamily: 'ui-monospace, SFMono-Regular, monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            aria-label="Formula bar"
          />
          <div className="hidden items-center gap-2 px-3 lg:flex" style={{ borderLeft: baseBorder }}>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: '#587067' }}>
              <Columns3 className="h-3.5 w-3.5" />
              {visibleCols.length}/{activeCols.length} columns
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: '#587067' }}>
              <Rows3 className="h-3.5 w-3.5" />
              {visibleItems.length}/{items.filter((item) => !(view.deletedLineItemIds ?? []).includes(item.id)).length} rows
            </span>
            {view.highlights.length > 0 && (
              <button type="button" onClick={() => clearHighlights()} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold" style={{ borderColor: '#fcd34d', color: '#92400e', background: '#fef3c7' }}>
                <Eraser className="h-3 w-3" />
                Clear highlights
              </button>
            )}
            {importReviewHighlights.length > 0 && (
              <button
                type="button"
                onClick={() => approveImportReviewHighlights(importReviewHighlights.map((highlight) => highlight.id))}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold"
                style={{ borderColor: '#86efac', color: '#166534', background: '#f0fdf4' }}
              >
                <Check className="h-3 w-3" />
                Approve all import changes
              </button>
            )}
            {importReviewCategoryEntries.map(([category, highlights]) => (
              <button
                key={category}
                type="button"
                onClick={() => approveImportReviewHighlights(highlights.map((highlight) => highlight.id))}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold"
                style={{ borderColor: '#fecaca', color: '#9f1239', background: '#fff7f7' }}
              >
                <Check className="h-3 w-3" />
                Approve {importReviewCategoryLabel(category)} ({highlights.length})
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2 text-[11px] font-semibold" style={{ borderColor: '#e6ece8', background: '#ffffff', color: '#587067' }}>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-6 rounded-sm" style={{ background: '#dcfce7' }} />
            Lowest line total
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-6 rounded-sm" style={{ background: '#dbeafe' }} />
            Fastest lead time
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-6 rounded-sm" style={{ background: '#ffffff', border: '3px dotted #f97316' }} />
            Alternate or substitution
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-6 rounded-sm" style={{ background: '#ffffff', border: '2px solid #d64545' }} />
            Spec issue
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-6 rounded-sm" style={{ background: PRICING_MISTAKE_HIGHLIGHT, border: '1px solid #c084fc' }} />
            Pricing mistake
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-6 rounded-sm" style={{ background: IMPORT_REVIEW_HIGHLIGHT, border: '1px solid #fca5a5' }} />
            Importer change review
          </span>
          <label className="inline-flex items-center gap-1.5">
            <span>Threshold</span>
            <input
              type="number"
              min={1}
              max={500}
              value={priceDifferenceThresholdPct}
              onChange={(event) => setPriceDifferenceThresholdPct(Math.max(1, Number(event.target.value) || DEFAULT_MAJOR_UNIT_PRICE_DIFFERENCE_PCT))}
              className="h-6 w-16 rounded border bg-white px-1.5 text-[11px] font-semibold outline-none"
              style={{ borderColor: '#d9e0dc', color: '#1e3a2f' }}
              aria-label="Pricing mistake unit price difference threshold percent"
            />
            <span>% unit price difference</span>
          </label>
        </div>

        {(hiddenColEntries.length > 0 || view.hiddenLineItemIds.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2" style={{ borderColor: '#e6ece8', background: '#ffffff' }}>
            {hiddenColEntries.length > 0 && <span className="text-[11px] font-semibold" style={{ color: '#587067' }}>Hidden columns</span>}
            {hiddenColEntries.map((c) => (
              <button key={c.key} type="button" onClick={() => showColumns([c.key])} className="rounded-md px-2 py-1 text-[11px] font-semibold transition hover:bg-[#fff7ed]" style={{ background: '#fff1e8', border: '1px solid #f2b38f', color: '#a85c2a' }}>
                Show {c.label}
              </button>
            ))}
            {view.hiddenLineItemIds.length > 0 && (
              <button type="button" onClick={() => showLineItems(view.hiddenLineItemIds)} className="rounded-md px-2 py-1 text-[11px] font-semibold transition hover:bg-[#f1f5f3]" style={{ background: '#edf3f0', border: '1px solid #d9e0dc', color: '#1e3a2f' }}>
                Show {view.hiddenLineItemIds.length} hidden row{view.hiddenLineItemIds.length === 1 ? '' : 's'}
              </button>
            )}
          </div>
        )}
      </div>

      {activeSpecBubble && (
        <div
          className="fixed z-30 max-h-[min(420px,calc(100vh-2rem))] w-[min(460px,calc(100vw-2rem))] overflow-auto rounded-xl border bg-white p-3 shadow-2xl"
          style={{
            top: activeSpecBubble.anchor.top,
            left: activeSpecBubble.anchor.left,
            borderColor: activeSpecBubble.finding.substitution_verdict === 'not_up_to_spec' ? '#f5c6c6' : '#fdc89a',
            boxShadow: '0 18px 45px rgba(30,58,47,0.18)',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: activeSpecBubble.finding.substitution_verdict === 'not_up_to_spec' ? '#c0392b' : '#a85c2a' }}>
                {activeSpecBubble.finding.substitution_verdict === 'up_to_spec' ? 'Up-To-Spec Substitution' : 'Not Up To Spec'}
              </p>
              <p className="mt-1 text-sm font-semibold leading-tight" style={{ color: '#1e3a2f' }}>
                {activeSpecBubble.bid.vendor_name} · {activeSpecBubble.item.description}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="rounded-full border px-2 py-0.5 text-[10px] font-bold capitalize" style={{
                background: activeSpecBubble.finding.substitution_verdict === 'not_up_to_spec' ? '#fff5f5' : '#fff7ed',
                borderColor: activeSpecBubble.finding.substitution_verdict === 'not_up_to_spec' ? '#f5c6c6' : '#fdc89a',
                color: activeSpecBubble.finding.substitution_verdict === 'not_up_to_spec' ? '#c0392b' : '#a85c2a',
              }}>
                {activeSpecBubble.finding.substitution_verdict === 'up_to_spec' ? 'up to spec' : 'not up to spec'}
              </span>
              <button
                type="button"
                aria-label="Close spec justification"
                onClick={() => setOpenSpecBubble(null)}
                className="flex h-6 w-6 items-center justify-center rounded border text-sm font-bold"
                style={{ borderColor: '#d9e0dc', color: '#587067', background: '#ffffff' }}
              >
                ×
              </button>
            </div>
          </div>
          <SubstitutionPacketSummary item={activeSpecBubble.item} response={activeSpecBubble.response} />
          <p className="mt-2 text-xs leading-relaxed" style={{ color: '#4a6358' }}>
            {activeSpecBubble.finding.explanation}
          </p>
          {activeSpecBubble.finding.evidence.length > 0 && (
            <div className="mt-2 space-y-2">
              {activeSpecBubble.finding.evidence.slice(0, 4).map((evidence, index) => (
                <p key={`selected-substitution-evidence-${activeSpecBubble.finding.id}-${index}`} className="rounded border px-2.5 py-2 text-[11px] leading-relaxed" style={{ borderColor: '#d9e0dc', background: '#f8faf9', color: '#587067' }}>
                  <span className="font-bold" style={{ color: '#1e3a2f' }}>
                    {specDocumentHrefForEvidence(evidence, specDocuments) ? (
                      <a href={specDocumentHrefForEvidence(evidence, specDocuments)} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline" style={{ color: '#1e3a2f' }}>
                        {evidence.document_name}
                      </a>
                    ) : evidence.document_name}, p. {evidence.page_start}{evidence.page_end !== evidence.page_start ? `-${evidence.page_end}` : ''}
                    {evidence.section_number ? ` · ${evidence.section_number}` : ''}
                  </span>
                  {`: ${evidence.quote}`}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
      {activePricingMistakeBubble && (
        <div
          className="fixed z-30 w-[min(420px,calc(100vw-2rem))] rounded-xl border bg-white p-3 shadow-2xl"
          style={{
            top: activePricingMistakeBubble.anchor.top,
            left: activePricingMistakeBubble.anchor.left,
            borderColor: activePricingMistakeBubble.highlight.color.toLowerCase() === IMPORT_REVIEW_HIGHLIGHT ? '#fca5a5' : '#c084fc',
            boxShadow: '0 18px 45px rgba(30,58,47,0.18)',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: activePricingMistakeBubble.highlight.color.toLowerCase() === IMPORT_REVIEW_HIGHLIGHT ? '#b42318' : '#7e22ce' }}>
                {activePricingMistakeBubble.highlight.color.toLowerCase() === IMPORT_REVIEW_HIGHLIGHT ? 'Importer Change Review' : 'Pricing Mistake Candidate'}
              </p>
              <p className="mt-1 text-sm font-semibold leading-tight" style={{ color: '#1e3a2f' }}>
                {activePricingMistakeBubble.col.vendorName ?? 'Vendor'} · {activePricingMistakeBubble.item.description}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {activePricingMistakeBubble.highlight.color.toLowerCase() === IMPORT_REVIEW_HIGHLIGHT && (
                <button
                  type="button"
                  aria-label="Approve importer change"
                  title="Approve this importer change"
                  onClick={() => approveImportReviewHighlights([activePricingMistakeBubble.highlight.id])}
                  className="flex h-6 w-6 items-center justify-center rounded border text-sm font-bold"
                  style={{ borderColor: '#86efac', color: '#166534', background: '#f0fdf4' }}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                aria-label="Close pricing mistake explanation"
                onClick={() => setOpenPricingMistakeBubble(null)}
                className="flex h-6 w-6 items-center justify-center rounded border text-sm font-bold"
                style={{ borderColor: '#d9e0dc', color: '#587067', background: '#ffffff' }}
              >
                ×
              </button>
            </div>
          </div>
          <p
            className="mt-2 rounded border px-2.5 py-2 text-xs leading-relaxed"
            style={activePricingMistakeBubble.highlight.color.toLowerCase() === IMPORT_REVIEW_HIGHLIGHT
              ? { borderColor: '#fecaca', background: '#fff7f7', color: '#7f1d1d' }
              : { borderColor: '#d8b4fe', background: '#faf5ff', color: '#4a2a68' }}
          >
            {activePricingMistakeBubble.highlight.note ?? 'This price is materially different from comparable quotes. Confirm the unit of measure before relying on this comparison.'}
          </p>
        </div>
      )}

      {/* Scrollable grid */}
      <div
        ref={containerRef}
        data-testid="comparison-grid-container"
        className="flex-1 min-h-0 overflow-auto outline-none"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onCopy={onCopySelectedRange}
        onPaste={onPasteIntoSelection}
        style={{ background: '#ffffff', userSelect: 'none', WebkitUserSelect: 'none' }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `${GUTTER_W}px ${visibleCols.map((c) => `${colWidth(c)}px`).join(' ')} repeat(${EXTRA_COLS}, ${EXTRA_COL_W}px)`,
            gridAutoRows: `${ROW_H}px`,
            position: 'relative',
            width: 'max-content',
            minWidth: '100%',
          }}
        >
          {/* Top-left corner (sticky both ways) */}
          <div style={{ ...gutterBase, gridRow: 1, gridColumn: 1, position: 'sticky', top: COL_LETTER_TOP, left: 0, zIndex: 8, background: '#edf3f0', borderBottom: baseBorder, borderRight: strongBorder }} />

          {/* Column-letter row */}
          {visibleCols.map((col, c) => (
            <div
              key={`colletter-${col.key}`}
              style={{
                ...gutterBase,
                gridRow: 1,
                gridColumn: c + 2,
                position: 'sticky',
                top: COL_LETTER_TOP,
                zIndex: col.key === frozenColumnKey ? 7 : 5,
                background: sel.c === c ? '#dbeafe' : '#f4f7f5',
                textAlign: 'center',
                justifyContent: 'center',
                ...(col.key === frozenColumnKey ? { left: GUTTER_W, borderRight: strongBorder } : {}),
              }}
              onMouseDown={() => { setSel((s) => ({ ...s, c })); setRangeStart({ r: sel.r, c }) }}
              onContextMenu={(e) => openContextMenu(e, undefined, col.key)}
            >
              <span style={{ position: 'relative', width: '100%', textAlign: 'center', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
                {colLetter(c)}
              </span>
              <div
                onMouseDown={(e) => onResizeStart(col, e)}
                style={{ position: 'absolute', top: 0, right: -4, width: 8, height: '100%', cursor: 'col-resize', zIndex: 7 }}
              />
            </div>
          ))}
          {/* Column-letter row (extra empty cols) */}
          {Array.from({ length: EXTRA_COLS }).map((_, i) => {
            const c = visibleCols.length + i
            return (
              <div
              key={`colletter-extra-${i}`}
              style={{ ...gutterBase, gridRow: 1, gridColumn: visibleCols.length + 2 + i, position: 'sticky', top: COL_LETTER_TOP, zIndex: 5, background: sel.c === c ? '#dbeafe' : '#f4f7f5', textAlign: 'center', justifyContent: 'center' }}
              onMouseDown={() => setSel((s) => ({ ...s, c }))}
              onContextMenu={(e) => openContextMenu(e)}
            >
                <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>{colLetter(c)}</span>
              </div>
            )
          })}

          {/* === Group header row === */}
          <div
            style={{ ...gutterBase, gridRow: groupHeaderRowIdx + 1, gridColumn: 1, position: 'sticky', top: GROUP_HEADER_TOP, left: 0, zIndex: 8, background: sel.r === groupHeaderRowIdx ? '#dbeafe' : '#edf3f0', borderRight: strongBorder }}
            onClick={() => setSel((s) => ({ ...s, r: groupHeaderRowIdx }))}
          >
            {groupHeaderRowIdx + 1}
          </div>
          {(() => {
            const groups = []
            let cursor = 0
            while (cursor < visibleCols.length) {
              const col = visibleCols[cursor]
              if (col.kind === 'vendor' && col.vendorId) {
                let span = 0
                while (cursor + span < visibleCols.length && visibleCols[cursor + span].vendorId === col.vendorId) span++
                groups.push({ col, start: cursor, span, kind: 'vendor' as const })
                cursor += span
              } else {
                let span = 0
                while (cursor + span < visibleCols.length && visibleCols[cursor + span].kind !== 'vendor') span++
                groups.push({ col, start: cursor, span, kind: 'requested' as const })
                cursor += span
              }
            }
            return groups.flatMap(({ col, start, span, kind }) => {
              if (kind === 'vendor' && col.kind === 'vendor' && col.vendorId) {
                const vendorId = col.vendorId
                const groupKey = groupKeyForColumn(col, start)
                const groupLabel = groupLabelForColumn(col, start)
                const accent = vendorColors[vendorId] ?? '#1e3a2f'
                return [
                  <div
                    key={`gh-vendor-${vendorId}-${start}`}
                    onClick={() => setSel((s) => ({ ...s, r: groupHeaderRowIdx, c: start }))}
                    onDoubleClick={() => startGroupHeaderEdit(col, start)}
                    style={{
                      ...groupHeaderBase,
                      gridRow: groupHeaderRowIdx + 1,
                      gridColumn: `${start + 2} / span ${span}`,
                      position: 'sticky',
                      top: GROUP_HEADER_TOP,
                      zIndex: 4,
                      background: accent,
                    }}
                    title={groupLabel}
                  >
                    {editingGroupHeader?.groupKey === groupKey ? (
                      <input
                        autoFocus
                        value={draftValue}
                        onChange={(event) => setDraftValue(event.target.value)}
                        onBlur={commitGroupHeaderEdit}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') { event.preventDefault(); commitGroupHeaderEdit() }
                          if (event.key === 'Escape') { event.preventDefault(); setEditingGroupHeader(null) }
                        }}
                        style={{ width: '100%', height: ROW_H - 6, border: '1px solid #2563eb', borderRadius: 3, padding: '0 6px', fontSize: 12, outline: 'none', background: '#ffffff', color: '#111827', fontWeight: 800, textAlign: 'center', textTransform: 'none' }}
                      />
                    ) : (
                      <span style={cellTextStyle}>{groupLabel}</span>
                    )}
                  </div>,
                ]
              }
              const groupKey = groupKeyForColumn(col, start)
              const groupLabel = groupLabelForColumn(col, start)
              const renderRequestedGroupCell = (cellStart: number, cellSpan: number, stickyFrozen = false) => (
                <div
                  key={`gh-mr-${cellStart}-${stickyFrozen ? 'frozen' : 'scroll'}`}
                  onClick={() => setSel((s) => ({ ...s, r: groupHeaderRowIdx, c: cellStart }))}
                  onDoubleClick={() => startGroupHeaderEdit(col, start)}
                  style={{
                    ...groupHeaderBase,
                    gridRow: groupHeaderRowIdx + 1,
                    gridColumn: `${cellStart + 2} / span ${cellSpan}`,
                    position: 'sticky',
                    top: GROUP_HEADER_TOP,
                    zIndex: stickyFrozen ? 7 : 4,
                    ...(stickyFrozen ? { left: GUTTER_W, borderRight: strongBorder } : {}),
                  }}
                  title={groupLabel}
                >
                  {editingGroupHeader?.groupKey === groupKey ? (
                    <input
                      autoFocus
                      value={draftValue}
                      onChange={(event) => setDraftValue(event.target.value)}
                      onBlur={commitGroupHeaderEdit}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') { event.preventDefault(); commitGroupHeaderEdit() }
                        if (event.key === 'Escape') { event.preventDefault(); setEditingGroupHeader(null) }
                      }}
                      style={{ width: '100%', height: ROW_H - 6, border: '1px solid #2563eb', borderRadius: 3, padding: '0 6px', fontSize: 12, outline: 'none', background: '#ffffff', color: '#111827', fontWeight: 800, textAlign: 'center', textTransform: 'none' }}
                    />
                  ) : (
                    <span style={cellTextStyle}>{stickyFrozen ? '' : groupLabel}</span>
                  )}
                </div>
              )
              if (col.key === frozenColumnKey) {
                return span > 1
                  ? [renderRequestedGroupCell(start, 1, true), renderRequestedGroupCell(start + 1, span - 1)]
                  : [renderRequestedGroupCell(start, 1, true)]
              }
              return [renderRequestedGroupCell(start, span)]
            })
          })()}
          {/* Group header — empty cap covering the EXTRA_COLS gutter on the right */}
          <div
            style={{
              ...groupHeaderBase,
              gridRow: groupHeaderRowIdx + 1,
              gridColumn: `${visibleCols.length + 2} / span ${EXTRA_COLS}`,
              position: 'sticky',
              top: GROUP_HEADER_TOP,
              zIndex: 4,
              background: '#3a574c',
            }}
          />

          {/* === Field header row === */}
          <div
            style={{ ...gutterBase, gridRow: fieldHeaderRowIdx + 1, gridColumn: 1, position: 'sticky', top: FIELD_HEADER_TOP, left: 0, zIndex: 8, background: sel.r === fieldHeaderRowIdx ? '#dbeafe' : '#edf3f0', borderRight: strongBorder }}
            onClick={() => setSel((s) => ({ ...s, r: fieldHeaderRowIdx }))}
          >
            {fieldHeaderRowIdx + 1}
          </div>
          {visibleCols.map((col, c) => (
            <div
              key={`fh-${col.key}`}
              onMouseDown={(event) => startRangeSelect(fieldHeaderRowIdx, c, event)}
              onMouseEnter={() => extendRangeSelect(fieldHeaderRowIdx, c)}
              onDoubleClick={() => startHeaderEdit(col)}
              onContextMenu={(e) => openContextMenu(e, undefined, col.key)}
              style={{
                ...headerCellBase,
                gridRow: fieldHeaderRowIdx + 1,
                gridColumn: c + 2,
                position: 'sticky',
                top: FIELD_HEADER_TOP,
                zIndex: col.key === frozenColumnKey ? 7 : 4,
                justifyContent: alignToJustify(col.align),
                ...(col.key === frozenColumnKey ? { left: GUTTER_W, borderRight: strongBorder } : {}),
                ...selRing(fieldHeaderRowIdx, c),
              }}
              title={col.label}
            >
              {editingHeader?.colKey === col.key ? (
                <input
                  autoFocus
                  value={draftValue}
                  onChange={(event) => setDraftValue(event.target.value)}
                  onBlur={commitHeaderEdit}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') { event.preventDefault(); commitHeaderEdit() }
                    if (event.key === 'Escape') { event.preventDefault(); setEditingHeader(null) }
                  }}
                  style={{ width: '100%', height: ROW_H - 6, border: '1px solid #2563eb', borderRadius: 3, padding: '0 6px', fontSize: 12, outline: 'none', background: '#ffffff', color: '#111827', fontWeight: 700 }}
                />
              ) : (
                <span style={cellTextStyle}>{col.label}</span>
              )}
            </div>
          ))}
          {/* Field header — empty filler */}
          {Array.from({ length: EXTRA_COLS }).map((_, i) => {
            const c = visibleCols.length + i
            return (
              <div
                key={`fh-extra-${i}`}
                onClick={() => setSel({ r: fieldHeaderRowIdx, c })}
                  style={{ ...headerCellBase, gridRow: fieldHeaderRowIdx + 1, gridColumn: visibleCols.length + 2 + i, position: 'sticky', top: FIELD_HEADER_TOP, zIndex: 4, ...selRing(fieldHeaderRowIdx, c) }}
                  onContextMenu={(e) => openContextMenu(e)}
              />
            )
          })}

          {/* Data rows */}
          {visibleItems.map((item, idx) => {
            const r = dataStartRow + idx
            const stripe = idx % 2 === 0 ? '#ffffff' : '#fbfbfb'
            return (
              <Fragment key={`data-${item.id}`}>
                <div
                  style={{ ...gutterBase, gridRow: r + 1, gridColumn: 1, position: 'sticky', left: 0, zIndex: 3, background: sel.r === r ? '#dbeafe' : stripe }}
                  onClick={() => setSel((s) => ({ ...s, r }))}
                  onContextMenu={(e) => openContextMenu(e, item.id)}
                >
                  {r + 1}
                </div>
                {visibleCols.map((col, c) => {
                  const cellKey = `${item.id}|${col.key}`
                  const previewValue = previewCellMap.get(cellKey)
                  const value = previewValue ?? getCellText(item, col)
                  const hasPreview = previewValue !== undefined || previewHighlightMap.has(cellKey)
                  const bid = col.vendorId ? bids.find((entry) => entry.id === col.vendorId) : undefined
                  const response = bid?.line_item_responses.find((entry) => entry.line_item_id === item.id)
                  const state = bid ? vendorCellState(item, bid, response) : { tone: 'normal' as const, tooltip: '' }
                  const isQuoteValueMetric = col.kind === 'vendor' && (
                    col.vendorMetric === 'unit_price' ||
                    col.vendorMetric === 'total' ||
                    col.vendorMetric === 'lead'
                  )
                  const cellState = isQuoteValueMetric ? state : { tone: 'normal' as const, tooltip: '' }
                  const best = bestByItem.get(item.id)
                  const isLowestPrice = col.kind === 'vendor' && col.vendorMetric === 'total' && Boolean(col.vendorId && best?.totalVendorIds.has(col.vendorId))
                  const isFastestLead = col.kind === 'vendor' && col.vendorMetric === 'lead' && Boolean(col.vendorId && best?.leadVendorIds.has(col.vendorId))
                  const autoHighlight = isLowestPrice ? '#dcfce7' : isFastestLead ? '#dbeafe' : undefined
                  const highlight = previewHighlightMap.get(cellKey) ?? (hasPreview ? '#fef3c7' : highlightMap.get(cellKey) ?? autoHighlight)
                  const highlightNote = highlightNoteMap.get(cellKey)
                  const cellHighlight = highlightByCellMap.get(cellKey)
                  const isPricingMistakeHighlight = highlight?.toLowerCase() === PRICING_MISTAKE_HIGHLIGHT
                  const isImportReviewHighlight = highlight?.toLowerCase() === IMPORT_REVIEW_HIGHLIGHT
                  const isSelected = sel.r === r && sel.c === c
                  const inRange = isInSelectedRange(r, c)
                  const isFrozen = col.key === frozenColumnKey
                  const stateStyle: React.CSSProperties =
                    cellState.tone === 'violation' || cellState.tone === 'review'
                      ? { color: '#8b1d1d', borderTop: '2px solid #d64545', borderBottom: '2px solid #d64545' }
                      : cellState.tone === 'up_to_spec_substitution' || cellState.tone === 'alternate'
                        ? { borderTop: '3px dotted #f97316', borderBottom: '3px dotted #f97316' }
                        : {}
                  if (cellState.tone !== 'normal' && col.kind === 'vendor' && col.vendorMetric === 'unit_price') stateStyle.borderLeft =
                    cellState.tone === 'violation' || cellState.tone === 'review'
                      ? '2px solid #d64545'
                      : '3px dotted #f97316'
                  if (cellState.tone !== 'normal' && col.kind === 'vendor' && col.vendorMetric === 'lead') stateStyle.borderRight =
                    cellState.tone === 'violation' || cellState.tone === 'review'
                      ? '2px solid #d64545'
                      : '3px dotted #f97316'
                  const canOpenSpecBubble = Boolean(
                    bid &&
                    response?.is_alternate &&
                    isQuoteValueMetric &&
                    'finding' in cellState &&
                    cellState.finding?.review_kind === 'substitution',
                  )
                  const canOpenPricingMistakeBubble = Boolean((isPricingMistakeHighlight || isImportReviewHighlight) && highlightNote)
                  const canApproveImportReview = Boolean(isImportReviewHighlight && cellHighlight)
                  return (
                    <div
                      key={`cell-${item.id}-${col.key}`}
                      className="group"
                      data-testid="comparison-grid-cell"
                      data-row-index={r}
                      data-col-index={c}
                      data-col-key={col.key}
                      data-row-key={item.id}
                      onMouseDown={(event) => startRangeSelect(r, c, event)}
                      onMouseEnter={() => extendRangeSelect(r, c)}
                      onDoubleClick={() => startCellEdit(item, col)}
                      onContextMenu={(e) => openContextMenu(e, item.id, col.key)}
                      title={[
                        isLowestPrice ? 'Lowest total price for this item.' : '',
                        isFastestLead ? 'Fastest lead time for this item.' : '',
                        canOpenPricingMistakeBubble ? `Click the lightbulb for ${isImportReviewHighlight ? 'importer change details' : 'pricing mistake reasoning'}.` : '',
                        canOpenSpecBubble ? 'Click the lightbulb for spec justification.' : cellState.tooltip,
                      ].filter(Boolean).join('\n')}
                      style={{
                        ...cellBase,
                        gridRow: r + 1,
                        gridColumn: c + 2,
                        ...stateStyle,
                        position: isFrozen ? 'sticky' : 'relative',
                        background: isSelected ? (highlight ?? '#dbeafe') : inRange ? (highlight ?? '#eff6ff') : (highlight ?? stateStyle.background ?? stripe),
                        fontWeight: col.kind === 'vendor' && col.vendorMetric === 'total' ? 600 : 400,
                        color: stateStyle.color ?? '#24292f',
                        justifyContent: alignToJustify(col.align),
                        fontVariantNumeric: col.align === 'right' ? 'tabular-nums' : 'normal',
                        ...(isFrozen ? { position: 'sticky', left: GUTTER_W, zIndex: 2, borderRight: strongBorder } : {}),
                        ...(hasPreview ? { boxShadow: 'inset 0 0 0 2px #f59e0b' } : {}),
                        ...(isSelected ? { boxShadow: 'inset 0 0 0 2px #2563eb' } : inRange ? { boxShadow: 'inset 0 0 0 1px #93c5fd' } : {}),
                      }}
                    >
                      {editingCell?.rowKey === item.id && editingCell.colKey === col.key ? (
                        <input
                          autoFocus
                          value={draftValue}
                          onChange={(event) => setDraftValue(event.target.value)}
                          onBlur={commitCellEdit}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') { event.preventDefault(); commitCellEdit() }
                            if (event.key === 'Escape') { event.preventDefault(); setEditingCell(null) }
                          }}
                          style={{ width: '100%', height: ROW_H - 6, border: '1px solid #2563eb', borderRadius: 3, padding: '0 6px', fontSize: 12, outline: 'none', background: '#ffffff', color: '#111827' }}
                        />
                      ) : (
                        <span style={cellTextStyle}>{value}</span>
                      )}
                      {canOpenSpecBubble && bid && (
                        <button
                          type="button"
                          aria-label={`Open spec justification for ${bid.vendor_name} ${item.description}`}
                          title="Open spec justification"
                          onMouseDown={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                          }}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            setOpenSpecBubble({ itemId: item.id, bidId: bid.id, anchor: bubbleAnchor(event.currentTarget) })
                          }}
                          className="absolute right-1 top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border opacity-0 shadow-sm transition group-hover:opacity-100 focus:opacity-100"
                          style={{
                            background: '#fff7cc',
                            borderColor: '#f4c95d',
                            color: '#74531a',
                          }}
                        >
                          <Lightbulb className="h-3 w-3" aria-hidden="true" />
                        </button>
                      )}
                      {canOpenPricingMistakeBubble && (
                        <button
                          type="button"
                          aria-label={`Open ${isImportReviewHighlight ? 'importer change details' : 'pricing mistake reasoning'} for ${item.description}`}
                          title={highlightNote}
                          onMouseDown={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                          }}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            setOpenPricingMistakeBubble({ itemId: item.id, colKey: col.key, anchor: bubbleAnchor(event.currentTarget) })
                          }}
                          className="absolute right-1 top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border opacity-0 shadow-sm transition group-hover:opacity-100 focus:opacity-100"
                          style={isImportReviewHighlight
                            ? { background: '#fff7f7', borderColor: '#fca5a5', color: '#b42318' }
                            : { background: '#faf5ff', borderColor: '#c084fc', color: '#7e22ce' }}
                        >
                          <Lightbulb className="h-3 w-3" aria-hidden="true" />
                        </button>
                      )}
                      {canApproveImportReview && cellHighlight && (
                        <button
                          type="button"
                          aria-label={`Approve importer change for ${item.description}`}
                          title="Approve importer change"
                          onMouseDown={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                          }}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            approveImportReviewHighlights([cellHighlight.id])
                          }}
                          className="absolute right-7 top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border opacity-0 shadow-sm transition group-hover:opacity-100 focus:opacity-100"
                          style={{ background: '#f0fdf4', borderColor: '#86efac', color: '#166534' }}
                        >
                          <Check className="h-3 w-3" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  )
                })}
                {/* Empty filler cells extending to the right */}
                {Array.from({ length: EXTRA_COLS }).map((_, i) => {
                  const c = visibleCols.length + i
                  const isSelected = sel.r === r && sel.c === c
                  const inRange = isInSelectedRange(r, c)
                  return (
                    <div
                      key={`cell-${item.id}-extra-${i}`}
                      onMouseDown={(event) => startRangeSelect(r, c, event)}
                      onMouseEnter={() => extendRangeSelect(r, c)}
                      onContextMenu={(e) => openContextMenu(e, item.id)}
                      style={{ ...cellBase, gridRow: r + 1, gridColumn: visibleCols.length + 2 + i, background: isSelected ? '#dbeafe' : inRange ? '#eff6ff' : stripe, ...(isSelected ? { boxShadow: 'inset 0 0 0 2px #2563eb' } : inRange ? { boxShadow: 'inset 0 0 0 1px #93c5fd' } : {}) }}
                    />
                  )
                })}
              </Fragment>
            )
          })}

          {/* Totals row */}
          <div style={{ ...gutterBase, gridRow: totalsRow + 1, gridColumn: 1, position: 'sticky', left: 0, zIndex: 3, background: sel.r === totalsRow ? '#dbeafe' : '#edf3f0', borderTop: strongBorder }} onClick={() => setSel((s) => ({ ...s, r: totalsRow }))}>
            {totalsRow + 1}
          </div>
          {visibleCols.map((col, c) => {
            const isSelected = sel.r === totalsRow && sel.c === c
            let value = ''
            if (col.kind === 'vendor' && col.vendorId) {
              const bid = bids.find((b) => b.id === col.vendorId)
              if (bid) {
                if (col.vendorMetric === 'total') value = moneyShort(bid.total_price)
                else if (col.vendorMetric === 'lead') value = `${bid.lead_time_days}d`
              }
            } else if (c === 0) value = 'Total'
            return (
              <div
                key={`totals-${col.key}`}
                onClick={() => setSel({ r: totalsRow, c })}
                style={{
                  ...cellBase,
                  gridRow: totalsRow + 1,
                  gridColumn: c + 2,
                  background: '#edf3f0',
                  borderTop: strongBorder,
                  fontWeight: col.kind === 'vendor' && col.vendorMetric === 'total' ? 700 : c === 0 ? 600 : 400,
                  color: '#1e3a2f',
                  justifyContent: alignToJustify(col.align),
                  fontVariantNumeric: col.align === 'right' ? 'tabular-nums' : 'normal',
                  ...(col.key === frozenColumnKey ? { position: 'sticky', left: GUTTER_W, zIndex: 2, borderRight: strongBorder } : {}),
                  ...(isSelected ? { boxShadow: 'inset 0 0 0 2px #2563eb', background: '#dbeafe' } : {}),
                }}
              >
                {value}
              </div>
            )
          })}
          {/* Totals row — empty filler cells */}
          {Array.from({ length: EXTRA_COLS }).map((_, i) => {
            const c = visibleCols.length + i
            const isSelected = sel.r === totalsRow && sel.c === c
            return (
              <div
                key={`totals-extra-${i}`}
                onClick={() => setSel({ r: totalsRow, c })}
                style={{ ...cellBase, gridRow: totalsRow + 1, gridColumn: visibleCols.length + 2 + i, background: '#edf3f0', borderTop: strongBorder, ...(isSelected ? { boxShadow: 'inset 0 0 0 2px #2563eb', background: '#dbeafe' } : {}) }}
              />
            )
          })}

          {/* Empty rows below totals — Excel-feel filler */}
          {Array.from({ length: EXTRA_ROWS }).map((_, k) => {
            const r = totalsRow + 1 + k
            return (
              <Fragment key={`empty-row-${k}`}>
                <div
                  onClick={() => setSel((s) => ({ ...s, r }))}
                  style={{ ...gutterBase, gridRow: r + 1, gridColumn: 1, position: 'sticky', left: 0, zIndex: 3, background: sel.r === r ? '#dbeafe' : '#fafbfc' }}
                >
                  {r + 1}
                </div>
                {Array.from({ length: totalGridCols }).map((_, c) => {
                  const isSelected = sel.r === r && sel.c === c
                  return (
                    <div
                      key={`empty-row-${k}-c-${c}`}
                      onClick={() => setSel({ r, c })}
                      style={{ ...cellBase, gridRow: r + 1, gridColumn: c + 2, background: '#ffffff', ...(isSelected ? { boxShadow: 'inset 0 0 0 2px #2563eb', background: '#dbeafe' } : {}) }}
                    />
                  )
                })}
              </Fragment>
            )
          })}
        </div>
      </div>

      {contextMenu && createPortal(
        <div
          role="menu"
          onClick={(event) => event.stopPropagation()}
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 1000,
            minWidth: 210,
            border: '1px solid #d9e0dc',
            borderRadius: 6,
            background: '#ffffff',
            boxShadow: '0 12px 32px rgba(31, 41, 55, 0.18)',
            padding: 4,
            color: '#1e3a2f',
            fontSize: 12,
          }}
        >
          {(() => {
            const sortLabels = sortLabelsForColumn(contextMenu.colKey)
            const hasCellColor = Boolean(contextMenu.rowKey && contextMenu.colKey && highlightMap.get(`${contextMenu.rowKey}|${contextMenu.colKey}`))
            return (
              <>
          <button type="button" role="menuitem" onClick={() => makeManualColumn(contextMenu.colKey, 'left')} className="block w-full rounded px-3 py-2 text-left font-medium hover:bg-[#edf3f0]">
            Insert column left
          </button>
          <button type="button" role="menuitem" onClick={() => makeManualColumn(contextMenu.colKey, 'right')} className="block w-full rounded px-3 py-2 text-left font-medium hover:bg-[#edf3f0]">
            Insert column right
          </button>
          <button type="button" role="menuitem" onClick={() => renameColumnInline(contextMenu.colKey)} className="block w-full rounded px-3 py-2 text-left font-medium hover:bg-[#edf3f0]">
            Rename column
          </button>
          <div style={{ margin: '4px 0', borderTop: '1px solid #edf3f0' }} />
          <button type="button" role="menuitem" onClick={() => makeManualRow(contextMenu.rowKey, 'above')} className="block w-full rounded px-3 py-2 text-left font-medium hover:bg-[#edf3f0]">
            Insert row above
          </button>
          <button type="button" role="menuitem" onClick={() => makeManualRow(contextMenu.rowKey, 'below')} className="block w-full rounded px-3 py-2 text-left font-medium hover:bg-[#edf3f0]">
            Insert row below
          </button>
          <div style={{ margin: '4px 0', borderTop: '1px solid #edf3f0' }} />
          <button type="button" role="menuitem" onClick={() => contextMenu.colKey ? hideColumns([contextMenu.colKey]) : setContextMenu(null)} className="block w-full rounded px-3 py-2 text-left font-medium hover:bg-[#edf3f0]">
            Hide column
          </button>
          <button type="button" role="menuitem" onClick={() => contextMenu.rowKey ? hideLineItems([contextMenu.rowKey]) : setContextMenu(null)} className="block w-full rounded px-3 py-2 text-left font-medium hover:bg-[#edf3f0]">
            Hide row
          </button>
          <button type="button" role="menuitem" onClick={() => deleteContextColumn(contextMenu.colKey)} className="block w-full rounded px-3 py-2 text-left font-medium hover:bg-[#fff7ed]" style={{ color: '#a85c2a' }}>
            Delete column
          </button>
          <button type="button" role="menuitem" onClick={() => deleteContextRow(contextMenu.rowKey)} className="block w-full rounded px-3 py-2 text-left font-medium hover:bg-[#fff7ed]" style={{ color: '#a85c2a' }}>
            Delete row
          </button>
          <button type="button" role="menuitem" onClick={() => deleteContextCells(contextMenu.rowKey, contextMenu.colKey)} className="block w-full rounded px-3 py-2 text-left font-medium hover:bg-[#fff7ed]" style={{ color: '#a85c2a' }}>
            Delete cells
          </button>
          <div style={{ margin: '4px 0', borderTop: '1px solid #edf3f0' }} />
          <button type="button" role="menuitem" onClick={() => sortRowsByColumn(contextMenu.colKey, 'asc')} className="block w-full rounded px-3 py-2 text-left font-medium hover:bg-[#edf3f0]">
            {sortLabels.asc}
          </button>
          <button type="button" role="menuitem" onClick={() => sortRowsByColumn(contextMenu.colKey, 'desc')} className="block w-full rounded px-3 py-2 text-left font-medium hover:bg-[#edf3f0]">
            {sortLabels.desc}
          </button>
          <button type="button" role="menuitem" disabled={!hasCellColor} onClick={() => sortRowsByCellColor(contextMenu.rowKey, contextMenu.colKey)} className="block w-full rounded px-3 py-2 text-left font-medium hover:bg-[#edf3f0] disabled:cursor-not-allowed disabled:opacity-45">
            Sort by Color
          </button>
          <button type="button" role="menuitem" onClick={() => sortRowsByColumn(contextMenu.colKey, 'asc')} className="block w-full rounded px-3 py-2 text-left font-medium hover:bg-[#edf3f0]">
            Custom Sort...
          </button>
          <button type="button" role="menuitem" onClick={() => hideBlankRowsForColumn(contextMenu.colKey)} className="block w-full rounded px-3 py-2 text-left font-medium hover:bg-[#edf3f0]">
            Filter blanks in column
          </button>
          <button type="button" role="menuitem" onClick={() => clearCell(contextMenu.rowKey, contextMenu.colKey)} className="block w-full rounded px-3 py-2 text-left font-medium hover:bg-[#fff7ed]" style={{ color: '#a85c2a' }}>
            Clear cell edit
          </button>
              </>
            )
          })()}
        </div>,
        document.body,
      )}

      {/* Status bar */}
      <div className="flex items-center justify-between shrink-0" style={{ borderTop: baseBorder, background: '#f6f8fa', padding: '4px 10px', fontSize: 11, color: '#57606a' }}>
        <span>{visibleItems.length} of {items.filter((item) => !(view.deletedLineItemIds ?? []).includes(item.id)).length} items · {bids.length} vendors · {visibleCols.length} of {activeCols.length} columns · {selectedRange.r2 - selectedRange.r1 + 1}x{selectedRange.c2 - selectedRange.c1 + 1} selected</span>
        <span>Double-click or Enter to edit · Drag to select · Right-click rows/columns · ⌘Z undo · ⌘Y redo · ⌘K AI</span>
      </div>

      <BidComparisonAssistant
        isOpen={assistantOpen}
        isClosing={assistantClosing}
        currentView={view}
        sheetSchema={sheetSchema}
        snapshot={comparisonSheetSnapshot}
        onApply={applyPatchToView}
        onHistoryCommand={applyWorkbookHistoryCommand}
        canUndoSavedVersion={canUndo}
        canRedoSavedVersion={canRedo}
        onPreviewChange={setPreviewPatch}
        onDismiss={() => dispatchAssistant(false)}
      />
    </div>
  )
}

export function BidDashboard({
  projectId,
  projectName = projectId,
  rfq,
  bids,
  specDocuments = [],
  demoMode = false,
  section = 'all',
  userKey = 'anon',
}: {
  projectId: string
  projectName?: string
  rfq: ContractorRFQ
  bids: ContractorBid[]
  specDocuments?: ProjectSpecDocumentSummary[]
  demoMode?: boolean
  section?: 'all' | 'comparison' | 'decision'
  userKey?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({})
  const [decisionStatuses, setDecisionStatuses] = useState<Record<string, ContractorBid['buyer_decision_status']>>({})
  const [negotiationDrafts, setNegotiationDrafts] = useState<Record<string, string>>({})
  const [selectedBidId, setSelectedBidId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [dashboardSettings, setDashboardSettings] = useState(DEFAULT_DASHBOARD_SETTINGS)
  const [dashboardSettingsLoaded, setDashboardSettingsLoaded] = useState(false)
  const [recheckingBidIds, setRecheckingBidIds] = useState<Record<string, boolean>>({})
  const autoSpecChecksStartedRef = useRef(new Set<string>())

  // Auto-refresh every 5s if there are no bids yet (waiting for generation)
  useEffect(() => {
    if (bids.length > 0) return
    const id = setInterval(() => router.refresh(), 5000)
    return () => clearInterval(id)
  }, [bids.length, router])

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DASHBOARD_SETTINGS_STORAGE_KEY)
      if (saved) {
        setDashboardSettings({ ...DEFAULT_DASHBOARD_SETTINGS, ...(JSON.parse(saved) as Partial<typeof DEFAULT_DASHBOARD_SETTINGS>) })
      }
    } catch {
      setDashboardSettings(DEFAULT_DASHBOARD_SETTINGS)
    } finally {
      setDashboardSettingsLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (!dashboardSettingsLoaded) return
    window.localStorage.setItem(DASHBOARD_SETTINGS_STORAGE_KEY, JSON.stringify(dashboardSettings))
  }, [dashboardSettings, dashboardSettingsLoaded])

  useEffect(() => {
    if (demoMode || bids.length === 0) return
    const missingReports = bids.filter((bid) => !bid.spec_compliance_report && !autoSpecChecksStartedRef.current.has(bid.id))
    if (missingReports.length === 0) return

    for (const bid of missingReports) {
      autoSpecChecksStartedRef.current.add(bid.id)
      setRecheckingBidIds((prev) => ({ ...prev, [bid.id]: true }))
      startTransition(async () => {
        const result = await rerunBidSpecComplianceAction(projectId, rfq.id, bid.id)
        if (!result.success) {
          setActionError(result.error ?? 'Spec compliance check failed.')
        }
        setRecheckingBidIds((prev) => ({ ...prev, [bid.id]: false }))
        router.refresh()
      })
    }
  }, [bids, demoMode, projectId, rfq.id, router])

  if (bids.length === 0) {
    return (
      <div className="mt-6 rounded-2xl p-6 text-center" style={{ background: '#fff3eb', border: '1px solid #fdc89a' }}>
        <div className="flex items-center justify-center gap-2">
          <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full" style={{ background: '#fa6b04' }} />
          <p className="text-sm font-medium" style={{ color: '#1e3a2f' }}>
            RFQ published - waiting for quotes to come in…
          </p>
        </div>
        <p className="mt-1 text-xs" style={{ color: '#a85c2a' }}>
          This page will update automatically as quotes arrive.
        </p>
      </div>
    )
  }

  const comparisonSummary = buildLiveQuoteComparisonSummary(rfq, bids)
  const fullBids = comparisonSummary.sortedBids.filter((bid) =>
    comparisonSummary.evaluation.vendors.find((vendor) => vendor.vendorId === (bid.vendor_id ?? bid.vendor_email ?? bid.id))?.completeComparable,
  )
  const lowestBid = comparisonSummary.lowestCompleteBid
  const fastestBid = comparisonSummary.fastestBid
  const selectedBid = selectedBidId ? bids.find((bid) => bid.id === selectedBidId) : undefined

  function getMentionQuery(bid: ContractorBid): string | null {
    const draft = negotiationDrafts[bid.id] ?? ''
    const match = draft.match(/@([^\s@]*)$/)
    return match ? match[1].toLowerCase() : null
  }

  function getMentionableItems(bid: ContractorBid) {
    const query = getMentionQuery(bid)
    if (query === null) return []
    return bid.line_item_responses
      .filter((item) => {
        const text = `${item.sku} ${item.description}`.toLowerCase()
        return text.includes(query)
      })
      .slice(0, 5)
  }

  function insertItemMention(bid: ContractorBid, sku: string) {
    const draft = negotiationDrafts[bid.id] ?? ''
    const nextDraft = draft.match(/@([^\s@]*)$/)
      ? draft.replace(/@([^\s@]*)$/, `@${sku} `)
      : `${draft}${draft.endsWith(' ') || draft.length === 0 ? '' : ' '}@${sku} `
    setNegotiationDrafts((prev) => ({ ...prev, [bid.id]: nextDraft }))
  }

  function updateDecision(bid: ContractorBid, status: NonNullable<ContractorBid['buyer_decision_status']>) {
    if (demoMode) return
    setActionError('')
    setDecisionStatuses((prev) => ({ ...prev, [bid.id]: status }))
    startTransition(async () => {
      const result = await updateBidDecisionAction(rfq.id, bid.id, {
        buyerDecisionStatus: status,
        decisionRationale: decisionNotes[bid.id] ?? bid.decision_rationale,
      })
      if (!result.success) {
        setActionError(result.error ?? 'Failed to update quote decision.')
        setDecisionStatuses((prev) => ({ ...prev, [bid.id]: bid.buyer_decision_status }))
        return
      }
      router.refresh()
    })
  }

  function saveRationale(bid: ContractorBid) {
    if (demoMode) return
    setActionError('')
    startTransition(async () => {
      const result = await updateBidDecisionAction(rfq.id, bid.id, {
        buyerDecisionStatus: decisionStatuses[bid.id] ?? bid.buyer_decision_status,
        decisionRationale: decisionNotes[bid.id] ?? bid.decision_rationale,
      })
      if (!result.success) {
        setActionError(result.error ?? 'Failed to save decision rationale.')
        return
      }
      router.refresh()
    })
  }

  function sendNegotiationNote(bid: ContractorBid) {
    if (demoMode) return
    startTransition(async () => {
      await addNegotiationMessageAction(rfq.id, bid.id, negotiationDrafts[bid.id] ?? '')
      setNegotiationDrafts((prev) => ({ ...prev, [bid.id]: '' }))
      router.refresh()
    })
  }

  function createRemainderDraft(bid: ContractorBid) {
    if (demoMode) return
    startTransition(async () => {
      const result = await createRemainderRFQAction(projectId, rfq.id, bid.id)
      if (result.redirectTo) {
        router.push(result.redirectTo)
      } else {
        router.refresh()
      }
    })
  }

  function rerunSpecCompliance(bid: ContractorBid) {
    if (demoMode) return
    setActionError('')
    setRecheckingBidIds((prev) => ({ ...prev, [bid.id]: true }))
    startTransition(async () => {
      const result = await rerunBidSpecComplianceAction(projectId, rfq.id, bid.id)
      if (!result.success) {
        setActionError(result.error ?? 'Spec compliance check failed.')
        setRecheckingBidIds((prev) => ({ ...prev, [bid.id]: false }))
        return
      }
      setRecheckingBidIds((prev) => ({ ...prev, [bid.id]: false }))
      router.refresh()
    })
  }

  function rerunAllSpecCompliance() {
    if (demoMode) return
    for (const bid of bids) rerunSpecCompliance(bid)
  }

  const showComparison = section === 'all' || section === 'comparison'
  const showDecision = section === 'all' || section === 'decision'
  const vendorColors = buildVendorColorMap(bids)

  return (
    <div className={section === 'comparison' ? 'flex h-full min-h-0 flex-col' : section === 'all' ? 'mt-8' : ''}>
      {showComparison && (
        <BidExcelSheet rfq={rfq} bids={bids} vendorColors={vendorColors} userKey={userKey} specDocuments={specDocuments} persistViewToServer={!demoMode} />
      )}

      {showDecision && (
        <div className={showComparison ? 'mt-8 space-y-4' : 'space-y-4'}>
        <h3 className="text-sm font-semibold" style={{ color: '#4a6358' }}>Decision Support</h3>
        {actionError && (
          <div className="rounded-xl px-4 py-3 text-sm" style={{ background: '#fdeaea', border: '1px solid #f5c6c6', color: '#c0392b' }}>
            {actionError}
          </div>
        )}
        {bids
          .slice()
          .sort((a, b) => comparisonSummary.sortedBids.findIndex((bid) => bid.id === a.id) - comparisonSummary.sortedBids.findIndex((bid) => bid.id === b.id))
          .map((bid) => (
            <div key={`decision-${bid.id}`} className="rounded-2xl p-5" style={{ background: '#ffffff', border: '1px solid #e2d9cf', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-base font-semibold" style={{ color: '#1e3a2f' }}>{bid.vendor_name}</h4>
                    {bid.buyer_decision_status && (
                      <span className="rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ background: '#1e3a2f' }}>
                        {bid.buyer_decision_status.replace('_', ' ')}
                      </span>
                    )}
                    {bid.fulfillment_summary?.partial && (
                      <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: '#fdf0e8', color: '#a85c2a' }}>
                        Partial fulfillment
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-sm" style={{ color: '#8a9e96' }}>
                    <span>Total {fmt(bid.total_price)}</span>
                    <span>Lead time {bid.lead_time_days}d</span>
                    {bid.terms?.payment_terms && <span>{bid.terms.payment_terms}</span>}
                    {bid.fulfillment_summary && (
                      <span>
                        Coverage {Math.round((bid.fulfillment_summary.coverage_ratio ?? 0) * 100)}%
                      </span>
                    )}
                  </div>
                  {(bid.compliance_declarations ?? []).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {bid.compliance_declarations?.map((entry) => (
                        <span
                          key={`${bid.id}-${entry.code}`}
                          className="rounded-full px-2.5 py-1 text-xs font-medium"
                          style={entry.status === 'does_not_match'
                            ? { background: '#fdeaea', color: '#c0392b' }
                            : { background: '#e8f4ee', color: '#2d6a4f' }}
                        >
                          {entry.label}
                        </span>
                      ))}
                    </div>
                  )}
                  {(bid.risk_flags ?? []).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {bid.risk_flags?.map((flag) => (
                        <span key={`${bid.id}-${flag.code}`} className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: '#fdf0e8', color: '#a85c2a' }}>
                          {flag.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:w-[340px]">
                  {(['preferred', 'alternate', 'hold', 'do_not_use'] as const).map((status) => {
                    const activeStatus = decisionStatuses[bid.id] ?? bid.buyer_decision_status
                    const isActive = activeStatus === status
                    return (
                    <button
                      key={`${bid.id}-${status}`}
                      type="button"
                      disabled={isPending || demoMode}
                      onClick={() => {
                        if (demoMode) return
                        setActionError('')
                        setDecisionStatuses((prev) => ({ ...prev, [bid.id]: status }))
                        startTransition(async () => {
                          const result = await updateBidDecisionAction(rfq.id, bid.id, {
                            buyerDecisionStatus: status,
                            decisionRationale: decisionNotes[bid.id] ?? bid.decision_rationale,
                          })
                          if (!result.success) {
                            setActionError(result.error ?? 'Failed to update quote decision.')
                            setDecisionStatuses((prev) => ({ ...prev, [bid.id]: bid.buyer_decision_status }))
                            return
                          }
                          router.refresh()
                        })
                      }}
                      className="rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-60 transition-colors"
                      style={isActive
                        ? { background: '#1e3a2f', color: '#ffffff', border: '1px solid #1e3a2f' }
                        : { background: '#ffffff', border: '1px solid #e2d9cf', color: '#4a6358' }}
                    >
                      Mark {status.replace('_', ' ')}
                    </button>
                    )
                  })}
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Decision Rationale</label>
                  <textarea
                    rows={3}
                    value={decisionNotes[bid.id] ?? bid.decision_rationale ?? ''}
                    onChange={(e) => setDecisionNotes((prev) => ({ ...prev, [bid.id]: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
                    style={{ background: '#ede8e2', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
                    placeholder="Why is this vendor preferred, alternate, or on hold?"
                  />
                  <div className="mt-2">
                    <button
                      type="button"
                      disabled={isPending || demoMode}
                      onClick={() => {
                        if (demoMode) return
                        setActionError('')
                        startTransition(async () => {
                          const result = await updateBidDecisionAction(rfq.id, bid.id, {
                            buyerDecisionStatus: decisionStatuses[bid.id] ?? bid.buyer_decision_status,
                            decisionRationale: decisionNotes[bid.id] ?? bid.decision_rationale,
                          })
                          if (!result.success) {
                            setActionError(result.error ?? 'Failed to save decision rationale.')
                            return
                          }
                          router.refresh()
                        })
                      }}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60 transition-colors"
                      style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#4a6358' }}
                    >
                      Save rationale
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Negotiation Thread</label>
                  <div className="rounded-xl p-3" style={{ background: '#ede8e2', border: '1px solid #e2d9cf' }}>
                    <div className="max-h-36 space-y-2 overflow-y-auto">
                      {(bid.negotiation_messages ?? []).length === 0 ? (
                        <p className="text-xs" style={{ color: '#8a9e96' }}>No negotiation messages yet.</p>
                      ) : (
                        bid.negotiation_messages?.map((message) => (
                          <div key={message.id} className="rounded-lg px-3 py-2 text-xs" style={{ background: '#ffffff', color: '#4a6358' }}>
                            <p className="font-semibold" style={{ color: '#1e3a2f' }}>{message.author_name}</p>
                            <p className="mt-1">{message.message}</p>
                          </div>
                        ))
                      )}
                    </div>
                    <textarea
                      rows={2}
                      value={negotiationDrafts[bid.id] ?? ''}
                      onChange={(e) => setNegotiationDrafts((prev) => ({ ...prev, [bid.id]: e.target.value }))}
                      className="mt-3 w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
                      style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
                      placeholder="Ask about substitutions, pricing, lead time, or terms…"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                      type="button"
                      disabled={isPending || demoMode || !(negotiationDrafts[bid.id] ?? '').trim()}
                      onClick={() => startTransition(async () => {
                        if (demoMode) return
                        await addNegotiationMessageAction(rfq.id, bid.id, negotiationDrafts[bid.id] ?? '')
                          setNegotiationDrafts((prev) => ({ ...prev, [bid.id]: '' }))
                          router.refresh()
                        })}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60 transition-colors"
                        style={{ background: '#1e3a2f' }}
                      >
                        Send note
                      </button>
                      <button
                      type="button"
                      disabled={isPending || demoMode}
                      onClick={() => startTransition(async () => {
                        if (demoMode) return
                        const result = await createRemainderRFQAction(projectId, rfq.id, bid.id)
                          if (result.redirectTo) {
                            router.push(result.redirectTo)
                          } else {
                            router.refresh()
                          }
                        })}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60 transition-colors"
                        style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#4a6358' }}
                      >
                        Create remainder draft
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedBid && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: 'rgba(30, 58, 47, 0.28)', backdropFilter: 'blur(8px)' }}
          onClick={() => setSelectedBidId(null)}
        >
          <aside
            className="ml-auto flex h-full w-full max-w-xl flex-col shadow-2xl"
            style={{ background: '#ffffff' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shrink-0 px-6 py-5" style={{ borderBottom: '1px solid #e2d9cf', background: '#f5f0eb' }}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#8a9e96' }}>Line Items</p>
                  <h3 className="mt-1 text-xl font-bold leading-tight" style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: '#1e3a2f' }}>
                    {selectedBid.vendor_name}
                  </h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <CoverageBadge bid={selectedBid} />
                    <SpecComplianceControl
                      bid={selectedBid}
                      onRecheck={rerunSpecCompliance}
                      disabled={isPending || demoMode}
                      busy={Boolean(recheckingBidIds[selectedBid.id])}
                    />
                    <span className="text-sm font-bold" style={{ color: '#4a6358' }}>{selectedBid.lead_time_days}d lead</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedBidId(null)}
                  className="rounded-xl px-3 py-1.5 text-xs font-bold transition-colors"
                  style={{ background: '#f5f0eb', border: '1px solid #e2d9cf', color: '#4a6358' }}
                >
                  Close x
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {actionError && (
                <div className="mx-6 mt-4 rounded-xl px-4 py-3 text-sm" style={{ background: '#fdeaea', border: '1px solid #f5c6c6', color: '#c0392b' }}>
                  {actionError}
                </div>
              )}

              {selectedBid.spec_compliance_report && (
                <div className="mx-6 mt-4 rounded-xl p-4" style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#8a9e96' }}>Spec Compliance</p>
                      <p className="mt-1 text-sm font-semibold" style={{ color: '#1e3a2f' }}>
                        {specComplianceLabel(selectedBid)}
                        {selectedBid.spec_compliance_report.high_severity_count > 0
                          ? ` · ${selectedBid.spec_compliance_report.high_severity_count} high-severity issue${selectedBid.spec_compliance_report.high_severity_count === 1 ? '' : 's'}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <SpecComplianceControl
                        bid={selectedBid}
                        onRecheck={rerunSpecCompliance}
                        disabled={isPending || demoMode}
                        busy={Boolean(recheckingBidIds[selectedBid.id])}
                      />
                    </div>
                  </div>
                  {selectedBid.spec_compliance_report.summary_status === 'violation' && (
                    <div className="mt-3 rounded-md px-3 py-2 text-xs font-medium" style={{ background: '#fdeaea', border: '1px solid #f5c6c6', color: '#c0392b' }}>
                      This quote has possible spec violations. Review the evidence before marking it preferred.
                    </div>
                  )}
                  {selectedBid.spec_compliance_report.error && (
                    <p className="mt-3 text-xs" style={{ color: '#c0392b' }}>{selectedBid.spec_compliance_report.error}</p>
                  )}
                  <div className="mt-3 space-y-3">
                    {selectedBid.spec_compliance_report.items.length === 0 ? (
                      <p className="text-xs" style={{ color: '#8a9e96' }}>
                        {selectedBid.spec_compliance_report.summary_status === 'no_specs_available'
                          ? 'No indexed project specs were available when this quote was checked.'
                          : 'No line-item findings were produced.'}
                      </p>
                    ) : (
                      selectedBid.spec_compliance_report.items.map((finding) => {
                        const item = rfq.line_items.find((entry) => entry.id === finding.rfq_line_item_id)
                        return (
                          <div key={finding.id} className="rounded-md p-3" style={{ background: '#f5f0eb', border: '1px solid #e2d9cf' }}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-bold" style={{ color: '#1e3a2f' }}>{item?.description ?? 'Line item'}</p>
                              <span className="rounded-full px-2 py-0.5 text-[11px] font-bold capitalize" style={{
                                background: finding.status === 'violation' ? '#fdeaea' : finding.status === 'compliant' ? '#e8f4ee' : '#ffffff',
                                color: finding.status === 'violation' ? '#c0392b' : finding.status === 'compliant' ? '#2d6a4f' : '#4a6358',
                                border: '1px solid #e2d9cf',
                              }}>
                                {finding.substitution_verdict
                                  ? finding.substitution_verdict.replace(/_/g, ' ')
                                  : finding.status.replace(/_/g, ' ')}
                              </span>
                            </div>
                            {finding.review_kind === 'substitution' && (
                              <p className="mt-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: finding.substitution_verdict === 'not_up_to_spec' ? '#c0392b' : '#2d6a4f' }}>
                                Substitution spec verdict
                              </p>
                            )}
                            <p className="mt-2 text-xs leading-relaxed" style={{ color: '#4a6358' }}>{finding.explanation}</p>
                            {finding.requirement_summary && (
                              <p className="mt-2 text-xs" style={{ color: '#4a6358' }}><span className="font-bold">Spec:</span> {finding.requirement_summary}</p>
                            )}
                            {finding.vendor_summary && (
                              <p className="mt-1 text-xs" style={{ color: '#4a6358' }}><span className="font-bold">Vendor:</span> {finding.vendor_summary}</p>
                            )}
                            {finding.suggested_follow_up && (
                              <p className="mt-2 text-xs font-medium" style={{ color: '#a85c2a' }}>{finding.suggested_follow_up}</p>
                            )}
                            {finding.evidence.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {finding.evidence.slice(0, 2).map((evidence, index) => (
                                  <p key={`${finding.id}-evidence-${index}`} className="text-[11px] leading-relaxed" style={{ color: '#8a9e96' }}>
                                    {specDocumentHrefForEvidence(evidence, specDocuments) ? (
                                      <a href={specDocumentHrefForEvidence(evidence, specDocuments)} target="_blank" rel="noreferrer" className="font-semibold underline-offset-2 hover:underline" style={{ color: '#587067' }}>
                                        {evidence.document_name}
                                      </a>
                                    ) : evidence.document_name}, p. {evidence.page_start}{evidence.page_end !== evidence.page_start ? `-${evidence.page_end}` : ''}
                                    {evidence.section_number ? ` · ${evidence.section_number}` : ''}: {evidence.quote}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )}

              <table className="w-full table-fixed text-sm">
                <thead className="sticky top-0 z-10 text-[10px] font-bold uppercase tracking-wider" style={{ background: '#ede8e2', color: '#8a9e96' }}>
                  <tr>
                    <th className="w-[40%] px-5 py-3 text-left">Item</th>
                    <th className="w-[12%] px-3 py-3 text-right">Req&apos;d</th>
                    <th className="w-[12%] px-3 py-3 text-right">Unit $</th>
                    <th className="w-[12%] px-3 py-3 text-right">Total</th>
                    <th className="w-[10%] px-3 py-3 text-right">Lead</th>
                    <th className="w-[14%] px-3 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rfq.line_items.map((item) => {
                    const response = selectedBid.line_item_responses.find((entry) => entry.line_item_id === item.id)
                    const unavailable = !response || response.availability === 'unavailable'
                    const quantity = response?.quoted_quantity ?? response?.quantity ?? item.quantity
                    const isAlternate = Boolean(response?.is_alternate)
                    const substitutionFinding = lineSpecFinding(selectedBid, item.id)
                    const substitutionLabel = substitutionFinding?.substitution_verdict === 'up_to_spec'
                      ? 'Up-To-Spec Substitution'
                      : substitutionFinding?.substitution_verdict === 'not_up_to_spec'
                        ? 'Not Up To Spec'
                        : 'Substitution'
                    return (
                      <tr key={`${selectedBid.id}-line-${item.id}`} className="align-middle" style={{ borderBottom: '1px solid #e2d9cf' }}>
                        <td className="px-5 py-3.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold leading-snug" style={{ color: unavailable ? '#8a9e96' : '#1e3a2f' }}>
                              {item.description}
                            </p>
                            {isAlternate && (
                              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{
                                background: substitutionFinding?.substitution_verdict === 'not_up_to_spec' ? '#fdeaea' : substitutionFinding?.substitution_verdict === 'up_to_spec' ? '#e8f4ee' : '#fff7cc',
                                color: substitutionFinding?.substitution_verdict === 'not_up_to_spec' ? '#c0392b' : substitutionFinding?.substitution_verdict === 'up_to_spec' ? '#2d6a4f' : '#74531a',
                                border: `1px solid ${substitutionFinding?.substitution_verdict === 'not_up_to_spec' ? '#f5c6c6' : substitutionFinding?.substitution_verdict === 'up_to_spec' ? '#a8d5ba' : '#d7ad43'}`,
                              }}>
                                {substitutionLabel}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: unavailable ? '#b7c3be' : '#8a9e96' }}>
                            Requested SKU: {item.sku || '-'}
                          </p>
                          {response?.sku && (
                            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: unavailable ? '#b7c3be' : '#4a6358' }}>
                              Vendor SKU: {response.sku}
                            </p>
                          )}
                          {isAlternate && response?.description && response.description !== item.description && (
                            <p className="mt-1 text-[11px] leading-snug" style={{ color: '#74531a' }}>
                              Quoted: {response.description}
                            </p>
                          )}
                          {response?.quoted_product_details && (
                            <p className="mt-1 text-[11px] leading-snug" style={{ color: '#4a6358' }}>
                              {response.quoted_product_details}
                            </p>
                          )}
                          {isAlternate && parseSubstitutionAttachments(response).length > 0 && (
                            <p className="mt-1 text-[11px] leading-snug" style={{ color: '#587067' }}>
                              Attachments: {parseSubstitutionAttachments(response).map((file) => file.filename).join(', ')}
                            </p>
                          )}
                          {(response?.response_attributes ?? []).filter((attribute) => attribute.key !== SUBSTITUTION_ATTACHMENTS_KEY).length > 0 && (
                            <p className="mt-1 text-[11px] leading-snug" style={{ color: '#587067' }}>
                              {response!.response_attributes!.filter((attribute) => attribute.key !== SUBSTITUTION_ATTACHMENTS_KEY).map((attribute) => `${attribute.label}: ${attribute.value}`).join(' · ')}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3.5 text-right text-xs font-medium" style={{ color: unavailable ? '#8a9e96' : '#4a6358' }}>
                          <span>{quantity.toLocaleString()}</span>
                          <span className="ml-1 uppercase">{item.unit}</span>
                        </td>
                        <td className="px-3 py-3.5 text-right text-sm font-bold" style={{ color: unavailable ? '#8a9e96' : '#1e3a2f' }}>
                          {unavailable ? '-' : fmt(response.unit_price)}
                        </td>
                        <td className="px-3 py-3.5 text-right text-sm font-bold" style={{ color: unavailable ? '#8a9e96' : '#1e3a2f' }}>
                          {unavailable ? '-' : fmt(response.total_price)}
                        </td>
                        <td className="px-3 py-3.5 text-right text-sm font-medium" style={{ color: unavailable ? '#8a9e96' : '#4a6358' }}>
                          {unavailable ? '-' : `${response.lead_time_days}d`}
                        </td>
                        <td className="px-3 py-3.5 text-left">
                          <AvailabilityBadge availability={response?.availability} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="shrink-0 px-6 py-4" style={{ borderTop: '1px solid #e2d9cf', background: '#f5f0eb' }}>
              <div className="mb-3 flex items-end justify-between gap-4">
                <p className="text-sm font-bold" style={{ color: '#4a6358' }}>Total</p>
                <p className="text-2xl font-bold leading-none" style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}>
                  {fmt(selectedBid.total_price)}
                </p>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
