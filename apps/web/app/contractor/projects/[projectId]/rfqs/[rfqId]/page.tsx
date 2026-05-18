import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  getContractorProject,
  getContractorRFQ,
  getContractorRFQBids,
} from '@/lib/api/contractor'
import { canAccessContractorProject } from '@/lib/auth/project-access'
import { getSession } from '@/lib/auth/session'
import { contractorRFQStatusLabel, contractorRFQStatusStyle } from '@/lib/contractor-display'
import { getMailboxSummary, getRFQEmailWorkflowSummary } from '@/lib/mail/service'
import { buildLiveQuoteComparisonSummary } from '@/lib/procurement/quote-comparison'
import { getNegotiationMessagesForVendor } from '@/lib/store/contractor-store'
import type { ContractorRFQ } from '@/lib/types/contractor'
import { formatDate } from '@/lib/utils'
import { BidDashboard } from './_components/BidDashboard'
import { EditableRFQTitle } from './_components/EditableRFQTitle'
import { ImportStatusBubble } from './_components/ImportStatusBubble'
import { MessageCenter } from './_components/MessageCenter'
import { InviteAdditionalVendorsButton, RFQActions } from './_components/RFQActions'
import { RFQMailboxPanel } from './_components/RFQMailboxPanel'

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return `$${n.toLocaleString()}`
}

function draftEditPath(projectId: string, rfq: ContractorRFQ) {
  const base = rfq.request_type === 'rfp'
    ? `/contractor/projects/${projectId}/rfps/new`
    : `/contractor/projects/${projectId}/rfqs/new`
  return `${base}?rfqId=${encodeURIComponent(rfq.id)}`
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string; rfqId: string }>
}) {
  const { projectId, rfqId } = await params
  const [session, project, rfq] = await Promise.all([
    getSession(),
    getContractorProject(projectId),
    getContractorRFQ(projectId, rfqId),
  ])
  if (!project || !rfq || !canAccessContractorProject(session, project)) return { title: 'RFQ - Rialto' }
  return { title: rfq ? `${rfq.title} - Rialto` : 'RFQ - Rialto' }
}

export default async function RFQDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; rfqId: string }>
  searchParams?: Promise<{ section?: string; importStatus?: string; importMessage?: string }>
}) {
  const { projectId, rfqId } = await params
  const { section, importStatus, importMessage } = (await searchParams) ?? {}
  const activeSection =
    section === 'message-center'
        ? 'message-center'
      : 'bid-comparison'
  const [project, rfq] = await Promise.all([
    getContractorProject(projectId),
    getContractorRFQ(projectId, rfqId),
  ])

  if (!project || !rfq) notFound()

  const [bids, session] = await Promise.all([
    rfq.status === 'active'
      ? getContractorRFQBids(rfq)
      : Promise.resolve([]),
    getSession(),
  ])
  if (!canAccessContractorProject(session, project)) notFound()
  const mailbox = session ? await getMailboxSummary(session.userId) : null
  const emailWorkflowSummary = session && rfq.status === 'active'
    ? await getRFQEmailWorkflowSummary(session.userId, rfq.id)
    : null
  const messageVendors = (rfq.invites ?? [])
    .filter((invite) => invite.vendor_email)
    .map((invite) => ({
      vendorId: invite.vendor_id,
      vendorEmail: invite.vendor_email.toLowerCase(),
      vendorName: invite.vendor_name || invite.vendor_email,
    }))
  const messageVendorThreads = await Promise.all(
    messageVendors.map(async (vendor) => ({
      ...vendor,
      messages: await getNegotiationMessagesForVendor(rfq.id, vendor.vendorEmail, vendor.vendorId),
    })),
  )
  const comparisonSummary = buildLiveQuoteComparisonSummary(rfq, bids)
  const lowestBid = comparisonSummary.lowestCompleteBid
  const fastestBid = comparisonSummary.fastestBid
  const quoteStats = [
    { label: 'Quotes received', value: bids.length.toString(), sub: `${comparisonSummary.fullQuoteCount} full quotes` },
    { label: 'Lowest complete', value: lowestBid ? fmt(lowestBid.total_price) : '-', sub: lowestBid?.vendor_name ?? 'No full quote' },
    { label: 'Fastest lead', value: fastestBid ? `${fastestBid.lead_time_days}d` : '-', sub: fastestBid?.vendor_name ?? 'No quotes' },
  ]
  const isFullScreenComparison = activeSection === 'bid-comparison' && rfq.status === 'active'
  const sectionBaseHref = `/contractor/projects/${projectId}/rfqs/${rfqId}`
  const sectionLinks = [
    {
      key: 'bid-comparison',
      label: 'Quote Comparison',
      href: sectionBaseHref,
    },
    {
      key: 'message-center',
      label: 'Message Center',
      href: `${sectionBaseHref}?section=message-center`,
    },
  ]

  if (isFullScreenComparison) {
    return (
      <div className="-m-6 min-h-[calc(100vh-4rem)]" style={{ background: '#eef3f0' }}>
        <ImportStatusBubble status={importStatus} message={importMessage} />
        <div data-testid="rfq-comparison-overview" className="relative z-20 border-b px-4 pt-3" style={{ borderColor: '#d9e0dc', background: '#f8faf9' }}>
          <nav className="mb-2 text-xs" style={{ color: '#587067' }}>
            <Link href="/contractor/projects" className="hover:underline" style={{ color: '#8a9e96' }}>Projects</Link>
            <span className="mx-2">/</span>
            <Link href={`/contractor/projects/${projectId}`} className="hover:underline" style={{ color: '#8a9e96' }}>{project.name}</Link>
            <span className="mx-2">/</span>
            <span className="font-medium" style={{ color: '#4a6358' }}>{rfq.title}</span>
          </nav>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <EditableRFQTitle
              rfqId={rfq.id}
              initialTitle={rfq.title}
              className="text-lg font-semibold tracking-tight"
              style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}
            />
            <span className={`rounded border px-2 py-0.5 text-xs font-medium ${contractorRFQStatusStyle(rfq.status)}`}>
              {contractorRFQStatusLabel(rfq.status)}
            </span>
            {rfq.bid_deadline && (
              <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: '#fff3eb', color: '#fa6b04', border: '1px solid #fdc89a' }}>
                Due {rfq.bid_deadline}
              </span>
            )}
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <RFQActions rfqId={rfqId} projectId={projectId} status={rfq.status} />
              <InviteAdditionalVendorsButton projectId={projectId} rfq={rfq} projectName={project.name} />
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto">
            {sectionLinks.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="shrink-0 px-3 py-2 text-sm font-semibold transition-colors"
                style={activeSection === item.key
                  ? { color: '#1e3a2f', borderBottom: '2px solid #fa6b04' }
                  : { color: '#8a9e96', borderBottom: '2px solid transparent' }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div data-testid="rfq-comparison-sheet-workspace" className="sticky top-0 z-10 h-[calc(100vh-4rem)] min-h-0 shadow-[0_-1px_0_#d9e0dc,0_12px_28px_rgba(30,58,47,0.12)]">
          <BidDashboard
            projectId={projectId}
            projectName={project.name}
            rfq={rfq}
            bids={bids}
            specDocuments={project.spec_documents ?? []}
            section="comparison"
            userKey={session?.userId ?? 'anon'}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl pb-16">
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm" style={{ color: '#8a9e96' }}>
        <Link href="/contractor/projects" className="hover:underline" style={{ color: '#8a9e96' }}>Projects</Link>
        <span className="mx-2">/</span>
        <Link href={`/contractor/projects/${projectId}`} className="hover:underline" style={{ color: '#8a9e96' }}>{project.name}</Link>
        <span className="mx-2">/</span>
        <span className="font-medium" style={{ color: '#4a6358' }}>{rfq.title}</span>
      </nav>

      {/* Header */}
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {rfq.bid_deadline && (
              <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: '#fff3eb', color: '#fa6b04', border: '1px solid #fdc89a' }}>
                Due {rfq.bid_deadline}
              </span>
            )}
          </div>
          <EditableRFQTitle
            rfqId={rfq.id}
            initialTitle={rfq.title}
            className="text-3xl font-semibold tracking-tight"
            style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className={`rounded border px-2 py-0.5 text-xs font-medium ${contractorRFQStatusStyle(rfq.status)}`}>
              {contractorRFQStatusLabel(rfq.status)}
            </span>
            {rfq.category && (
              <span className="rounded border px-2 py-0.5 text-xs font-medium" style={{ borderColor: '#e2d9cf', background: '#ede8e2', color: '#8a9e96' }}>
                {rfq.category}
              </span>
            )}
            {rfq.published_at && (
              <span className="text-sm" style={{ color: '#8a9e96' }}>Published {formatDate(rfq.published_at)}</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 lg:relative">
          <div className="flex flex-col items-end gap-2 lg:absolute lg:bottom-full lg:right-0 lg:mb-2">
            <div className="flex items-center justify-end gap-2">
              {rfq.status === 'draft' && (
                <Link
                  href={draftEditPath(projectId, rfq)}
                  className="inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{ borderColor: '#e8c4a0', background: '#fdf0e8', color: '#a85c2a' }}
                >
                  Edit Draft
                </Link>
              )}
              <RFQActions rfqId={rfqId} projectId={projectId} status={rfq.status} />
            </div>
            <InviteAdditionalVendorsButton projectId={projectId} rfq={rfq} projectName={project.name} />
          </div>
          {bids.length > 0 && (
            <div className="grid grid-cols-3 overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: '#e2d9cf' }}>
              {quoteStats.map((stat) => (
                <div key={stat.label} className="min-w-0 px-6 py-4" style={{ borderLeft: stat.label === quoteStats[0].label ? 'none' : '1px solid #ede8e2' }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>{stat.label}</p>
                  <p className="mt-1 text-2xl font-bold leading-tight" style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}>
                    {stat.value}
                  </p>
                  <p className="max-w-40 truncate text-xs leading-tight" style={{ color: '#8a9e96' }}>{stat.sub}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <nav className="mb-6 flex gap-1 overflow-x-auto border-b" style={{ borderColor: '#e2d9cf' }}>
        {sectionLinks.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className="shrink-0 px-4 py-3 text-sm font-semibold transition-colors"
            style={activeSection === item.key
              ? { color: '#1e3a2f', borderBottom: '2px solid #fa6b04' }
              : { color: '#8a9e96', borderBottom: '2px solid transparent' }}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {(rfq.rfp_details?.desired_outcome || rfq.rfp_details?.procurement_objective || (rfq.procurement_requirements ?? []).length > 0 || rfq.ai_spec_assistant?.summary) && (
        <div className="mb-5 grid gap-4 lg:grid-cols-2">
          {(rfq.rfp_details?.desired_outcome || rfq.rfp_details?.procurement_objective) && (
            <div className="rounded-xl border bg-white p-4 lg:col-span-2" style={{ borderColor: '#e2d9cf' }}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>RFP Brief</p>
              <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2" style={{ color: '#4a6358' }}>
                {rfq.rfp_details.procurement_objective && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Objective:</span> {rfq.rfp_details.procurement_objective}</p>}
                {rfq.rfp_details.scope_summary && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Scope:</span> {rfq.rfp_details.scope_summary}</p>}
                <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Outcome:</span> {rfq.rfp_details.desired_outcome}</p>
                {rfq.rfp_details.performance_requirements && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Performance:</span> {rfq.rfp_details.performance_requirements}</p>}
                {rfq.rfp_details.approved_alternates && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Alternates:</span> {rfq.rfp_details.approved_alternates}</p>}
                {rfq.rfp_details.quantity_context && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Quantity / Budget:</span> {rfq.rfp_details.quantity_context}</p>}
                {rfq.rfp_details.delivery_zip && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Delivery ZIP:</span> {rfq.rfp_details.delivery_zip}</p>}
                {rfq.rfp_details.delivery_logistics && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Logistics:</span> {rfq.rfp_details.delivery_logistics}</p>}
                {rfq.rfp_details.delivery_window && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Delivery window:</span> {rfq.rfp_details.delivery_window}</p>}
                {rfq.rfp_details.phased_delivery && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Phasing:</span> {rfq.rfp_details.phased_delivery}</p>}
                {rfq.rfp_details.submittals_required && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Submittals:</span> {rfq.rfp_details.submittals_required}</p>}
                {rfq.rfp_details.lead_time_sensitivity && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Lead time:</span> {rfq.rfp_details.lead_time_sensitivity}</p>}
                {rfq.rfp_details.exclusions && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Exclusions:</span> {rfq.rfp_details.exclusions}</p>}
                {rfq.rfp_details.unknowns_or_questions && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Unknowns:</span> {rfq.rfp_details.unknowns_or_questions}</p>}
                {rfq.rfp_details.vendor_questions_requested && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Vendor questions:</span> {rfq.rfp_details.vendor_questions_requested}</p>}
                {rfq.rfp_details.vendor_guidance_requested && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Vendor guidance:</span> {rfq.rfp_details.vendor_guidance_requested}</p>}
                {rfq.rfp_details.attachments_summary && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Attachments summary:</span> {rfq.rfp_details.attachments_summary}</p>}
              </div>
            </div>
          )}
          {(rfq.procurement_requirements ?? []).length > 0 && (
            <div className="rounded-xl border bg-white p-4" style={{ borderColor: '#e2d9cf' }}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>Supplier Requirements</p>
              <div className="flex flex-wrap gap-2">
                {(rfq.procurement_requirements ?? []).map((requirement) => (
                  <span key={requirement.code} className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: '#ede8e2', color: '#4a6358' }}>
                    {requirement.label}
                  </span>
                ))}
              </div>
            </div>
          )}
          {rfq.ai_spec_assistant?.summary && (
            <div className="rounded-xl border p-4 lg:col-span-2" style={{ borderColor: '#fdc89a', background: '#fff3eb' }}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#fa6b04' }}>AI Spec Assistant Summary</p>
              <p className="text-sm" style={{ color: '#1e3a2f' }}>{rfq.ai_spec_assistant.summary}</p>
            </div>
          )}
        </div>
      )}

      {activeSection === 'bid-comparison' && rfq.status === 'active' && (
        <section>
          <BidDashboard projectId={projectId} projectName={project.name} rfq={rfq} bids={bids} specDocuments={project.spec_documents ?? []} section="comparison" />
        </section>
      )}

      {activeSection === 'message-center' && (
        <section className="space-y-6">
          {emailWorkflowSummary && (
            <RFQMailboxPanel rfqId={rfq.id} summary={emailWorkflowSummary} />
          )}
          <MessageCenter
            rfqId={rfq.id}
            mailboxConnected={Boolean(mailbox?.connected)}
            vendorThreads={messageVendorThreads}
          />
        </section>
      )}
    </div>
  )
}
