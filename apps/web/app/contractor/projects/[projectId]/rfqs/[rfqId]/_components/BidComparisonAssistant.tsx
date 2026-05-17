'use client'

import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { Bug, Check, Paperclip, X } from 'lucide-react'
import { AssistantPillBarShell } from '@/components/site-assistant/AssistantPillBarShell'
import type { ComparisonSheetView, ComparisonViewPatch } from './comparison-sheet-view'
import type { ComparisonSheetSnapshot } from '@/lib/procurement/comparison-sheet-snapshot'
import {
  debugStepFromProgressEvent,
  debugStepsFromAgentResponse,
  initialAgentProgressSteps,
  type ComparisonAgentDebugResponse,
  type ComparisonAgentProgressEvent,
} from '@/lib/procurement/comparison-agent-debug'
import { resolveComparisonHistoryRequest, type ComparisonHistoryCommand } from '@/lib/procurement/comparison-fast-commands'

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
  onHistoryCommand?: (command: ComparisonHistoryCommand) => Promise<boolean> | boolean
  canUndoSavedVersion?: boolean
  canRedoSavedVersion?: boolean
  onPreviewChange?: (patch: ComparisonViewPatch | null) => void
  onDismiss: () => void
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
  sourceKind?: 'pdf' | 'excel' | 'csv' | 'docx' | 'text'
  workbookId?: string
  summary?: unknown
}

interface AssistantMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  tone?: 'normal' | 'error'
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
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

const TONE_STYLES: Record<PatchChip['tone'], CSSProperties> = {
  add: { background: '#fff4ea', border: '1px solid #e6b667', color: '#cd682c' },
  remove: { background: '#fff1e8', border: '1px solid #f2b38f', color: '#a85c2a' },
  highlight: { background: '#edf6ea', border: '1px solid #e6b667', color: '#315f47' },
}

export function BidComparisonAssistant({
  isOpen,
  isClosing,
  currentView,
  sheetSchema,
  snapshot,
  onApply,
  onHistoryCommand,
  canUndoSavedVersion = false,
  canRedoSavedVersion = false,
  onPreviewChange,
  onDismiss,
}: BidComparisonAssistantProps) {
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<AssistantMessage[]>([])
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
  const listRef = useRef<HTMLDivElement | null>(null)

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
    function onAssistantEvent(event: Event) {
      const detail = (event as CustomEvent<{ open?: boolean; prompt?: string }>).detail
      if (detail?.open && typeof detail.prompt === 'string') setDraft(detail.prompt)
    }
    window.addEventListener('rialto:bid-comparison-assistant', onAssistantEvent)
    return () => window.removeEventListener('rialto:bid-comparison-assistant', onAssistantEvent)
  }, [])

  useEffect(() => {
    if (!isOpen || isClosing) return
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [debugSteps, error, isClosing, isOpen, isSending, messages, proposal, summary])

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
          data?: {
            filename?: string
            text?: string
            sourceKind?: AssistantAttachment['sourceKind']
            attachment?: {
              id: string
              filename: string
              sourceKind: AssistantAttachment['sourceKind']
              workbookId?: string
              summary?: unknown
            }
          }
        }
        if (!response.ok) throw new Error(json.error ?? `Could not read ${file.name}.`)
        const text = json.data?.text?.trim()
        if (!text && !json.data?.attachment?.workbookId) throw new Error(`No readable text was found in ${file.name}.`)
        extracted.push({
          sourceId: json.data?.attachment?.id ?? `${file.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          filename: json.data?.attachment?.filename ?? json.data?.filename ?? file.name,
          text: text ?? '',
          sourceKind: json.data?.attachment?.sourceKind ?? json.data?.sourceKind,
          workbookId: json.data?.attachment?.workbookId,
          summary: json.data?.attachment?.summary,
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
    const pendingProposal = proposal?.agentProposal
    const pendingPreviewPatch = proposal
      ? {
          ...proposal,
          agentProposal: undefined,
        }
      : undefined
    setMessages((current) => [...current, { id: makeId(), role: 'user', content: message }])
    setDraft('')
    setIsSending(true)
    setError('')
    if (!proposal) setSummary('')
    const historyRequest = resolveComparisonHistoryRequest(message, {
      hasPendingPreview: Boolean(proposal),
      canUndoSavedVersion,
      canRedoSavedVersion,
    })
    if (historyRequest) {
      try {
        let responseSummary: string
        if (historyRequest.action === 'discard-preview') {
          setProposal(null)
          onPreviewChange?.(null)
          responseSummary = 'Discarded the pending preview.'
        } else if (historyRequest.action === 'undo-version' || historyRequest.action === 'redo-version') {
          const command = historyRequest.action === 'undo-version' ? 'undo' : 'redo'
          const applied = await onHistoryCommand?.(command)
          responseSummary = applied
            ? command === 'undo' ? 'Undid the last workbook edit.' : 'Redid the workbook edit.'
            : command === 'undo' ? 'There is no saved workbook edit to undo yet.' : 'There is no workbook edit to redo yet.'
        } else {
          responseSummary = historyRequest.command === 'undo'
            ? 'There is no pending preview or saved workbook edit to undo yet.'
            : 'There is no workbook edit to redo yet.'
        }
        setSummary(responseSummary)
        setMessages((current) => [...current, { id: makeId(), role: 'assistant', content: responseSummary }])
      } catch (caught) {
        const responseSummary = caught instanceof Error ? caught.message : 'Could not update workbook history.'
        setError(responseSummary)
        setMessages((current) => [...current, { id: makeId(), role: 'assistant', content: responseSummary, tone: 'error' }])
      }
      setIsSending(false)
      setStartedAt(null)
      return
    }
    if (debugMode) setDebugSteps(initialAgentProgressSteps(message))
    setStartedAt(Date.now())
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 90_000)
    try {
      const response = await fetch('/api/bid-comparison/ai-propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          currentView,
          sheetSchema,
          snapshot,
          attachments,
          pendingProposal,
          pendingPreviewPatch,
          debug: debugMode,
          stream: debugMode,
        }),
        signal: controller.signal,
      })
      if (debugMode && response.body && response.headers.get('content-type')?.includes('text/event-stream')) {
        const json = await readAgentProgressStream(response)
        if (!response.ok || (!json.patch && !json.answer)) throw new Error(json.error ?? 'Could not generate a response.')
        const responseSummary = json.patch?.summary ?? json.answer ?? 'Prepared a sheet preview.'
        setSummary(responseSummary)
        setMessages((current) => [...current, { id: makeId(), role: 'assistant', content: responseSummary }])
        if (json.patch) {
          setProposal(json.patch)
          onPreviewChange?.(json.patch)
        }
        return
      }
      const json = (await response.json()) as { patch?: ComparisonViewPatch; answer?: string; error?: string } & ComparisonAgentDebugResponse
      if (debugMode) {
        const returnedSteps = debugStepsFromAgentResponse(json)
        if (returnedSteps.length) setDebugSteps(returnedSteps)
      }
      if (!response.ok || (!json.patch && !json.answer)) throw new Error(json.error ?? 'Could not generate a response.')
      const responseSummary = json.patch?.summary ?? json.answer ?? 'Prepared a sheet preview.'
      setSummary(responseSummary)
      setMessages((current) => [...current, { id: makeId(), role: 'assistant', content: responseSummary }])
      if (json.patch) {
        setProposal(json.patch)
        onPreviewChange?.(json.patch)
      }
    } catch (caught) {
      const message = caught instanceof DOMException && caught.name === 'AbortError'
        ? 'Rialto Agent timed out after 90 seconds before returning changes.'
        : caught instanceof Error ? caught.message : 'Could not generate a change.'
      setError(message)
      setMessages((current) => [...current, { id: makeId(), role: 'assistant', content: message, tone: 'error' }])
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
      setAttachments([])
      setDraft('')
      setSummary('')
      setIsApplying(false)
    }, 180)
  }

  const chips = describePatch(proposal, sheetSchema)
  const status = error
    ? 'Needs attention'
    : isExtractingFile
      ? 'Reading file...'
      : isSending
        ? `Reading the sheet... ${elapsedSeconds}s`
        : proposal
          ? 'Preview ready'
          : 'Ready'

  return (
    <AssistantPillBarShell
      ariaLabel="Bid comparison AI assistant"
      title="Quote comparison assistant"
      status={status}
      statusTone={error ? 'error' : proposal ? 'preview' : 'normal'}
      closing={isClosing}
      applying={isApplying}
      widthClassName="w-[min(760px,calc(100vw-1.5rem))] sm:w-[min(760px,calc(100vw-2rem))]"
      messages={messages}
      listRef={listRef}
      inputRef={inputRef}
      inputValue={draft}
      placeholder="Ask about this sheet..."
      sendDisabled={!draft.trim() || isSending}
      sendLabel="Send"
      sendingLabel="Thinking"
      isSending={isSending || isExtractingFile}
      error={error}
      onInputChange={setDraft}
      onSubmit={askAssistant}
      onInputDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onInputDrop={(event) => {
        event.preventDefault()
        if (event.dataTransfer.files.length) void attachFiles(event.dataTransfer.files)
      }}
      onInputKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); void askAssistant() }
        if (event.key === 'Escape') { event.preventDefault(); onDismiss() }
      }}
      leftActions={(
        <>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending || isExtractingFile}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-[#fff0e4] disabled:opacity-50"
            aria-label="Attach file"
            title={isExtractingFile ? 'Reading file...' : 'Attach PDF, CSV, Excel, Word, or text file'}
            style={{ color: '#8a6d58', background: attachments.length ? '#edf6ea' : '#fff7f0' }}
          >
            <Paperclip className="h-4 w-4" />
          </button>
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
        </>
      )}
      rightActions={(
        <button
          type="button"
          onClick={() => {
            const next = !debugMode
            setDebugMode(next)
            try { localStorage.setItem('rialto:agent-debug', String(next)) } catch {}
            if (!next) setDebugSteps([])
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition hover:bg-[#fff0e4]"
          style={{
            borderColor: debugMode ? '#cd682c' : '#ead6c4',
            color: debugMode ? '#cd682c' : '#8a6d58',
            background: '#ffffff',
          }}
          aria-label={debugMode ? 'Turn debug off' : 'Turn debug on'}
          title={debugMode ? 'Debug on' : 'Debug off'}
        >
          <Bug className="h-4 w-4" />
        </button>
      )}
      activity={isSending && (
        <div className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-sm" style={{ borderColor: '#ead6c4', color: '#4b3324', background: '#fffaf5' }}>
          <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: '#cd682c' }} />
          Reading the sheet...
        </div>
      )}
      preview={proposal && (
        <div className="rounded-lg border p-3" style={{ borderColor: '#ead6c4', background: '#fffaf5' }}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: '#8a6d58' }}>Preview</p>
            <span className="text-xs" style={{ color: '#a58a74' }}>{chips.length || 0} change{chips.length === 1 ? '' : 's'}</span>
          </div>
          {chips.length === 0 ? (
            <p className="text-xs" style={{ color: '#a58a74' }}>Rialto is unsure what to change.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {chips.map((chip) => (
                <span key={chip.id} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold" style={TONE_STYLES[chip.tone]}>
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
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-white transition-all disabled:scale-95 disabled:opacity-60"
              style={{ background: '#9f4f22' }}
            >
              <Check className="h-3.5 w-3.5" />
              {isApplying ? 'Applying...' : 'Apply'}
            </button>
            <button
              type="button"
              onClick={() => { setProposal(null); setSummary(''); onPreviewChange?.(null) }}
              disabled={isApplying}
              className="rounded-md border px-3 py-2 text-xs font-semibold transition disabled:opacity-60"
              style={{ borderColor: '#ead6c4', color: '#725a48', background: '#ffffff' }}
            >
              Discard
            </button>
          </div>
        </div>
      )}
      debug={debugMode && debugSteps.length > 0 && (
        <details className="rounded-lg border px-3 py-2" style={{ borderColor: '#ead6c4', background: '#fffaf5' }}>
          <summary className="cursor-pointer text-xs font-semibold" style={{ color: '#cd682c' }}>Agent trace</summary>
          <ol className="mt-2 space-y-1 text-xs" style={{ color: '#725a48' }}>
            {debugSteps.map((step, index) => (
              <li key={`${index}-${step}`} className="grid grid-cols-[1.5rem_1fr] gap-2">
                <span style={{ color: '#cd682c' }}>{index + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
      attachments={(attachments.length > 0 || isExtractingFile) && (
        <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: '#725a48' }}>
          {attachments.map((attachment) => (
            <span key={attachment.sourceId} className="inline-flex max-w-[15rem] items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold" style={{ background: '#edf6ea', color: '#315f47' }}>
              <Paperclip className="h-3 w-3 shrink-0" />
              <span className="truncate">{attachment.filename}</span>
              <button
                type="button"
                aria-label={`Remove ${attachment.filename}`}
                onClick={() => setAttachments((current) => current.filter((item) => item.sourceId !== attachment.sourceId))}
                className="rounded-md p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {isExtractingFile && <span>Reading file...</span>}
        </div>
      )}
    />
  )
}
