'use client'

import { type CSSProperties, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Send, RotateCcw, Paperclip } from 'lucide-react'

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
  reply?: string
  toolResults?: AgentToolResult[]
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

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function cn(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function SiteAssistant({ storageScope }: SiteAssistantProps) {
  const storageKey = useMemo(() => `rialto-site-assistant:${storageScope}`, [storageScope])
  const [isOpen, setIsOpen] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE])
  const [draft, setDraft] = useState('')
  const [context, setContext] = useState<unknown>(null)
  const [isLoadingContext, setIsLoadingContext] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null)
  const [customizeMotion, setCustomizeMotion] = useState<'idle' | 'entering' | 'active' | 'exiting'>('idle')
  const [customizeShift, setCustomizeShift] = useState('-50vw')
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
      const t = setTimeout(() => inputRef.current?.focus(), 800)
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
    }, 900)
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
    function calculateCustomizeShift() {
      const assistantWidth = Math.min(820, window.innerWidth - 32)
      const customizeIconCenter = (window.innerWidth - assistantWidth) / 2 + 24
      const normalIconCenter = window.innerWidth - 44
      setCustomizeShift(`${customizeIconCenter - normalIconCenter}px`)
    }

    function handleCustomizeAssistant(event: Event) {
      const open = Boolean((event as CustomEvent<{ open?: boolean }>).detail?.open)
      if (customizeTimerRef.current) clearTimeout(customizeTimerRef.current)
      calculateCustomizeShift()
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
    window.addEventListener('resize', calculateCustomizeShift)
    return () => {
      if (customizeTimerRef.current) clearTimeout(customizeTimerRef.current)
      window.removeEventListener('rialto:rfq-customize-assistant', handleCustomizeAssistant)
      window.removeEventListener('rialto:bid-comparison-assistant', handleCustomizeAssistant)
      window.removeEventListener('resize', calculateCustomizeShift)
    }
  }, [customizeMotion])

  useEffect(() => () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current) }, [])

  function openChat() {
    if (customizeTimerRef.current) clearTimeout(customizeTimerRef.current)
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)

    const assistantWidth = Math.min(820, window.innerWidth - 32)
    const customizeIconCenter = (window.innerWidth - assistantWidth) / 2 + 24
    const normalIconCenter = window.innerWidth - 44
    setCustomizeShift(`${customizeIconCenter - normalIconCenter}px`)

    setIsClosing(false)
    setCustomizeMotion('entering')
    setIsOpen(true)
    customizeTimerRef.current = setTimeout(() => setCustomizeMotion('active'), 900)
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

  async function startNewChat() {
    setMessages([WELCOME_MESSAGE])
    setDraft('')
    setError(null)
    await refreshContext()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
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
        }),
      })
      const data = await response.json() as AgentTurnResponse
      if (!response.ok) throw new Error(data.error ?? 'The assistant could not respond.')
      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: 'assistant',
          content: data.reply ?? 'I could not find an answer from the current workspace context.',
        },
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
        }),
      })
      const data = await response.json() as AgentTurnResponse
      if (!response.ok) throw new Error(data.error ?? 'The assistant could not respond.')
      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: 'assistant',
          content: data.reply ?? '',
        },
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
  const hasMessages = visibleMessages.length > 0 || isSending || isLoadingContext

  const inCustomize = customizeMotion === 'entering' || customizeMotion === 'active'

  return (
    <>
      <style jsx global>{`
        @keyframes site-assistant-to-customize {
          0% { transform: translate(0, 0); }
          100% { transform: translate(var(--rfq-customize-shift), -1.75rem); }
        }
        @keyframes site-assistant-from-customize {
          0% { transform: translate(var(--rfq-customize-shift), -1.75rem); }
          100% { transform: translate(0, 0); }
        }
        @keyframes sa-pill-emerge { 0% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes sa-pill-collapse { 0% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes sa-content-fade { 0% { opacity: 0; } 60% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes sa-content-hide { 0% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes sa-messages-fade { 0% { opacity: 0; transform: translateY(8px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes sa-messages-hide { 0% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(8px); } }
      `}</style>

      {/* Floating button */}
      {(!isOpen || isClosing) && (
        <button
          type="button"
          onClick={() => {
            if (inCustomize) return
            if (preferredAssistant === 'bid-comparison') {
              window.dispatchEvent(new CustomEvent('rialto:bid-comparison-assistant', { detail: { open: true } }))
              return
            }
            openChat()
          }}
          disabled={customizeMotion === 'entering'}
          className={cn(
            'fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-2xl transition disabled:pointer-events-none',
            customizeMotion === 'idle' && !isOpen ? 'hover:-translate-y-0.5 hover:shadow-xl' : '',
            (customizeMotion === 'entering') ? 'animate-[site-assistant-to-customize_900ms_cubic-bezier(0.4,0,0.2,1)_forwards]' : '',
            customizeMotion === 'exiting' ? 'animate-[site-assistant-from-customize_900ms_cubic-bezier(0.4,0,0.2,1)_forwards]' : '',
          )}
          style={{ background: '#fa6b04', '--rfq-customize-shift': customizeShift } as CSSProperties}
          aria-label="AI Assistant"
          title="AI Assistant"
        >
          <Bot className="h-5 w-5" />
        </button>
      )}

      {/* Hidden file input */}
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

      {/* Center pill chat */}
      {isOpen && (
        <section
          ref={sectionRef}
          className="fixed bottom-12 left-1/2 z-40 w-[min(820px,calc(100vw-2rem))] -translate-x-1/2"
          aria-label="AI Assistant"
        >
          {/* Chat messages floating above the pill */}
          {hasMessages && (
            <div
              className={cn(
                'absolute bottom-[calc(100%+0.75rem)] left-[3.5rem] right-0',
                isClosing ? 'animate-[sa-messages-hide_200ms_ease-in_forwards]' : 'animate-[sa-messages-fade_300ms_ease-out_800ms_both]',
              )}
            >
              <div
                ref={listRef}
                className="max-h-[25vh] space-y-3 overflow-y-auto rounded-2xl px-4 py-4"
                style={{
                  background: 'rgba(255, 255, 255, 0.75)',
                  backdropFilter: 'blur(20px) saturate(1.4)',
                  WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
                  maskImage: 'linear-gradient(to bottom, transparent 0%, black 20%)',
                  WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 20%)',
                }}
              >
                {visibleMessages.map((message) => (
                  <div key={message.id}>
                    <div className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                      <div
                        className="max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-lg"
                        style={{
                          background: message.role === 'user' ? '#1e3a2f' : '#fa6b04',
                          color: '#ffffff',
                        }}
                      >
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      </div>
                    </div>
                    {message.projects && message.projects.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {message.projects.map((project) => (
                          <button
                            key={project.id}
                            type="button"
                            onClick={() => void handleProjectOrRfqSelection(project.name)}
                            className="rounded-xl px-4 py-2 text-sm font-medium shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"
                            style={{ background: '#ffffff', color: '#1e3a2f', border: '1.5px solid #e2d9cf' }}
                          >
                            <span className="font-semibold">{project.name}</span>
                            {project.location && (
                              <span className="ml-1.5 text-xs" style={{ color: '#8a9e96' }}>{project.location}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {message.rfqs && message.rfqs.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {message.rfqs.map((rfq) => (
                          <button
                            key={rfq.id}
                            type="button"
                            onClick={() => {
                              setMessages((current) => [
                                ...current,
                                { id: makeId(), role: 'user', content: rfq.title },
                                { id: makeId(), role: 'assistant', content: `Taking you to ${rfq.title}…` },
                              ])
                              setTimeout(() => {
                                window.location.href = `/contractor/projects/${rfq.projectId}/rfqs/${rfq.id}`
                              }, 800)
                            }}
                            className="rounded-xl px-4 py-2.5 text-left text-sm font-medium shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"
                            style={{ background: '#ffffff', color: '#1e3a2f', border: '1.5px solid #e2d9cf' }}
                          >
                            <span className="font-semibold">{rfq.title}</span>
                            <span className="ml-2 inline-flex items-center gap-1.5 text-xs" style={{ color: '#8a9e96' }}>
                              {rfq.status}
                              {typeof rfq.bidCount === 'number' && ` · ${rfq.bidCount} bid${rfq.bidCount === 1 ? '' : 's'}`}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {(isSending || isLoadingContext) && (
                  <div className="flex justify-start">
                    <div
                      className="rounded-2xl px-4 py-2.5 text-sm shadow-lg"
                      style={{ background: '#fa6b04', color: '#ffffff' }}
                    >
                      {isLoadingContext ? 'Refreshing context…' : 'Thinking…'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div
              className={cn(
                'mb-2 rounded-full px-4 py-2 text-xs font-medium shadow-lg',
                isClosing ? 'animate-[sa-content-hide_160ms_ease-in_forwards]' : 'animate-[sa-content-fade_260ms_ease-out_800ms_both]',
              )}
              style={{ background: 'rgba(255,247,237,0.95)', color: '#a85c2a', backdropFilter: 'blur(12px)' }}
            >
              {error}
            </div>
          )}

          {/* Input pill */}
          <form onSubmit={handleSubmit} className="relative flex h-12 items-center">
            <div
              className={cn(
                'absolute inset-y-0 left-[3.5rem] right-0 rounded-full bg-white shadow-2xl',
                isClosing ? 'animate-[sa-pill-collapse_240ms_ease-out_forwards]' : 'animate-[sa-pill-emerge_300ms_ease-out_650ms_both]',
              )}
              style={{ border: '1.5px solid #fa6b04', transformOrigin: 'left center' }}
              aria-hidden="true"
            />
            <span aria-hidden="true" className="h-12 w-12 shrink-0" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'relative z-10 ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-gray-100',
                isClosing ? 'animate-[sa-content-hide_160ms_ease-in_forwards]' : 'animate-[sa-content-fade_260ms_ease-out_800ms_both]',
              )}
              style={{ color: '#8a9e96' }}
              aria-label="Attach file"
              title="Attach CSV to create RFQ"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <input
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className={cn(
                'relative z-10 min-w-0 flex-1 bg-transparent py-3.5 pl-3 pr-3 text-sm outline-none',
                isClosing ? 'animate-[sa-content-hide_160ms_ease-in_forwards]' : 'animate-[sa-content-fade_260ms_ease-out_800ms_both]',
              )}
              style={{ color: '#1e3a2f' }}
              placeholder="Ask anything about your projects, quote requests, vendor responses, or comparisons..."
              disabled={isSending}
              onKeyDown={(event) => {
                if (event.key === 'Escape') { event.preventDefault(); dismissChat() }
              }}
            />
            <button
              type="button"
              onClick={startNewChat}
              disabled={isLoadingContext || isSending || messages.length <= 1}
              className={cn(
                'relative z-10 shrink-0 flex h-8 w-8 items-center justify-center rounded-full transition disabled:opacity-40',
                isClosing ? 'animate-[sa-content-hide_160ms_ease-in_forwards]' : 'animate-[sa-content-fade_360ms_ease-out_760ms_both]',
              )}
              style={{ color: '#8a9e96' }}
              aria-label="New chat"
              title="New chat"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              type="submit"
              disabled={!draft.trim() || isSending}
              className={cn(
                'relative z-10 shrink-0 rounded-full px-5 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-60',
                isClosing ? 'animate-[sa-content-hide_160ms_ease-in_forwards]' : 'animate-[sa-content-fade_360ms_ease-out_760ms_both]',
              )}
              style={{ background: '#1e3a2f' }}
            >
              {isSending ? 'Thinking…' : 'Send'}
            </button>
            <span className="w-3 shrink-0" />
          </form>
        </section>
      )}
    </>
  )
}
