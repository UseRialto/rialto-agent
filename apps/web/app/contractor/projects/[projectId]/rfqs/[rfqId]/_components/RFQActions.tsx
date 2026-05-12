'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteRFQAction, inviteAdditionalVendorsAction, retractRFQAction } from '@/lib/actions/contractor'
import type { ContractorRFQ, ContractorVendorInvite } from '@/lib/types/contractor'

interface Props {
  rfqId: string
  projectId: string
  status: string
  rfq?: ContractorRFQ
  projectName?: string
}

interface VendorInvite {
  id?: string
  name: string
  email: string
  firstName?: string
  lastName?: string
  onPlatform: boolean
  existing?: boolean
}

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

function splitVendorName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  }
}

function setEditableEmailContent(el: HTMLElement, text: string) {
  el.innerHTML = ''
  const normalizedText = text.replaceAll('{{vendor_name}}', '{{vendor_first_name}}')

  function appendInlineContent(parent: HTMLElement, value: string) {
    const parts = value.split('{{vendor_first_name}}')
    parts.forEach((part, index) => {
      if (part) parent.appendChild(document.createTextNode(part))
      if (index >= parts.length - 1) return
      const chip = document.createElement('span')
      chip.setAttribute('contenteditable', 'false')
      chip.setAttribute('data-chip', 'vendor_first_name')
      chip.className =
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold align-middle mx-0.5 select-none cursor-default'
      chip.style.cssText = 'border-color: #fdc89a; background: #fff3eb; color: #fa6b04;'
      chip.innerHTML = `<svg class="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="currentColor"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 14s-1 0-1-1 1-4 7-4 7 3 7 4-1 1-1 1H2Z"/></svg>First Name`
      parent.appendChild(chip)
    })
  }

  normalizedText.split(/\n+/).forEach((line, index, lines) => {
    const paragraph = document.createElement('p')
    paragraph.style.margin = index === lines.length - 1 ? '0' : '0 0 0.85rem 0'
    paragraph.style.minHeight = '1.25rem'
    if (line.trim()) {
      appendInlineContent(paragraph, line)
    } else {
      paragraph.appendChild(document.createElement('br'))
    }
    el.appendChild(paragraph)
  })
}

function extractEditableEmailText(el: HTMLElement): string {
  function readNode(node: ChildNode): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    if (!(node instanceof HTMLElement)) return ''
    if (node.dataset.chip === 'vendor_first_name') return '{{vendor_first_name}}'
    if (node.tagName === 'BR') return '\n'
    return Array.from(node.childNodes).map(readNode).join('')
  }

  return Array.from(el.childNodes)
    .map(readNode)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function EditableEmailBody({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (!ref.current || initialized.current) return
    setEditableEmailContent(ref.current, value)
    initialized.current = true
  }, [value])

  const handleInput = useCallback(() => {
    if (!ref.current) return
    onChange(extractEditableEmailText(ref.current))
  }, [onChange])

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      className="min-h-[330px] cursor-text text-sm leading-relaxed focus:outline-none"
      style={{ wordBreak: 'break-word', color: '#4a6358' }}
    />
  )
}

function toVendorInvite(invite: ContractorVendorInvite): VendorInvite {
  return {
    id: invite.vendor_id,
    name: invite.vendor_name || invite.vendor_email || invite.vendor_id || '',
    email: invite.vendor_email,
    firstName: invite.vendor_first_name,
    lastName: invite.vendor_last_name,
    onPlatform: invite.on_platform,
    existing: true,
  }
}

function toContractorInvite(invite: VendorInvite): ContractorVendorInvite {
  const firstName = invite.firstName?.trim() || undefined
  const lastName = invite.lastName?.trim() || undefined
  return {
    vendor_id: invite.id,
    vendor_email: invite.email.trim().toLowerCase(),
    vendor_name: invite.name.trim() || invite.email.trim().toLowerCase(),
    vendor_first_name: firstName,
    vendor_last_name: lastName,
    on_platform: invite.onPlatform,
  }
}

function InviteAdditionalVendorsModal({
  rfq,
  projectId,
  projectName,
  onClose,
}: {
  rfq: ContractorRFQ
  projectId: string
  projectName?: string
  onClose: () => void
}) {
  const router = useRouter()
  const [invites, setInvites] = useState<VendorInvite[]>(() => (rfq.invites ?? []).map(toVendorInvite))
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<VendorInvite[]>([])
  const [searching, setSearching] = useState(false)
  const [emailBody, setEmailBody] = useState(rfq.email_body ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function addInvite(vendor: VendorInvite) {
    if (invites.some((invite) => invite.email.toLowerCase() === vendor.email.toLowerCase())) return
    const names = vendor.firstName || vendor.lastName ? vendor : { ...vendor, ...splitVendorName(vendor.name) }
    setInvites((prev) => [...prev, { ...names, existing: false }])
    setQuery('')
    setResults([])
  }

  function addOffPlatform() {
    if (!isEmail(query)) return
    addInvite({ name: query, email: query.toLowerCase(), firstName: '', lastName: '', onPlatform: false })
  }

  function updateInvite(email: string, updates: Partial<VendorInvite>) {
    setInvites((prev) => prev.map((invite) => {
      if (invite.email !== email) return invite
      const next = { ...invite, ...updates }
      if (!next.onPlatform) {
        const firstName = next.firstName?.trim() ?? ''
        const lastName = next.lastName?.trim() ?? ''
        next.name = [firstName, lastName].filter(Boolean).join(' ') || next.email
      }
      return next
    }))
  }

  async function search(q: string) {
    if (q.trim().length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/vendor-search?q=${encodeURIComponent(q)}`)
      if (res.ok) setResults((await res.json() as Array<{ id: string; name: string; email: string; onPlatform: boolean }>).map((vendor) => ({
        id: vendor.id,
        name: vendor.name,
        email: vendor.email,
        onPlatform: vendor.onPlatform,
      })))
    } finally {
      setSearching(false)
    }
  }

  async function submit() {
    setSubmitting(true)
    setError('')
    const result = await inviteAdditionalVendorsAction(projectId, rfq.id, invites.map(toContractorInvite), emailBody)
    if (!result.success) {
      setError(result.error ?? 'Failed to invite additional vendors.')
      setSubmitting(false)
      return
    }
    router.refresh()
    onClose()
  }

  const showOffPlatformOption =
    isEmail(query) && !results.some((result) => result.email.toLowerCase() === query.toLowerCase()) && !invites.some((invite) => invite.email.toLowerCase() === query.toLowerCase())
  const newInviteCount = invites.filter((invite) => !invite.existing).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl" style={{ borderColor: '#e2d9cf' }}>
        <div className="flex items-start justify-between gap-4 border-b px-6 py-5" style={{ borderColor: '#e2d9cf', background: '#f8faf9' }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: '#fa6b04' }}>Invite Additional Vendors</p>
            <h3 className="mt-1 text-xl font-semibold" style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}>{rfq.title}</h3>
            <p className="mt-1 text-sm" style={{ color: '#4a6358' }}>{projectName ?? 'Project'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border bg-white px-3 py-1.5 text-xs font-semibold" style={{ borderColor: '#e2d9cf', color: '#4a6358' }}>Close</button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-6">
          {error && (
            <div className="mb-4 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: '#f5c6c6', background: '#fdeaea', color: '#c0392b' }}>
              {error}
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <section className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: '#e2d9cf' }}>
              <h4 className="text-sm font-bold" style={{ color: '#1e3a2f' }}>Vendors</h4>
              <p className="mt-1 text-xs" style={{ color: '#8a9e96' }}>Already invited vendors are shown here; add more by name or email.</p>

              <div className="relative mt-4">
                <input
                  type="text"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    void search(event.target.value)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    event.preventDefault()
                    const firstResult = results.find((result) => !invites.some((invite) => invite.email === result.email))
                    if (firstResult) addInvite(firstResult)
                    else if (showOffPlatformOption) addOffPlatform()
                  }}
                  placeholder="Vendor name or email..."
                  className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                  style={{ border: '1px solid #e2d9cf', background: '#ede8e2', color: '#1e3a2f' }}
                />
                {(results.length > 0 || showOffPlatformOption || searching) && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border bg-white shadow-xl" style={{ borderColor: '#e2d9cf' }}>
                    {searching && <div className="px-4 py-3 text-sm" style={{ color: '#8a9e96' }}>Searching...</div>}
                    {results.map((vendor) => (
                      <button key={vendor.email} type="button" onClick={() => addInvite(vendor)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-[#ede8e2]">
                        <span>
                          <span className="block text-sm font-semibold" style={{ color: '#1e3a2f' }}>{vendor.name}</span>
                          <span className="block text-xs" style={{ color: '#8a9e96' }}>{vendor.email}</span>
                        </span>
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: '#e8f4ee', color: '#2d6a4f' }}>On Platform</span>
                      </button>
                    ))}
                    {showOffPlatformOption && (
                      <button type="button" onClick={addOffPlatform} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-[#ede8e2]">
                        <span>
                          <span className="block text-sm font-semibold" style={{ color: '#1e3a2f' }}>Add {query}</span>
                          <span className="block text-xs" style={{ color: '#8a9e96' }}>Off-platform vendor</span>
                        </span>
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: '#ede8e2', color: '#4a6358' }}>Off Platform</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-5 space-y-3">
                {invites.map((invite) => (
                  <div key={invite.email} className="rounded-xl border px-4 py-3" style={{ borderColor: invite.existing ? '#e2d9cf' : '#fdc89a', background: invite.existing ? '#f8faf9' : '#fff3eb' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold" style={{ color: '#1e3a2f' }}>{invite.name}</p>
                        <p className="truncate text-xs" style={{ color: '#8a9e96' }}>{invite.email}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={invite.existing ? { background: '#ede8e2', color: '#4a6358' } : { background: '#fa6b04', color: '#ffffff' }}>
                          {invite.existing ? 'Already invited' : 'New'}
                        </span>
                        {!invite.existing && (
                          <button type="button" onClick={() => setInvites((prev) => prev.filter((entry) => entry.email !== invite.email))} className="text-xs font-bold" style={{ color: '#a85c2a' }}>Remove</button>
                        )}
                      </div>
                    </div>
                    {!invite.onPlatform && !invite.existing && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <input value={invite.firstName ?? ''} onChange={(event) => updateInvite(invite.email, { firstName: event.target.value })} placeholder="First name" className="rounded-lg px-3 py-2 text-xs focus:outline-none" style={{ border: '1px solid #e2d9cf', color: '#1e3a2f' }} />
                        <input value={invite.lastName ?? ''} onChange={(event) => updateInvite(invite.email, { lastName: event.target.value })} placeholder="Last name" className="rounded-lg px-3 py-2 text-xs focus:outline-none" style={{ border: '1px solid #e2d9cf', color: '#1e3a2f' }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: '#e2d9cf' }}>
              <h4 className="text-sm font-bold" style={{ color: '#1e3a2f' }}>Vendor outreach email</h4>
              <p className="mt-1 text-xs" style={{ color: '#8a9e96' }}>
                Defaults to the email copy saved when this RFQ was created.{' '}
                <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold align-middle"
                  style={{ borderColor: '#fdc89a', background: '#fff3eb', color: '#fa6b04' }}>
                  <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 14s-1 0-1-1 1-4 7-4 7 3 7 4-1 1-1 1H2Z" />
                  </svg>
                  First Name
                </span>{' '}
                is replaced per recipient.
              </p>
              <div className="mt-4 rounded-xl px-6 py-5" style={{ border: '1px solid #e2d9cf', background: '#ede8e2' }}>
                <EditableEmailBody value={emailBody} onChange={setEmailBody} />
              </div>
            </section>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t px-6 py-4" style={{ borderColor: '#e2d9cf', background: '#f8faf9' }}>
          <p className="text-xs" style={{ color: '#8a9e96' }}>{newInviteCount} new vendor{newInviteCount === 1 ? '' : 's'} will be invited.</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-md border bg-white px-4 py-2 text-sm font-medium" style={{ borderColor: '#e2d9cf', color: '#4a6358' }}>Cancel</button>
            <button type="button" onClick={() => void submit()} disabled={submitting || newInviteCount === 0} className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#1e3a2f' }}>
              {submitting ? 'Sending...' : 'Invite vendors'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function InviteAdditionalVendorsButton({
  projectId,
  rfq,
  projectName,
}: {
  projectId: string
  rfq: ContractorRFQ
  projectName?: string
}) {
  const [showInviteModal, setShowInviteModal] = useState(false)

  if (rfq.status !== 'active') return null

  return (
    <>
      <button
        type="button"
        onClick={() => setShowInviteModal(true)}
        className="rounded border px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors"
        style={{ borderColor: '#2563eb', background: '#2563eb' }}
      >
        Invite Additional Vendors
      </button>
      {showInviteModal && (
        <InviteAdditionalVendorsModal
          rfq={rfq}
          projectId={projectId}
          projectName={projectName}
          onClose={() => setShowInviteModal(false)}
        />
      )}
    </>
  )
}

export function RFQActions({ rfqId, projectId, status }: Props) {
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (status !== 'draft' && status !== 'active') return null

  const isDraft = status === 'draft'
  const label = isDraft ? 'Delete Draft' : 'Retract RFQ'
  const confirmLabel = isDraft ? 'Delete' : 'Retract'
  const confirmMsg = isDraft
    ? 'This will permanently delete this draft. Cannot be undone.'
    : 'This will retract the RFQ and remove it from vendor view. Active quotes will be discarded.'

  async function handleConfirm() {
    setLoading(true)
    setError('')
    try {
      const result = isDraft
        ? await deleteRFQAction(projectId, rfqId)
        : await retractRFQAction(projectId, rfqId)
      if (!result.success) {
        setError(result.error ?? 'Action failed.')
        setLoading(false)
        return
      }
      router.push(`/contractor/projects/${projectId}`)
      router.refresh()
    } catch {
      setError('Action failed. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className="rounded border bg-white px-3 py-1.5 text-xs font-medium transition-colors"
        style={{ borderColor: '#f5c6c6', color: '#c0392b' }}
      >
        {label}
      </button>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-xl" style={{ borderColor: '#e2d9cf' }}>
            <h3 className="mb-2 text-base font-semibold" style={{ color: '#1e3a2f' }}>{label}</h3>
            <p className="mb-4 text-sm" style={{ color: '#8a9e96' }}>{confirmMsg}</p>
            {error && (
              <div className="mb-3 rounded border px-3 py-2" style={{ borderColor: '#f5c6c6', background: '#fdeaea' }}>
                <p className="text-sm" style={{ color: '#c0392b' }}>{error}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={loading}
                className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
                style={{ background: '#c0392b' }}
              >
                {loading ? 'Processing…' : confirmLabel}
              </button>
              <button
                type="button"
                onClick={() => { setShowConfirm(false); setError('') }}
                className="rounded-md border bg-white px-4 py-2 text-sm font-medium transition-colors"
                style={{ borderColor: '#e2d9cf', color: '#4a6358' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
