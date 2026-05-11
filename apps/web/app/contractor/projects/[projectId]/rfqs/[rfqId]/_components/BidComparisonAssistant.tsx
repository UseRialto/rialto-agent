'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { ComparisonSheetView, ComparisonViewPatch } from './comparison-sheet-view'

interface SheetSchemaColumn {
  key: string
  label: string
  kind: 'rfq-core' | 'rfq-attribute' | 'rfq-standard' | 'vendor' | 'derived' | 'manual'
  vendorId?: string
  vendorName?: string
  metric?: 'unit_price' | 'total' | 'lead' | 'alternate' | 'response_attr'
}

export interface BidComparisonAssistantProps {
  isOpen: boolean
  isClosing?: boolean
  currentView: ComparisonSheetView
  sheetSchema: {
    columns: SheetSchemaColumn[]
    lineItems: Array<{ id: string; description: string; values?: Record<string, string> }>
    vendors: Array<{ id: string; name: string }>
  }
  onApply: (patch: ComparisonViewPatch) => void
  onDismiss: () => void
}

function cn(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(' ')
}

interface PatchChip {
  id: string
  label: string
  tone: 'add' | 'remove' | 'highlight'
  onDismiss: () => void
}

function describePatch(patch: ComparisonViewPatch | null, schema: BidComparisonAssistantProps['sheetSchema']): PatchChip[] {
  if (!patch) return []
  const chips: PatchChip[] = []

  patch.deleteColumnKeys?.forEach((key) => {
    const col = schema.columns.find((c) => c.key === key)
    chips.push({
      id: `delete-${key}`,
      label: `Delete: ${col?.label ?? key}`,
      tone: 'remove',
      onDismiss: () => {},
    })
  })
  patch.hideColumnKeys?.forEach((key) => {
    const col = schema.columns.find((c) => c.key === key)
    chips.push({
      id: `hide-${key}`,
      label: `Hide: ${col?.label ?? key}`,
      tone: 'remove',
      onDismiss: () => {},
    })
  })
  patch.showColumnKeys?.forEach((key) => {
    const col = schema.columns.find((c) => c.key === key)
    chips.push({ id: `show-${key}`, label: `Show: ${col?.label ?? key}`, tone: 'add', onDismiss: () => {} })
  })
  patch.deleteLineItemIds?.forEach((id) => {
    const item = schema.lineItems.find((i) => i.id === id)
    chips.push({ id: `delete-row-${id}`, label: `Delete row: ${item?.description ?? id}`, tone: 'remove', onDismiss: () => {} })
  })
  patch.hideLineItemIds?.forEach((id) => {
    const item = schema.lineItems.find((i) => i.id === id)
    chips.push({ id: `hide-row-${id}`, label: `Hide row: ${item?.description ?? id}`, tone: 'remove', onDismiss: () => {} })
  })
  patch.addHighlights?.forEach((h) => {
    const label = h.selector.kind === 'rule' ? `Highlight: ${h.selector.rule.replace(/-/g, ' ')}` : `Highlight cell ${h.selector.colKey}`
    chips.push({ id: `hl-${h.id}`, label, tone: 'highlight', onDismiss: () => {} })
  })
  if (patch.clearHighlights) chips.push({ id: 'clear-hl', label: 'Clear highlights', tone: 'remove', onDismiss: () => {} })
  patch.addDerivedColumns?.forEach((c) => {
    chips.push({ id: `derived-${c.key}`, label: `Add column: ${c.label}`, tone: 'add', onDismiss: () => {} })
  })
  patch.addManualColumns?.forEach((c) => {
    chips.push({ id: `manual-col-${c.key}`, label: `Insert column: ${c.label}`, tone: 'add', onDismiss: () => {} })
  })
  patch.addManualLineItems?.forEach((r) => {
    chips.push({ id: `manual-row-${r.id}`, label: `Insert row: ${r.description || r.id}`, tone: 'add', onDismiss: () => {} })
  })
  patch.setCells?.forEach((cell) => {
    chips.push({ id: `set-${cell.rowKey}-${cell.colKey}`, label: `Set cell: ${cell.colKey}`, tone: 'add', onDismiss: () => {} })
  })
  return chips
}

const TONE_STYLES: Record<PatchChip['tone'], React.CSSProperties> = {
  add: { background: '#e8f4ee', border: '1px solid #a8d5ba', color: '#2d6a4f' },
  remove: { background: '#fff1e8', border: '1px solid #f2b38f', color: '#a85c2a' },
  highlight: { background: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e' },
}

export function BidComparisonAssistant({ isOpen, isClosing, currentView, sheetSchema, onApply, onDismiss }: BidComparisonAssistantProps) {
  const [draft, setDraft] = useState('')
  const [proposal, setProposal] = useState<ComparisonViewPatch | null>(null)
  const [summary, setSummary] = useState('')
  const [error, setError] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const applyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (isOpen && !isClosing) {
      // Focus the input shortly after the emerge animation completes.
      const t = setTimeout(() => inputRef.current?.focus(), 800)
      return () => clearTimeout(t)
    }
  }, [isOpen, isClosing])

  useEffect(() => () => { if (applyTimerRef.current) clearTimeout(applyTimerRef.current) }, [])

  if (!isOpen) return null

  async function askAssistant() {
    const message = draft.trim()
    if (!message || isSending) return
    setIsSending(true)
    setError('')
    setSummary('')
    setProposal(null)
    try {
      const response = await fetch('/api/bid-comparison/ai-propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, currentView, sheetSchema }),
      })
      const json = (await response.json()) as { patch?: ComparisonViewPatch; error?: string }
      if (!response.ok || !json.patch) throw new Error(json.error ?? 'Could not generate a change.')
      setSummary(json.patch.summary)
      setProposal(json.patch)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not generate a change.')
    } finally {
      setIsSending(false)
    }
  }

  function applyProposal() {
    if (!proposal || isApplying) return
    setIsApplying(true)
    applyTimerRef.current = setTimeout(() => {
      onApply(proposal)
      setProposal(null)
      setDraft('')
      setSummary('')
      setIsApplying(false)
    }, 180)
  }

  const chips = describePatch(proposal, sheetSchema)

  return (
    <>
      <style jsx global>{`
        @keyframes bid-ai-pill-emerge { 0% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes bid-ai-pill-collapse { 0% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes bid-ai-content-fade { 0% { opacity: 0; } 60% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes bid-ai-content-hide { 0% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes bid-ai-preview-pop { 0% { opacity: 0; transform: translateY(14px) scale(0.98); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes bid-ai-preview-apply { 0% { opacity: 1; transform: translateY(0) scale(1); } 100% { opacity: 0; transform: translateY(10px) scale(0.985); } }
      `}</style>
      <section
        className={cn(
          'fixed bottom-12 left-1/2 z-40 w-[min(820px,calc(100vw-2rem))] -translate-x-1/2',
          isClosing && 'pointer-events-none',
        )}
        aria-label="Bid comparison AI assistant"
      >
        {proposal && (
          <div
            className={cn(
              'absolute bottom-[calc(100%+0.75rem)] left-0 right-0 rounded-2xl bg-white p-3 shadow-2xl',
              isApplying ? 'pointer-events-none animate-[bid-ai-preview-apply_180ms_ease-in_forwards]' : 'animate-[bid-ai-preview-pop_220ms_ease-out_1]',
            )}
            style={{ border: '1px solid #e2d9cf', transformOrigin: 'bottom center' }}
          >
            {summary && (
              <p className="mb-2 text-xs" style={{ color: '#4a6358' }}>{summary}</p>
            )}
            {chips.length === 0 ? (
              <p className="text-xs" style={{ color: '#8a9e96' }}>AI is unsure.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {chips.map((chip) => (
                  <span key={chip.id} className="inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1.5 text-xs font-semibold" style={TONE_STYLES[chip.tone]}>
                    {chip.label}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={applyProposal}
                disabled={isApplying || chips.length === 0}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-white transition-all disabled:scale-95 disabled:opacity-60"
                style={{ background: '#fa6b04' }}
              >
                {isApplying ? 'Applying…' : 'Apply'}
              </button>
              <button
                type="button"
                onClick={() => { setProposal(null); setSummary('') }}
                disabled={isApplying}
                className="rounded-xl border px-4 py-2 text-xs font-semibold transition disabled:opacity-60"
                style={{ borderColor: '#e2d9cf', color: '#4a6358', background: '#ffffff' }}
              >
                Discard
              </button>
            </div>
          </div>
        )}
        <div className="relative flex h-12 items-center">
          <div
            className={cn(
              'absolute inset-y-0 left-[3.5rem] right-0 rounded-full bg-white shadow-2xl',
              isClosing ? 'animate-[bid-ai-pill-collapse_240ms_ease-out_forwards]' : 'animate-[bid-ai-pill-emerge_300ms_ease-out_650ms_both]',
            )}
            style={{ border: '1.5px solid #fa6b04', transformOrigin: 'left center' }}
            aria-hidden="true"
          />
          <span aria-hidden="true" className="h-12 w-12 shrink-0" />
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className={cn(
              'relative z-10 ml-3 min-w-0 flex-1 bg-transparent py-3.5 pl-4 pr-3 text-sm outline-none',
              isClosing ? 'animate-[bid-ai-content-hide_160ms_ease-in_forwards]' : 'animate-[bid-ai-content-fade_260ms_ease-out_800ms_both]',
            )}
            style={{ color: '#1e3a2f' }}
            placeholder='Try: "highlight the fastest lead time per row" or "hide total price for Acme"'
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); void askAssistant() }
              if (event.key === 'Escape') { event.preventDefault(); onDismiss() }
            }}
          />
          <button
            type="button"
            onClick={askAssistant}
            disabled={!draft.trim() || isSending}
            className={cn(
              'relative z-10 shrink-0 rounded-full px-5 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-60',
              isClosing ? 'animate-[bid-ai-content-hide_160ms_ease-in_forwards]' : 'animate-[bid-ai-content-fade_360ms_ease-out_760ms_both]',
            )}
            style={{ background: '#1e3a2f' }}
          >
            {isSending ? 'Thinking…' : 'Preview'}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className={cn(
              'relative z-10 ml-1 mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition',
              isClosing ? 'animate-[bid-ai-content-hide_160ms_ease-in_forwards]' : 'animate-[bid-ai-content-fade_360ms_ease-out_760ms_both]',
            )}
            aria-label="Close assistant"
            style={{ color: '#8a9e96' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {error && <p className="mt-2 rounded-full bg-white px-4 py-2 text-xs shadow" style={{ color: '#a85c2a' }}>{error}</p>}
        {summary && !proposal && <p className="mt-2 rounded-full bg-white px-4 py-2 text-xs shadow" style={{ color: '#4a6358' }}>{summary}</p>}
      </section>
    </>
  )
}
