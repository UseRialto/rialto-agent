'use client'

import { useEffect, useState } from 'react'
import { buildMagicFormPreviewUrl } from '@/lib/mail/rfq-email-draft'
import { MagicRFQFormClient } from '@/app/vendor/magic-rfq/[token]/_components/MagicRFQFormClient'
import type { ContractorRFQ } from '@/lib/types/contractor'
import type { ItemRow, RFQCreationFieldVisibility } from './StepItems'
import type { VendorInvite } from './StepInviteVendors'
import { PDFPreview } from './PDFPreview'
import type { CommodityWatch, ProcurementRequirement, RequestType, RFPDetails } from '@/lib/types/procurement'

const SECTION_HEADING_STYLE = { color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)', fontWeight: 700 } as const

interface Props {
  projectId: string
  rfqId?: string
  contractorName: string
  projectName: string
  projectLocation: string
  requestType: RequestType
  title: string
  bidDeadline: string
  category: string
  attachmentUrls: string[]
  anonymousPublicListing: boolean
  procurementRequirements: ProcurementRequirement[]
  commodityWatch: CommodityWatch[]
  rfpDetails: RFPDetails
  fieldVisibility: RFQCreationFieldVisibility
  items: ItemRow[]
  invites: VendorInvite[]
  emailSubject: string
  emailBody: string
  onEditItems: () => void
  onSaveDraft: () => Promise<void>
  onPublish: () => Promise<void>
}

export function StepReview({
  projectId,
  rfqId,
  contractorName,
  projectName,
  projectLocation,
  requestType,
  title,
  bidDeadline,
  category,
  attachmentUrls,
  anonymousPublicListing,
  procurementRequirements,
  commodityWatch,
  rfpDetails,
  fieldVisibility,
  items,
  invites,
  emailSubject,
  emailBody,
  onEditItems,
  onSaveDraft,
  onPublish,
}: Props) {
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewBytes, setPreviewBytes] = useState<Uint8Array | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [magicFormModalOpen, setMagicFormModalOpen] = useState(false)
  const requestLabel = requestType === 'rfp' ? 'RFP' : 'RFQ'

  const offPlatformInvites = invites.filter((invite) => !invite.onPlatform)
  const sampleInvite = offPlatformInvites[0]
  const magicFormPreviewUrl = buildMagicFormPreviewUrl()
  const previewVendorEmail = sampleInvite?.email ?? 'vendor@example.com'
  const previewVendorName = sampleInvite?.name && sampleInvite.name !== sampleInvite.email ? sampleInvite.name : ''
  const previewRFQ: ContractorRFQ = {
    id: rfqId ?? 'rfq-preview',
    project_id: projectId,
    title,
    request_type: requestType,
    status: 'draft',
    category: category || undefined,
    attachment_urls: attachmentUrls,
    anonymous_public_listing: anonymousPublicListing,
    procurement_requirements: procurementRequirements,
    ai_spec_assistant: undefined,
    commodity_watch: commodityWatch,
    rfp_details: rfpDetails,
    line_items: items.map(({ _key, ...item }) => ({ id: _key, ...item })),
    invites: offPlatformInvites.map((invite) => ({
      vendor_email: invite.email,
      vendor_name: invite.name,
      vendor_first_name: invite.firstName,
      vendor_last_name: invite.lastName,
      on_platform: invite.onPlatform,
    })),
    invited_vendor_ids: [],
    invited_vendor_emails: offPlatformInvites.map((invite) => invite.email),
    visibility: 'invited_only',
    bid_deadline: bidDeadline || undefined,
    created_at: new Date(0).toISOString(),
  }
  function getAttachmentLabel(url: string) {
    const filename = url.split('/').pop() ?? url
    return decodeURIComponent(filename).replace(/^\d+-/, '')
  }

  function formatCellValue(value: string | number | string[] | null | undefined) {
    if (Array.isArray(value)) return value.filter(Boolean).join(', ') || '-'
    if (value === null || value === undefined || value === '') return '-'
    return String(value)
  }

  const attributeColumns = items
    .flatMap((item) => item.attributes ?? [])
    .filter((attribute) => attribute.visible !== false && attribute.label)
    .filter((attribute, index, attributes) => attributes.findIndex((candidate) => candidate.key === attribute.key) === index)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const expandedLineItemColumns = [
    {
      key: 'sku',
      label: 'SKU',
      minWidth: '10rem',
      getValue: (item: ItemRow) => item.sku,
      className: 'font-mono text-xs',
    },
    ...(fieldVisibility.description ? [{
      key: 'description',
      label: 'Description',
      minWidth: '20rem',
      getValue: (item: ItemRow) => item.description,
      className: 'text-sm',
    }] : []),
    ...(fieldVisibility.quantity ? [{
      key: 'quantity',
      label: 'Qty',
      minWidth: '5rem',
      getValue: (item: ItemRow) => item.quantity,
      className: 'text-right font-semibold',
    }] : []),
    ...(fieldVisibility.unit ? [{
      key: 'unit',
      label: 'Unit',
      minWidth: '6rem',
      getValue: (item: ItemRow) => item.unit,
      className: '',
    }] : []),
    ...attributeColumns.map((attribute) => ({
      key: `attribute-${attribute.key}`,
      label: attribute.label,
      minWidth: '14rem',
      getValue: (item: ItemRow) => item.attributes?.find((candidate) => candidate.key === attribute.key)?.value,
      className: 'text-xs',
    })),
    ...(fieldVisibility.specifications ? [{
      key: 'specs',
      label: 'Specs',
      minWidth: '22rem',
      getValue: (item: ItemRow) => item.specs,
      className: 'text-xs',
    }] : []),
    ...(fieldVisibility.constraints ? [{
      key: 'constraints',
      label: 'Constraints',
      minWidth: '18rem',
      getValue: (item: ItemRow) => item.constraints,
      className: 'text-xs',
    }] : []),
    ...(fieldVisibility.certifications ? [{
      key: 'certifications',
      label: 'Certifications',
      minWidth: '14rem',
      getValue: (item: ItemRow) => item.certifications,
      className: 'text-xs',
    }] : []),
    ...(fieldVisibility.notes ? [{
      key: 'notes',
      label: 'Notes',
      minWidth: '18rem',
      getValue: (item: ItemRow) => item.notes,
      className: 'text-xs',
    }] : []),
    ...(fieldVisibility.targetBudget ? [{
      key: 'budget',
      label: 'Budget',
      minWidth: '8rem',
      getValue: (item: ItemRow) => item.contractor_budget != null ? `$${item.contractor_budget.toLocaleString()}` : '',
      className: 'text-right font-semibold',
    }] : []),
    ...(fieldVisibility.suggestedLeadTime ? [{
      key: 'leadTime',
      label: 'Lead Time',
      minWidth: '8rem',
      getValue: (item: ItemRow) => item.suggested_lead_time_days != null ? `${item.suggested_lead_time_days} days` : '',
      className: '',
    }] : []),
  ]

  function renderEmailPreviewLine(line: string, lineIndex: number) {
    const normalizedLine = line.replaceAll('{{vendor_name}}', '{{vendor_first_name}}')
    const parts = normalizedLine.split('{{vendor_first_name}}')

    return parts.map((part, partIndex) => (
      <span key={`${lineIndex}-${partIndex}`}>
        {part}
        {partIndex < parts.length - 1 && (
          <span className="mx-0.5 inline-flex items-center rounded-md border px-2 py-0.5 align-middle text-xs font-semibold" style={{ background: '#fff3eb', color: '#fa6b04', borderColor: '#fdc89a' }}>
            First Name
          </span>
        )}
      </span>
    ))
  }

  useEffect(() => {
    let active = true
    let currentObjectUrl = ''

    async function loadPreview() {
      if (!title.trim() || items.length === 0) {
        setPreviewUrl('')
        setPreviewBytes(null)
        setPreviewError('')
        return
      }

      setPreviewLoading(true)
      setPreviewError('')

      try {
        const response = await fetch('/api/rfq-pdf/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rfqId,
            projectId,
            contractorName,
            projectName,
            projectLocation,
            requestType,
            rfpDetails,
            title,
            bidDeadline: bidDeadline || undefined,
            lineItems: items
              .filter((item) => item.sku || item.description)
              .map(({ _key, ...item }) => item),
          }),
        })

        if (!response.ok) {
          throw new Error('Unable to generate PDF preview right now.')
        }

        const bytes = new Uint8Array(await response.arrayBuffer())
        const blob = new Blob([bytes], { type: 'application/pdf' })
        currentObjectUrl = URL.createObjectURL(blob)

        if (!active) {
          URL.revokeObjectURL(currentObjectUrl)
          return
        }

        setPreviewUrl((previousUrl) => {
          if (previousUrl) URL.revokeObjectURL(previousUrl)
          return currentObjectUrl
        })
        setPreviewBytes(bytes)
      } catch (error) {
        if (!active) return
        setPreviewError(error instanceof Error ? error.message : 'Unable to generate PDF preview right now.')
        setPreviewBytes(null)
        setPreviewUrl((previousUrl) => {
          if (previousUrl) URL.revokeObjectURL(previousUrl)
          return ''
        })
      } finally {
        if (active) {
          setPreviewLoading(false)
        }
      }
    }

    loadPreview()

    return () => {
      active = false
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl)
    }
  }, [bidDeadline, contractorName, items, projectId, projectLocation, projectName, requestType, rfpDetails, rfqId, title])

  async function handleSave() {
    setSaving(true)
    try { await onSaveDraft() } finally { setSaving(false) }
  }

  async function handlePublish() {
    setPublishing(true)
    try { await onPublish() } finally { setPublishing(false) }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl p-5" style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}>
        <p className="mb-4 text-sm font-semibold" style={SECTION_HEADING_STYLE}>Project</p>
        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <div className="rounded-xl px-4 py-3" style={{ background: '#ede8e2', border: '1px solid #e2d9cf' }}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>Project Name</p>
            <p className="text-sm font-semibold" style={{ color: '#1e3a2f' }}>{projectName}</p>
            <p className="text-xs" style={{ color: '#4a6358' }}>{projectLocation}</p>
            {bidDeadline && (
              <p className="mt-1 text-xs" style={{ color: '#8a9e96' }}>Quote deadline: <span className="font-medium" style={{ color: '#4a6358' }}>{bidDeadline}</span></p>
            )}
          </div>

          <div className="rounded-xl px-4 py-3" style={{ background: '#f8f5f1', border: '1px solid #e2d9cf' }}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>{requestLabel} Title</p>
            <p className="text-sm font-medium" style={{ color: '#1e3a2f' }}>{title || '-'}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: '#ede8e2', color: '#4a6358' }}>
                {requestType.toUpperCase()}
              </span>
              {category && (
                <span className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: '#fff3eb', color: '#fa6b04', border: '1px solid #fdc89a' }}>
                  {category}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>
              Expanded Line Items ({items.length})
            </p>
            <button
              type="button"
              onClick={onEditItems}
              className="text-xs font-medium transition-colors"
              style={{ color: '#fa6b04' }}
            >
              Edit Items →
            </button>
          </div>
          <div className="overflow-hidden rounded-2xl" style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-max table-fixed text-sm">
                <colgroup>
                  {expandedLineItemColumns.map((column) => (
                    <col key={column.key} style={{ width: column.minWidth }} />
                  ))}
                </colgroup>
                <thead className="text-xs font-semibold uppercase tracking-wider" style={{ background: '#ede8e2', color: '#8a9e96' }}>
                <tr>
                  {expandedLineItemColumns.map((column) => (
                    <th key={column.key} className={`px-3 py-2 text-left ${column.className.includes('text-right') ? 'text-right' : ''}`}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody style={{ borderTop: '1px solid #e2d9cf' }}>
                {items.map((item, idx) => (
                  <tr key={item._key} style={{ borderTop: idx > 0 ? '1px solid #e2d9cf' : undefined }}>
                    {expandedLineItemColumns.map((column) => (
                      <td
                        key={`${item._key}-${column.key}`}
                        className={`px-3 py-3 align-top leading-5 ${column.className}`}
                        style={{
                          color: column.key === 'quantity' || column.key === 'budget' ? '#1e3a2f' : '#4a6358',
                          fontFamily: column.key === 'sku' ? 'var(--font-dm-mono, monospace)' : undefined,
                        }}
                      >
                        <span className="line-clamp-3">{formatCellValue(column.getValue(item))}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      </div>

      {attachmentUrls.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>Reference Files</p>
          <div className="flex flex-wrap gap-2">
            {attachmentUrls.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
                style={{ background: '#ede8e2', color: '#4a6358', border: '1px solid #e2d9cf' }}
              >
                {getAttachmentLabel(url)}
              </a>
            ))}
          </div>
        </div>
      )}

      {(requestType === 'rfp' || procurementRequirements.length > 0 || commodityWatch.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {requestType === 'rfp' && (
            <div className="rounded-2xl p-4 lg:col-span-2" style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>RFP Brief</p>
              <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2" style={{ color: '#4a6358' }}>
                {rfpDetails.procurement_objective && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Objective:</span> {rfpDetails.procurement_objective}</p>}
                {rfpDetails.scope_summary && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Scope:</span> {rfpDetails.scope_summary}</p>}
                {rfpDetails.desired_outcome && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Outcome:</span> {rfpDetails.desired_outcome}</p>}
                {rfpDetails.performance_requirements && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Performance:</span> {rfpDetails.performance_requirements}</p>}
                {rfpDetails.approved_alternates && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Alternates:</span> {rfpDetails.approved_alternates}</p>}
                {rfpDetails.quantity_context && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Quantity / Budget:</span> {rfpDetails.quantity_context}</p>}
                {rfpDetails.site_conditions && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Site:</span> {rfpDetails.site_conditions}</p>}
                {rfpDetails.delivery_zip && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Delivery ZIP:</span> {rfpDetails.delivery_zip}</p>}
                {rfpDetails.delivery_logistics && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Logistics:</span> {rfpDetails.delivery_logistics}</p>}
                {rfpDetails.delivery_window && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Delivery window:</span> {rfpDetails.delivery_window}</p>}
                {rfpDetails.phased_delivery && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Phasing:</span> {rfpDetails.phased_delivery}</p>}
                {rfpDetails.submittals_required && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Submittals:</span> {rfpDetails.submittals_required}</p>}
                {rfpDetails.lead_time_sensitivity && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Lead time:</span> {rfpDetails.lead_time_sensitivity}</p>}
                {rfpDetails.exclusions && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Exclusions:</span> {rfpDetails.exclusions}</p>}
                {rfpDetails.unknowns_or_questions && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Unknowns:</span> {rfpDetails.unknowns_or_questions}</p>}
                {rfpDetails.vendor_questions_requested && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Vendor questions:</span> {rfpDetails.vendor_questions_requested}</p>}
                {rfpDetails.vendor_guidance_requested && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Vendor guidance:</span> {rfpDetails.vendor_guidance_requested}</p>}
                {rfpDetails.attachments_summary && <p><span className="font-medium" style={{ color: '#1e3a2f' }}>Attachments summary:</span> {rfpDetails.attachments_summary}</p>}
              </div>
            </div>
          )}

          {procurementRequirements.length > 0 && (
            <div className="rounded-2xl p-4" style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>Supplier Requirements</p>
              <div className="flex flex-wrap gap-2">
                {procurementRequirements.map((requirement) => (
                  <span key={requirement.code} className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: '#ede8e2', color: '#4a6358' }}>
                    {requirement.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {commodityWatch.length > 0 && (
            <div className="rounded-2xl p-4 lg:col-span-2" style={{ background: '#fdf0e8', border: '1px solid #e8c4a0' }}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#a85c2a' }}>Commodity Watch</p>
              <div className="space-y-2 text-sm" style={{ color: '#a85c2a' }}>
                {commodityWatch.map((watch) => (
                  <p key={`${watch.category}-${watch.summary}`}>
                    <span className="font-semibold capitalize">{watch.category}:</span> {watch.summary}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-2xl p-4" style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold" style={SECTION_HEADING_STYLE}>Vendor Email Preview</p>
          </div>
          <span className="rounded-full px-3 py-1 text-xs font-medium" style={{ background: '#ede8e2', color: '#4a6358' }}>
            {offPlatformInvites.length} off-platform recipient{offPlatformInvites.length === 1 ? '' : 's'}
          </span>
        </div>

        {offPlatformInvites.length === 0 ? (
          <p className="text-sm italic" style={{ color: '#8a9e96' }}>No off-platform vendor emails added yet. This draft will apply to any off-platform recipients you add before publishing.</p>
        ) : (
          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>Recipients</p>
            <div className="flex flex-wrap gap-2">
              {offPlatformInvites.map((invite) => (
                <span key={invite.email} className="rounded-full px-3 py-1 text-xs font-medium" style={{ background: '#fff3eb', color: '#fa6b04', border: '1px solid #fdc89a' }}>
                  {[invite.firstName, invite.lastName].filter(Boolean).join(' ') || invite.email} · {invite.email}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl p-4" style={{ background: '#ede8e2', border: '1px solid #e2d9cf' }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>Email Summary</p>
          <div className="mt-3 rounded-xl p-4 shadow-sm" style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}>
            <p className="text-sm font-semibold" style={{ color: '#1e3a2f' }}>{emailSubject || `Request for ${requestLabel}`}</p>
            <div className="mt-3 space-y-2 text-sm leading-6" style={{ color: '#4a6358' }}>
              {emailBody.trim() ? (
                emailBody.trim().split(/\n+/).map((line, lineIndex) => (
                  <p key={`${lineIndex}-${line}`}>{renderEmailPreviewLine(line, lineIndex)}</p>
                ))
              ) : (
                <p className="italic" style={{ color: '#8a9e96' }}>No email draft generated yet.</p>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setMagicFormModalOpen(true)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{ background: '#fff3eb', color: '#fa6b04', border: '1px solid #fdc89a' }}
              >
                Preview secure quote form
              </button>
              <span className="text-xs" style={{ color: '#8a9e96' }}>A unique link is inserted for each off-platform vendor on publish.</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold" style={SECTION_HEADING_STYLE}>RFQ PDF Preview</p>
            <p className="mt-1 text-sm" style={{ color: '#4a6358' }}>This is the PDF attachment vendors will receive with your {requestLabel} email.</p>
          </div>
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              style={{ background: '#ffffff', color: '#4a6358', border: '1px solid #e2d9cf' }}
            >
              Open PDF
            </a>
          )}
        </div>

        {previewLoading ? (
          <div className="flex h-[28rem] items-center justify-center rounded-xl border-dashed text-sm" style={{ background: '#ede8e2', border: '2px dashed #e2d9cf', color: '#8a9e96' }}>
            Generating preview…
          </div>
        ) : previewError ? (
          <div className="rounded-xl px-4 py-3 text-sm" style={{ background: '#fdf0e8', border: '1px solid #e8c4a0', color: '#a85c2a' }}>
            {previewError}
          </div>
        ) : (
          <PDFPreview documentBytes={previewBytes} />
        )}
      </div>

      {/* Publish notice */}
      <div className="rounded-xl px-4 py-3" style={{ background: '#fff3eb', border: '1px solid #fdc89a' }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#1e3a2f' }}>Ready to publish?</p>
        <p className="mt-0.5 text-xs" style={{ color: '#fa6b04' }}>
          Publishing finalizes this {requestLabel} and immediately emails each off-platform invite with a secure quote link from your connected mailbox.
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4" style={{ borderTop: '1px solid #e2d9cf' }}>
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="rounded-xl px-5 py-2 text-sm font-medium transition-colors disabled:opacity-60"
          style={{ background: '#ffffff', color: '#4a6358', border: '1px solid #e2d9cf' }}
        >
          {saving ? 'Saving…' : 'Save Draft'}
        </button>
        <button
          type="button"
          disabled={publishing || items.length === 0 || !title.trim()}
          onClick={handlePublish}
          className="rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-60"
          style={{ background: '#fa6b04' }}
        >
          {publishing ? 'Publishing…' : `Publish ${requestLabel} →`}
        </button>
      </div>

      {magicFormModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMagicFormModalOpen(false)} />
          <div className="relative max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between px-6 py-4" style={{ borderBottom: '1px solid #e2d9cf' }}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>Vendor Form Preview</p>
                <h3 className="mt-1 text-xs font-semibold uppercase tracking-wider" style={{ color: '#1e3a2f' }}>Secure quote form preview</h3>
                <p className="mt-1 text-sm" style={{ color: '#4a6358' }}>This simulates what the invited vendor sees after clicking the magic link.</p>
              </div>
              <button
                type="button"
                onClick={() => setMagicFormModalOpen(false)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                style={{ background: '#ffffff', color: '#4a6358', border: '1px solid #e2d9cf' }}
              >
                Close
              </button>
            </div>
            <div className="max-h-[calc(90vh-88px)] overflow-y-auto" style={{ background: '#f5f0eb' }}>
              <MagicRFQFormClient
                mode="preview"
                preview={{
                  rfq: previewRFQ,
                  projectName,
                  vendorEmail: previewVendorEmail,
                  vendorName: previewVendorName,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
