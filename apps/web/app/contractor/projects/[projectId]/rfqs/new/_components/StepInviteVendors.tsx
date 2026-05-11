'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { ItemRow } from './StepItems'

export interface VendorInvite {
  id?: string
  name: string
  email: string
  firstName?: string
  lastName?: string
  onPlatform: boolean
}

interface Props {
  invites: VendorInvite[]
  onInvitesChange: (invites: VendorInvite[]) => void
  items: ItemRow[]
  rfqTitle: string
  projectName: string
  projectLocation: string
  senderName: string
  bidDeadline?: string
  emailBody: string
  onEmailBodyChange: (body: string) => void
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

// --- Chip helpers -----------------------------------------------------------

function setEditableContent(el: HTMLElement, text: string) {
  el.innerHTML = ''
  const normalizedText = text.replaceAll('{{vendor_name}}', '{{vendor_first_name}}')

  function appendInlineContent(parent: HTMLElement, value: string) {
    const parts = value.split('{{vendor_first_name}}')
    parts.forEach((part, i) => {
      if (part) parent.appendChild(document.createTextNode(part))
      if (i >= parts.length - 1) return
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

function extractText(el: HTMLElement): string {
  function readNode(node: ChildNode): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? ''
    }
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

// --- Editable email body ----------------------------------------------------

function EditableEmailBody({
  value,
  onChange,
  initKey,
}: {
  value: string
  onChange: (v: string) => void
  initKey: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const lastInitKey = useRef(-1)

  useEffect(() => {
    if (!ref.current) return
    if (lastInitKey.current !== initKey) {
      setEditableContent(ref.current, value)
      lastInitKey.current = initKey
    }
  }, [initKey, value])

  const handleInput = useCallback(() => {
    if (!ref.current) return
    onChange(extractText(ref.current))
  }, [onChange])

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      className="min-h-[200px] text-sm leading-relaxed focus:outline-none cursor-text"
      style={{ wordBreak: 'break-word', color: '#4a6358' }}
    />
  )
}

// --- Main component ---------------------------------------------------------

export function StepInviteVendors({
  invites,
  onInvitesChange,
  items,
  rfqTitle,
  projectName,
  projectLocation,
  senderName,
  bidDeadline,
  emailBody,
  onEmailBodyChange,
}: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<VendorInvite[]>([])
  const [searching, setSearching] = useState(false)
  const [generatingDraft, setGeneratingDraft] = useState(false)
  const [draftError, setDraftError] = useState('')
  const [initKey, setInitKey] = useState(0)
  const [refinementPrompt, setRefinementPrompt] = useState('')
  const hasGeneratedRef = useRef(false)

  useEffect(() => {
    if (hasGeneratedRef.current || emailBody) return
    hasGeneratedRef.current = true
    const validItems = items.filter((i) => i.sku || i.description)
    if (validItems.length === 0) return
    callDraftApi({ rfqTitle, projectName, projectLocation, senderName, items: validItems, bidDeadline })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function callDraftApi(body: object) {
    setGeneratingDraft(true)
    setDraftError('')
    fetch('/api/generate-email-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((res) => res.json())
      .then((data: { draft?: string }) => {
        if (data.draft) {
          onEmailBodyChange(data.draft)
          setInitKey((k) => k + 1)
        } else {
          setDraftError('Failed to generate draft. You can write one manually.')
        }
      })
      .catch(() => setDraftError('Failed to generate draft. You can write one manually.'))
      .finally(() => setGeneratingDraft(false))
  }

  function refineDraft() {
    if (!refinementPrompt.trim() || !emailBody) return
    callDraftApi({
      rfqTitle, projectName, projectLocation, senderName, items, bidDeadline,
      currentDraft: emailBody,
      refinementPrompt: refinementPrompt.trim(),
    })
    setRefinementPrompt('')
  }

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/vendor-search?q=${encodeURIComponent(q)}`)
      if (res.ok) setResults(await res.json() as VendorInvite[])
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { search(query) }, 250)
    return () => window.clearTimeout(timer)
  }, [query, search])

  function addInvite(vendor: VendorInvite) {
    if (invites.some((i) => i.email === vendor.email)) return
    const derivedNames = !vendor.onPlatform
      ? { firstName: vendor.firstName ?? '', lastName: vendor.lastName ?? '' }
      : vendor.firstName || vendor.lastName
      ? { firstName: vendor.firstName, lastName: vendor.lastName }
      : splitVendorName(vendor.name)
    onInvitesChange([...invites, { ...vendor, ...derivedNames }])
    setQuery('')
    setResults([])
  }

  function addOffPlatform() {
    if (!isEmail(query)) return
    addInvite({ name: query, email: query, firstName: '', lastName: '', onPlatform: false })
  }

  function updateInvite(email: string, updates: Partial<VendorInvite>) {
    onInvitesChange(invites.map((invite) => {
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

  function removeInvite(email: string) {
    onInvitesChange(invites.filter((i) => i.email !== email))
  }

  const showOffPlatformOption =
    isEmail(query) && !results.some((r) => r.email === query) && !invites.some((i) => i.email === query)

  return (
    <div className="space-y-5">
      {/* Vendor search */}
      <div className="rounded-2xl p-5 shadow-sm" style={{ border: '1px solid #e2d9cf', background: '#ffffff' }}>
        <h3 className="mb-1 text-sm font-bold" style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: '#1e3a2f' }}>Invite vendors</h3>
        <p className="mb-5 text-xs" style={{ color: '#8a9e96' }}>Search by name or email. Off-platform vendors receive an email with a secure quote link.</p>

        <div className="relative">
          <div className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors" style={{ border: '1px solid #e2d9cf', background: '#ede8e2' }}>
            <svg className="h-4 w-4 shrink-0" style={{ color: '#8a9e96' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                const firstResult = results.find((result) => !invites.some((invite) => invite.email === result.email))
                if (firstResult) { addInvite(firstResult); return }
                if (showOffPlatformOption) addOffPlatform()
              }}
              placeholder="Vendor name or email…"
              autoComplete="off"
              className="flex-1 bg-transparent text-sm focus:outline-none"
              style={{ color: '#1e3a2f', fontFamily: 'inherit' }}
            />
          </div>

          {(results.length > 0 || showOffPlatformOption || searching) && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-2xl shadow-xl" style={{ border: '1px solid #e2d9cf', background: '#ffffff' }}>
              {searching && <div className="px-4 py-3 text-sm" style={{ color: '#8a9e96' }}>Searching…</div>}
              {results.map((v) => (
                <button key={v.email} type="button" onClick={() => addInvite(v)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors"
                  style={{ borderBottom: '1px solid #e2d9cf' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#ede8e2')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#1e3a2f' }}>{v.name}</p>
                    <p className="text-xs" style={{ color: '#8a9e96' }}>{v.email}</p>
                  </div>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: '#e8f4ee', color: '#2d6a4f' }}>On Platform</span>
                </button>
              ))}
              {showOffPlatformOption && (
                <button type="button" onClick={addOffPlatform}
                  className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors"
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#ede8e2')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#1e3a2f' }}>Add {query}</p>
                    <p className="text-xs" style={{ color: '#8a9e96' }}>Off-platform · receives email invite</p>
                  </div>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: '#ede8e2', color: '#4a6358' }}>Off Platform</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Invite list */}
        {invites.length > 0 ? (
          <div className="mt-6 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>
              {invites.length} vendor{invites.length !== 1 ? 's' : ''} invited
            </p>
            {invites.map((inv) => (
              <div key={inv.email} className="flex items-center justify-between rounded-xl px-5 py-4"
                style={{ border: '1px solid #e2d9cf', background: '#ede8e2' }}>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: '#1e3a2f' }}>{inv.name}</p>
                    <p className="text-xs" style={{ color: '#8a9e96' }}>{inv.email}</p>
                    {!inv.onPlatform && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <input
                          type="text"
                          value={inv.firstName ?? ''}
                          onChange={(e) => updateInvite(inv.email, { firstName: e.target.value })}
                          placeholder="First name"
                          className="rounded-xl px-2.5 py-1.5 text-xs focus:outline-none transition-colors"
                          style={{ border: '1px solid #e2d9cf', background: '#ffffff', color: '#1e3a2f', fontFamily: 'inherit' }}
                          onFocus={(e) => (e.target.style.borderColor = '#fa6b04')}
                          onBlur={(e) => (e.target.style.borderColor = '#e2d9cf')}
                        />
                        <input
                          type="text"
                          value={inv.lastName ?? ''}
                          onChange={(e) => updateInvite(inv.email, { lastName: e.target.value })}
                          placeholder="Last name"
                          className="rounded-xl px-2.5 py-1.5 text-xs focus:outline-none transition-colors"
                          style={{ border: '1px solid #e2d9cf', background: '#ffffff', color: '#1e3a2f', fontFamily: 'inherit' }}
                          onFocus={(e) => (e.target.style.borderColor = '#fa6b04')}
                          onBlur={(e) => (e.target.style.borderColor = '#e2d9cf')}
                        />
                      </div>
                    )}
                    {!inv.onPlatform && (!(inv.firstName ?? '').trim() || !(inv.lastName ?? '').trim()) && (
                      <p className="mt-2 text-[11px]" style={{ color: '#a85c2a' }}>First and last name required before publish.</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={inv.onPlatform
                      ? { background: '#e8f4ee', color: '#2d6a4f' }
                      : { background: '#ede8e2', color: '#8a9e96' }}>
                    {inv.onPlatform ? 'On Platform' : 'Off Platform'}
                  </span>
                  <button type="button" onClick={() => removeInvite(inv.email)}
                    className="rounded-lg p-1 transition-colors"
                    style={{ color: '#8a9e96' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#8b2e2e')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#8a9e96')}>
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-xs italic" style={{ color: '#8a9e96' }}>
            No vendors invited yet.
          </p>
        )}
      </div>

      {/* Email draft */}
      <div className="rounded-2xl p-5 shadow-sm" style={{ border: '1px solid #e2d9cf', background: '#ffffff' }}>
	        <div className="mb-5">
          <div>
            <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: '#1e3a2f' }}>Vendor outreach email</h3>
            <p className="mt-0.5 text-xs" style={{ color: '#8a9e96' }}>
              AI-drafted · sent on publish · personalized per recipient.{' '}
              <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold align-middle"
                style={{ borderColor: '#fdc89a', background: '#fff3eb', color: '#fa6b04' }}>
                <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 14s-1 0-1-1 1-4 7-4 7 3 7 4-1 1-1 1H2Z" />
                </svg>
                First Name
              </span>{' '}
              is replaced per recipient.
            </p>
          </div>
	        </div>

        {draftError && (
          <p className="mb-4 rounded-xl px-4 py-3 text-xs" style={{ border: '1px solid #e8c4a0', background: '#fdf0e8', color: '#a85c2a' }}>{draftError}</p>
        )}

        {generatingDraft && !emailBody ? (
          <div className="flex h-36 items-center justify-center rounded-xl" style={{ border: '2px dashed #e2d9cf', background: '#ede8e2' }}>
            <p className="text-sm" style={{ color: '#8a9e96' }}>Drafting your email…</p>
          </div>
        ) : (
          <div className="rounded-xl px-6 py-5" style={{ border: '1px solid #e2d9cf', background: '#ede8e2' }}>
            <EditableEmailBody value={emailBody} onChange={onEmailBodyChange} initKey={initKey} />
          </div>
        )}

        <div className="mt-5 flex gap-3">
          <input
            type="text"
            value={refinementPrompt}
            onChange={(e) => setRefinementPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && refineDraft()}
            placeholder='Refine: "make it shorter", "add urgency"…'
            className="flex-1 rounded-xl px-4 py-3 text-xs focus:outline-none transition-colors"
            style={{ border: '1px solid #e2d9cf', background: '#ede8e2', color: '#1e3a2f', fontFamily: 'inherit' }}
            onFocus={(e) => (e.target.style.borderColor = '#fa6b04')}
            onBlur={(e) => (e.target.style.borderColor = '#e2d9cf')}
          />
          <button
            type="button"
            onClick={refineDraft}
            disabled={generatingDraft || !refinementPrompt.trim()}
            className="rounded-xl px-5 py-3 text-xs font-bold transition-colors disabled:opacity-50"
            style={{ background: '#1e3a2f', color: '#fff' }}
          >
            {generatingDraft ? '…' : 'Refine'}
          </button>
        </div>
      </div>
    </div>
  )
}
