'use client'

import { useEffect, useRef, useState } from 'react'
import { Paperclip, X } from 'lucide-react'
import type { ComparisonSheetView, ComparisonViewPatch } from './comparison-sheet-view'
import type { ComparisonSheetSnapshot } from '@/lib/procurement/comparison-sheet-snapshot'
import {
  debugStepFromProgressEvent,
  debugStepsFromAgentResponse,
  initialAgentProgressSteps,
  type ComparisonAgentDebugResponse,
  type ComparisonAgentProgressEvent,
} from '@/lib/procurement/comparison-agent-debug'

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
  snapshot?: ComparisonSheetSnapshot
  onApply: (patch: ComparisonViewPatch) => void
  onPreviewChange?: (patch: ComparisonViewPatch | null) => void
  onDismiss: () => void
}

function cn(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function agentDebugEnabled() {
  try {
    const stored = localStorage.getItem('rialto:agent-debug')
    return stored == null ? true : stored === 'true'
  } catch {
    return true
  }
}

interface PatchChip {
  id: string
  label: string
  tone: 'add' | 'remove' | 'highlight'
  onDismiss: () => void
}

interface AssistantAttachment {
  sourceId: string
  filename: string
  text: string
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
    const col = schema.columns.find((candidate) => candidate.key === cell.colKey)
    const row = schema.lineItems.find((candidate) => candidate.id === cell.rowKey)
    chips.push({
      id: `set-${cell.rowKey}-${cell.colKey}`,
      label: `Update ${row?.description ?? 'row'} / ${col?.label ?? 'cell'}`,
      tone: 'add',
      onDismiss: () => {},
    })
  })
  if ((patch.setCells?.length ?? 0) > 6) {
    return [{
      id: 'set-cells-summary',
      label: `${patch.setCells!.length} cell updates previewed in yellow on the sheet`,
      tone: 'highlight',
      onDismiss: () => {},
    }, ...chips.filter((chip) => !chip.id.startsWith('set-'))]
  }
  return chips
}

const TONE_STYLES: Record<PatchChip['tone'], React.CSSProperties> = {
  add: { background: '#e8f4ee', border: '1px solid #a8d5ba', color: '#2d6a4f' },
  remove: { background: '#fff1e8', border: '1px solid #f2b38f', color: '#a85c2a' },
  highlight: { background: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e' },
}

export function BidComparisonAssistant({ isOpen, isClosing, currentView, sheetSchema, snapshot, onApply, onPreviewChange, onDismiss }: BidComparisonAssistantProps) {
  const [draft, setDraft] = useState('')
  const [proposal, setProposal] = useState<ComparisonViewPatch | null>(null)
  const [summary, setSummary] = useState('')
  const [error, setError] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [attachments, setAttachments] = useState<AssistantAttachment[]>([])
  const [isExtractingFile, setIsExtractingFile] = useState(false)
  const [debugMode, setDebugMode] = useState(true)
  const [debugSteps, setDebugSteps] = useState<string[]>([])
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const applyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (isOpen && !isClosing) {
      // Focus the input shortly after the emerge animation completes.
      const t = setTimeout(() => inputRef.current?.focus(), 800)
      return () => clearTimeout(t)
    }
  }, [isOpen, isClosing])

  useEffect(() => () => { if (applyTimerRef.current) clearTimeout(applyTimerRef.current) }, [])

  useEffect(() => {
    setDebugMode(agentDebugEnabled())
  }, [])

  useEffect(() => {
    if (!startedAt) {
      setElapsedSeconds(0)
      return
    }
    const interval = setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.round((Date.now() - startedAt) / 1000)))
    }, 1000)
    return () => clearInterval(interval)
  }, [startedAt])

  if (!isOpen) return null

  async function attachFiles(files: FileList | File[]) {
    const selected = Array.from(files)
    if (selected.length === 0 || isExtractingFile) return
    setError('')
    setIsExtractingFile(true)
    try {
      const extracted: AssistantAttachment[] = []
      for (const file of selected) {
        const formData = new FormData()
        formData.append('file', file)
        const response = await fetch('/api/rialto-agent/document-extract', { method: 'POST', body: formData })
        const json = await response.json() as {
          error?: string
          data?: { filename?: string; text?: string }
        }
        if (!response.ok) throw new Error(json.error ?? `Could not read ${file.name}.`)
        const text = json.data?.text?.trim()
        if (!text) throw new Error(`No readable text was found in ${file.name}.`)
        extracted.push({
          sourceId: `${file.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          filename: json.data?.filename ?? file.name,
          text,
        })
      }
      setAttachments((current) => [...current, ...extracted])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read the uploaded file.')
    } finally {
      setIsExtractingFile(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function askAssistant() {
    const message = draft.trim()
    if (!message || isSending) return
    setIsSending(true)
    setError('')
    setSummary('')
    setProposal(null)
    onPreviewChange?.(null)
    if (debugMode) setDebugSteps(initialAgentProgressSteps(message))
    setStartedAt(Date.now())
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 90_000)
    try {
      const response = await fetch('/api/bid-comparison/ai-propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, currentView, sheetSchema, snapshot, attachments, debug: debugMode, stream: debugMode }),
        signal: controller.signal,
      })
      if (debugMode && response.body && response.headers.get('content-type')?.includes('text/event-stream')) {
        const json = await readAgentProgressStream(response)
        if (!response.ok || (!json.patch && !json.answer)) throw new Error(json.error ?? 'Could not generate a response.')
        setSummary(json.patch?.summary ?? json.answer ?? '')
        setProposal(json.patch ?? null)
        onPreviewChange?.(json.patch ?? null)
        if (json.patch) setAttachments([])
        return
      }
      const json = (await response.json()) as { patch?: ComparisonViewPatch; answer?: string; error?: string } & ComparisonAgentDebugResponse
      if (debugMode) {
        const returnedSteps = debugStepsFromAgentResponse(json)
        if (returnedSteps.length) setDebugSteps(returnedSteps)
      }
      if (!response.ok || (!json.patch && !json.answer)) throw new Error(json.error ?? 'Could not generate a response.')
      setSummary(json.patch?.summary ?? json.answer ?? '')
      setProposal(json.patch ?? null)
      onPreviewChange?.(json.patch ?? null)
      if (json.patch) setAttachments([])
    } catch (caught) {
      const message = caught instanceof DOMException && caught.name === 'AbortError'
        ? 'Rialto Agent timed out after 90 seconds before returning changes.'
        : caught instanceof Error ? caught.message : 'Could not generate a change.'
      setError(message)
      if (debugMode) setDebugSteps((steps) => [...steps, `Error: ${message}`])
    } finally {
      clearTimeout(timeout)
      setIsSending(false)
      setStartedAt(null)
    }
  }

  async function readAgentProgressStream(response: Response) {
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Rialto Agent did not return a readable progress stream.')

    const decoder = new TextDecoder()
    let buffer = ''
    let finalPayload: ({ patch?: ComparisonViewPatch; answer?: string; error?: string } & ComparisonAgentDebugResponse) | null = null

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''
      for (const rawEvent of events) {
        const event = parseAgentSseEvent(rawEvent)
        if (!event) continue
        if (event.event === 'progress') {
          const step = debugStepFromProgressEvent(event.data as ComparisonAgentProgressEvent)
          setDebugSteps((steps) => [...steps, step])
        } else if (event.event === 'final') {
          finalPayload = event.data as { patch?: ComparisonViewPatch; answer?: string; error?: string } & ComparisonAgentDebugResponse
          const returnedSteps = debugStepsFromAgentResponse(finalPayload)
          if (returnedSteps.length) setDebugSteps((steps) => [...steps, ...returnedSteps])
        } else if (event.event === 'error') {
          const errorPayload = event.data as { error?: string }
          throw new Error(errorPayload.error ?? 'Rialto Agent stream failed.')
        }
      }
    }

    if (buffer.trim()) {
      const event = parseAgentSseEvent(buffer)
      if (event?.event === 'final') finalPayload = event.data as { patch?: ComparisonViewPatch; answer?: string; error?: string } & ComparisonAgentDebugResponse
    }
    if (!finalPayload) throw new Error('Rialto Agent stream ended before returning changes.')
    return finalPayload
  }

  function parseAgentSseEvent(rawEvent: string): { event: string; data: unknown } | null {
    const event = rawEvent.split('\n').find((line) => line.startsWith('event: '))?.slice('event: '.length).trim()
    const dataLine = rawEvent.split('\n').find((line) => line.startsWith('data: '))
    if (!event || !dataLine) return null
    return { event, data: JSON.parse(dataLine.slice('data: '.length)) }
  }

  function applyProposal() {
    if (!proposal || isApplying) return
    setIsApplying(true)
    applyTimerRef.current = setTimeout(() => {
      onApply(proposal)
      onPreviewChange?.(null)
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
                onClick={() => { setProposal(null); setSummary(''); onPreviewChange?.(null) }}
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
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept=".csv,.tsv,.txt,.pdf,.xlsx,.xls,.docx"
            onChange={(event) => {
              if (event.currentTarget.files) void attachFiles(event.currentTarget.files)
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending || isExtractingFile}
            className={cn(
              'relative z-10 ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition disabled:opacity-50',
              isClosing ? 'animate-[bid-ai-content-hide_160ms_ease-in_forwards]' : 'animate-[bid-ai-content-fade_360ms_ease-out_760ms_both]',
            )}
            aria-label="Attach file"
            title={isExtractingFile ? 'Reading file...' : 'Attach PDF, CSV, Excel, Word, or text file'}
            style={{ color: '#60746b', background: attachments.length ? '#fef3c7' : '#f6f8fa' }}
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className={cn(
              'relative z-10 min-w-0 flex-1 bg-transparent py-3.5 pl-3 pr-3 text-sm outline-none',
              isClosing ? 'animate-[bid-ai-content-hide_160ms_ease-in_forwards]' : 'animate-[bid-ai-content-fade_260ms_ease-out_800ms_both]',
            )}
            style={{ color: '#1e3a2f' }}
            placeholder='Try: "highlight the fastest lead time per row" or "hide total price for Acme"'
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
            }}
            onDrop={(event) => {
              event.preventDefault()
              if (event.dataTransfer.files.length) void attachFiles(event.dataTransfer.files)
            }}
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
            {isSending ? 'Thinking…' : 'Send'}
          </button>
          <button
            type="button"
            onClick={() => {
              const next = !debugMode
              setDebugMode(next)
              try { localStorage.setItem('rialto:agent-debug', String(next)) } catch {}
              if (!next) setDebugSteps([])
            }}
            className={cn(
              'relative z-10 ml-1 shrink-0 rounded-full border px-3 py-2 text-xs font-semibold transition',
              isClosing ? 'animate-[bid-ai-content-hide_160ms_ease-in_forwards]' : 'animate-[bid-ai-content-fade_360ms_ease-out_760ms_both]',
            )}
            style={{
              borderColor: debugMode ? '#fa6b04' : '#d5ded9',
              color: debugMode ? '#fa6b04' : '#60746b',
              background: '#ffffff',
            }}
          >
            Debug {debugMode ? 'on' : 'off'}
          </button>
          <button
            type="button"
            onClick={() => { onPreviewChange?.(null); onDismiss() }}
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
        {debugMode && (isSending || debugSteps.length > 0) && (
          <div className="mt-2 rounded-2xl bg-white px-4 py-3 text-xs shadow" style={{ border: '1px solid #e2d9cf', color: '#4a6358' }}>
            <div className="mb-2 flex items-center justify-between gap-3 font-semibold" style={{ color: '#1e3a2f' }}>
              <span>Agent debug</span>
              <span>{isSending ? `working ${elapsedSeconds}s` : 'ready'}</span>
            </div>
            <ol className="space-y-1">
              {debugSteps.map((step, index) => (
                <li key={`${index}-${step}`} className="flex gap-2">
                  <span style={{ color: '#fa6b04' }}>{index + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        {(attachments.length > 0 || isExtractingFile) && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl bg-white px-3 py-2 text-xs shadow" style={{ border: '1px solid #e2d9cf', color: '#4a6358' }}>
            {attachments.map((attachment) => (
              <span key={attachment.sourceId} className="inline-flex max-w-[15rem] items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold" style={{ background: '#fef3c7', color: '#7c3f12' }}>
                <Paperclip className="h-3 w-3 shrink-0" />
                <span className="truncate">{attachment.filename}</span>
                <button
                  type="button"
                  aria-label={`Remove ${attachment.filename}`}
                  onClick={() => setAttachments((current) => current.filter((item) => item.sourceId !== attachment.sourceId))}
                  className="rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {isExtractingFile && <span>Reading file...</span>}
          </div>
        )}
        {error && <p className="mt-2 rounded-full bg-white px-4 py-2 text-xs shadow" style={{ color: '#a85c2a' }}>{error}</p>}
        {summary && !proposal && <p className="mt-2 rounded-full bg-white px-4 py-2 text-xs shadow" style={{ color: '#4a6358' }}>{summary}</p>}
      </section>
    </>
  )
}
