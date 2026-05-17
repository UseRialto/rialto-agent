'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Paperclip } from 'lucide-react'
import { AssistantPillBarShell } from './AssistantPillBarShell'

type Role = 'user' | 'assistant'

interface ProjectOption {
  id: string
  name: string
  location?: string
}

interface RfqOption {
  id: string
  title: string
  projectId: string
  status: string
  bidCount?: number
  category?: string
}

interface ChatMessage {
  id: string
  role: Role
  content: string
  projects?: ProjectOption[]
  rfqs?: RfqOption[]
}

interface AgentToolResult {
  status?: string
  data?: {
    action?: string
    path?: string
    filename?: string
    sourceKind?: string
    text?: string
    warnings?: string[]
    draft?: {
      to?: string[]
      cc?: string[]
      subject?: string
      body?: string
    }
    patch?: {
      summary?: string
      operations?: Array<{ kind?: string; note?: string; range?: string }>
    }
  }
  summary?: string
}

interface AgentTurnResponse {
  status?: string
  reply?: string
  toolResults?: AgentToolResult[]
  debugTrace?: unknown
  error?: string
}

interface EmailDraft {
  to: string[]
  cc: string[]
  subject: string
  body: string
}

interface SiteAssistantProps {
  storageScope: string
}

interface StoredState {
  messages?: ChatMessage[]
  context?: unknown
}

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: 'Hi, I can help you reason through your Rialto projects, quote requests, vendor responses, and quote comparisons.',
}

function assistantPlaceholderForPage(pathname: string | null, preferredAssistant: string | null): string {
  if (preferredAssistant === 'bid-comparison') return 'Show me the biggest quote differences...'
  if (!pathname) return 'Ask Rialto to help with quotes...'
  if (pathname.includes('/comparison')) return 'Find the best value quote...'
  if (pathname.includes('/rfqs/') && pathname.includes('/responses')) return 'Summarize vendor responses...'
  if (pathname.includes('/rfqs/') && pathname.includes('/messages')) return 'Draft a vendor follow-up...'
  if (pathname.includes('/rfqs/')) return 'Compare these quotes for me...'
  if (pathname.includes('/contractor/projects/new')) return 'Help me set up this project...'
  if (pathname.includes('/contractor/projects/') && pathname.includes('/rfqs')) return 'Help me create an RFQ...'
  if (pathname.includes('/contractor/projects/')) return 'What needs attention on this project?'
  if (pathname.includes('/contractor/projects')) return 'Find projects with active quote requests...'
  return 'Ask Rialto to help with quotes...'
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function agentDebugEnabled() {
  try {
    return localStorage.getItem('rialto:agent-debug') === 'true'
  } catch {
    return false
  }
}

function debugTraceMessage(data: AgentTurnResponse): ChatMessage | null {
  if (!data.debugTrace) return null
  return {
    id: makeId(),
    role: 'assistant',
    content: `Agent trace\n${JSON.stringify(data.debugTrace, null, 2)}`,
  }
}

export function SiteAssistant({ storageScope }: SiteAssistantProps) {
  const pathname = usePathname()
  const storageKey = useMemo(() => `rialto-site-assistant:${storageScope}`, [storageScope])
  const [isOpen, setIsOpen] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE])
  const [draft, setDraft] = useState('')
  const [context, setContext] = useState<unknown>(null)
  const [isLoadingContext] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null)
  const [customizeMotion, setCustomizeMotion] = useState<'idle' | 'entering' | 'active' | 'exiting'>('idle')
  const [preferredAssistant, setPreferredAssistant] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const customizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    type RialtoWindow = Window & { __rialtoPreferredAssistant?: string | null }
    const initial = (window as RialtoWindow).__rialtoPreferredAssistant
    if (typeof initial === 'string') setPreferredAssistant(initial)

    function onSet(e: Event) {
      const detail = (e as CustomEvent<{ kind?: string | null }>).detail
      setPreferredAssistant(detail?.kind ?? null)
    }
    window.addEventListener('rialto:set-preferred-assistant', onSet)
    return () => window.removeEventListener('rialto:set-preferred-assistant', onSet)
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return
      const stored = JSON.parse(raw) as StoredState
      if (Array.isArray(stored.messages) && stored.messages.length > 0) {
        setMessages(stored.messages)
      }
      if (stored.context) setContext(stored.context)
    } catch {
      localStorage.removeItem(storageKey)
    }
  }, [storageKey])

  useEffect(() => {
    const stored: StoredState = { messages, context }
    localStorage.setItem(storageKey, JSON.stringify(stored))
  }, [context, messages, storageKey])

  useEffect(() => {
    if (!isOpen || isClosing) return
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [isOpen, isClosing, messages])

  useEffect(() => {
    if (isOpen && !isClosing) {
      const t = setTimeout(() => inputRef.current?.focus(), 260)
      return () => clearTimeout(t)
    }
  }, [isOpen, isClosing])

  const dismissChat = useCallback(() => {
    if (isClosing) return
    if (customizeTimerRef.current) clearTimeout(customizeTimerRef.current)
    setIsClosing(true)
    setCustomizeMotion('exiting')
    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false)
      setIsClosing(false)
      setCustomizeMotion('idle')
    }, 320)
  }, [isClosing])

  useEffect(() => {
    if (!isOpen || isClosing) return
    function handleClick(e: MouseEvent) {
      if (sectionRef.current && !sectionRef.current.contains(e.target as Node)) {
        dismissChat()
      }
    }
    const t = setTimeout(() => document.addEventListener('mousedown', handleClick), 900)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [isOpen, isClosing, dismissChat])

  useEffect(() => {
    function handleCustomizeAssistant(event: Event) {
      const open = Boolean((event as CustomEvent<{ open?: boolean }>).detail?.open)
      if (customizeTimerRef.current) clearTimeout(customizeTimerRef.current)
      if (open) {
        setIsOpen(false)
        setIsClosing(false)
        setCustomizeMotion('entering')
        customizeTimerRef.current = setTimeout(() => setCustomizeMotion('active'), 900)
        return
      }
      if (customizeMotion === 'entering' || customizeMotion === 'active') {
        setCustomizeMotion('exiting')
        customizeTimerRef.current = setTimeout(() => setCustomizeMotion('idle'), 900)
      }
    }

    window.addEventListener('rialto:rfq-customize-assistant', handleCustomizeAssistant)
    window.addEventListener('rialto:bid-comparison-assistant', handleCustomizeAssistant)
    return () => {
      if (customizeTimerRef.current) clearTimeout(customizeTimerRef.current)
      window.removeEventListener('rialto:rfq-customize-assistant', handleCustomizeAssistant)
      window.removeEventListener('rialto:bid-comparison-assistant', handleCustomizeAssistant)
    }
  }, [customizeMotion])

  useEffect(() => () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current) }, [])

  function openChat() {
    if (customizeTimerRef.current) clearTimeout(customizeTimerRef.current)
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)

    setIsClosing(false)
    setIsOpen(true)
  }

  function activateAssistant() {
    if (isClosing) return
    if (preferredAssistant === 'bid-comparison') {
      window.dispatchEvent(new CustomEvent('rialto:bid-comparison-assistant', { detail: { open: true } }))
      return
    }
    openChat()
  }

  async function refreshContext() {
    setError(null)
    setContext(null)
    return null
  }

  function summarizeToolResult(result: AgentToolResult): string | null {
    const data = result.data
    if (!data?.action) return result.summary ?? null

    if (data.action === 'document-extracted') {
      const preview = (data.text ?? '').slice(0, 900)
      const warningText = data.warnings?.length ? `\n\nWarnings:\n${data.warnings.join('\n')}` : ''
      return [
        `Read ${data.filename ?? 'the uploaded file'} as ${data.sourceKind ?? 'a document'}.`,
        preview ? `\n${preview}${(data.text?.length ?? 0) > preview.length ? '\n...' : ''}` : '',
        warningText,
      ].join('')
    }

    if (data.action === 'preview-spreadsheet-patch') {
      const operations = data.patch?.operations ?? []
      const operationText = operations.length
        ? operations.map((operation) => `- ${operation.kind}${operation.range ? `: ${operation.range}` : ''}${operation.note ? ` - ${operation.note}` : ''}`).join('\n')
        : 'No concrete operations were proposed.'
      return `${data.patch?.summary ?? 'Prepared a spreadsheet edit preview.'}\n${operationText}`
    }

    if (data.action === 'show-email-draft' && data.draft) {
      setEmailDraft({
        to: data.draft.to ?? [],
        cc: data.draft.cc ?? [],
        subject: data.draft.subject ?? '',
        body: data.draft.body ?? '',
      })
      return 'I opened an email draft for review. Nothing has been sent.'
    }

    return result.summary ?? null
  }

  function handleAgentToolResults(results: AgentToolResult[] | undefined) {
    const followUps: ChatMessage[] = []
    for (const result of results ?? []) {
      const data = result.data
      if (data?.action === 'navigate' && data.path) {
        const path = data.path
        setTimeout(() => { window.location.href = path }, 900)
      }
      const summary = summarizeToolResult(result)
      if (summary) followUps.push({ id: makeId(), role: 'assistant', content: summary })
    }
    if (followUps.length) setMessages((current) => [...current, ...followUps])
  }

  async function handleSubmit() {
    const content = draft.trim()
    if (!content || isSending) return

    const userMessage: ChatMessage = { id: makeId(), role: 'user', content }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setDraft('')
    setIsSending(true)
    setError(null)

    try {
      const response = await fetch('/api/rialto-agent/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content: text }) => ({ role, content: text })),
          currentPage: { path: window.location.pathname, title: document.title },
          debug: agentDebugEnabled(),
        }),
      })
      const data = await response.json() as AgentTurnResponse
      if (!response.ok) throw new Error(data.error ?? 'The assistant could not respond.')
      const traceMessage = debugTraceMessage(data)
      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: 'assistant',
          content: data.reply ?? 'I could not find an answer from the current workspace context.',
        },
        ...(traceMessage ? [traceMessage] : []),
      ])
      handleAgentToolResults(data.toolResults)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The assistant could not respond.'
      setError(message)
      setMessages((current) => [
        ...current,
        { id: makeId(), role: 'assistant', content: message },
      ])
    } finally {
      setIsSending(false)
    }
  }

  async function handleProjectOrRfqSelection(selection: string) {
    setIsSending(true)
    setError(null)
    try {
      const allMessages = [...messages, { id: makeId(), role: 'user' as const, content: selection }]
      setMessages(allMessages)
      const response = await fetch('/api/rialto-agent/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: allMessages.map(({ role, content: text }) => ({ role, content: text })),
          currentPage: { path: window.location.pathname, title: document.title },
          debug: agentDebugEnabled(),
        }),
      })
      const data = await response.json() as AgentTurnResponse
      if (!response.ok) throw new Error(data.error ?? 'The assistant could not respond.')
      const traceMessage = debugTraceMessage(data)
      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: 'assistant',
          content: data.reply ?? '',
        },
        ...(traceMessage ? [traceMessage] : []),
      ])
      handleAgentToolResults(data.toolResults)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The assistant could not respond.'
      setError(message)
    } finally {
      setIsSending(false)
    }
  }

  async function handleFileAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    setIsSending(true)
    setError(null)
    setMessages((current) => [
      ...current,
      { id: makeId(), role: 'user', content: `Attached ${file.name}` },
    ])

    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch('/api/rialto-agent/document-extract', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json() as AgentToolResult & { error?: string }
      if (!response.ok) throw new Error(data.error ?? 'Unable to read that file.')
      handleAgentToolResults([data])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to read that file.'
      setError(message)
      setMessages((current) => [...current, { id: makeId(), role: 'assistant', content: message }])
    } finally {
      setIsSending(false)
    }
  }

  // Visible messages: only show the last user message + its response by default,
  // but render all messages so the user can scroll up.
  const visibleMessages = messages.filter(m => m.id !== 'welcome')
  const inCustomize = customizeMotion === 'entering' || customizeMotion === 'active'
  const status = error
    ? 'Needs attention'
    : isLoadingContext
      ? 'Refreshing context...'
      : isSending
        ? 'Working'
        : 'Ready'
  const assistantPlaceholder = assistantPlaceholderForPage(pathname, preferredAssistant)

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.csv,.xlsx,.xls,.tsv,.docx,.txt"
        className="hidden"
        onChange={handleFileAttach}
      />

      {emailDraft && (
        <section
          className="fixed bottom-28 right-5 z-50 w-[min(440px,calc(100vw-2rem))] rounded-lg border border-gray-200 bg-white p-4 shadow-2xl"
          aria-label="Email draft"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-900">Email draft</h2>
            <button
              type="button"
              onClick={() => setEmailDraft(null)}
              className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
            >
              Close
            </button>
          </div>
          <label className="block text-xs font-medium text-gray-500">
            To
            <input
              value={emailDraft.to.join(', ')}
              onChange={(event) => setEmailDraft((current) => current && { ...current, to: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })}
              className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#fa6b04]"
            />
          </label>
          <label className="mt-3 block text-xs font-medium text-gray-500">
            Cc
            <input
              value={emailDraft.cc.join(', ')}
              onChange={(event) => setEmailDraft((current) => current && { ...current, cc: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })}
              className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#fa6b04]"
            />
          </label>
          <label className="mt-3 block text-xs font-medium text-gray-500">
            Subject
            <input
              value={emailDraft.subject}
              onChange={(event) => setEmailDraft((current) => current && { ...current, subject: event.target.value })}
              className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#fa6b04]"
            />
          </label>
          <label className="mt-3 block text-xs font-medium text-gray-500">
            Body
            <textarea
              value={emailDraft.body}
              onChange={(event) => setEmailDraft((current) => current && { ...current, body: event.target.value })}
              rows={9}
              className="mt-1 w-full resize-none rounded-md border border-gray-200 px-3 py-2 text-sm leading-5 text-gray-900 outline-none focus:border-[#fa6b04]"
            />
          </label>
          <p className="mt-3 text-xs text-gray-500">Review and edit here. Rialto Agent does not send email.</p>
        </section>
      )}

      {(!inCustomize || isOpen || isClosing) && (
        <AssistantPillBarShell
          shellRef={sectionRef}
          ariaLabel="AI Assistant"
          title="Rialto assistant"
          status={status}
          statusTone={error ? 'error' : 'normal'}
          closing={isClosing}
          compact={!isOpen || isClosing}
          messages={visibleMessages}
          listRef={listRef}
          inputRef={inputRef}
          inputValue={!isOpen || isClosing ? '' : draft}
          placeholder={assistantPlaceholder}
          inputDisabled={isSending}
          sendDisabled={!draft.trim() || isSending}
          sendLabel="Send"
          sendingLabel="Thinking"
          isSending={isSending || isLoadingContext}
          error={error}
          onInputChange={setDraft}
          onSubmit={handleSubmit}
          onActivate={activateAssistant}
          onInputKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); dismissChat() }
          }}
          leftActions={(
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-[#f4f7f5]"
              style={{ color: '#8a9e96' }}
              aria-label="Attach file"
              title="Attach CSV to create RFQ"
            >
              <Paperclip className="h-4 w-4" />
            </button>
          )}
          activity={(isSending || isLoadingContext) && (
            <div className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-sm" style={{ background: '#f7faf8', borderColor: '#dfe8e3', color: '#24463a' }}>
              <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: '#fa6b04' }} />
              {isLoadingContext ? 'Refreshing context...' : 'Thinking...'}
            </div>
          )}
          renderMessageExtras={(message) => {
            const richMessage = message as ChatMessage
            return (
              <>
                {richMessage.projects && richMessage.projects.length > 0 && (
                  <div className="mt-2 grid gap-2">
                    {richMessage.projects.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => void handleProjectOrRfqSelection(project.name)}
                        className="rounded-lg px-3 py-2 text-left text-sm font-medium shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                        style={{ background: '#ffffff', color: '#1e3a2f', border: '1px solid #d8e0db' }}
                      >
                        <span className="font-semibold">{project.name}</span>
                        {project.location && (
                          <span className="ml-1.5 text-xs" style={{ color: '#8a9e96' }}>{project.location}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {richMessage.rfqs && richMessage.rfqs.length > 0 && (
                  <div className="mt-2 grid gap-2">
                    {richMessage.rfqs.map((rfq) => (
                      <button
                        key={rfq.id}
                        type="button"
                        onClick={() => {
                          setMessages((current) => [
                            ...current,
                            { id: makeId(), role: 'user', content: rfq.title },
                            { id: makeId(), role: 'assistant', content: `Taking you to ${rfq.title}...` },
                          ])
                          setTimeout(() => {
                            window.location.href = `/contractor/projects/${rfq.projectId}/rfqs/${rfq.id}`
                          }, 800)
                        }}
                        className="rounded-lg px-3 py-2.5 text-left text-sm font-medium shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                        style={{ background: '#ffffff', color: '#1e3a2f', border: '1px solid #d8e0db' }}
                      >
                        <span className="font-semibold">{rfq.title}</span>
                        <span className="ml-2 inline-flex items-center gap-1.5 text-xs" style={{ color: '#8a9e96' }}>
                          {rfq.status}
                          {typeof rfq.bidCount === 'number' && ` - ${rfq.bidCount} bid${rfq.bidCount === 1 ? '' : 's'}`}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )
          }}
        />
      )}
    </>
  )
}
