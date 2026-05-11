'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mail, Send } from 'lucide-react'
import { sendRFQVendorMessageAction } from '@/lib/actions/contractor'
import type { NegotiationMessage } from '@/lib/types/procurement'

interface MessageVendorThread {
  vendorId?: string
  vendorEmail: string
  vendorName: string
  messages: NegotiationMessage[]
}

export function MessageCenter({
  rfqId,
  mailboxConnected,
  vendorThreads,
}: {
  rfqId: string
  mailboxConnected: boolean
  vendorThreads: MessageVendorThread[]
}) {
  const router = useRouter()
  const [activeVendorEmail, setActiveVendorEmail] = useState(vendorThreads[0]?.vendorEmail ?? '')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const activeThread = useMemo(
    () => vendorThreads.find((thread) => thread.vendorEmail === activeVendorEmail) ?? vendorThreads[0],
    [activeVendorEmail, vendorThreads],
  )

  if (vendorThreads.length === 0) {
    return (
      <div className="rounded-2xl border bg-white p-8 text-center shadow-sm" style={{ borderColor: '#e2d9cf' }}>
        <Mail className="mx-auto h-8 w-8" style={{ color: '#8a9e96' }} />
        <h2 className="mt-3 text-lg font-semibold" style={{ color: '#1e3a2f' }}>No invited vendors yet</h2>
        <p className="mt-1 text-sm" style={{ color: '#8a9e96' }}>
          Invite vendors to this RFQ before starting a message thread.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
      <aside className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: '#e2d9cf' }}>
        <div className="border-b px-4 py-3" style={{ borderColor: '#ede8e2' }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>Vendors</p>
        </div>
        <div className="p-2">
          {vendorThreads.map((thread) => {
            const active = thread.vendorEmail === activeThread?.vendorEmail
            const lastMessage = thread.messages[thread.messages.length - 1]
            return (
              <button
                key={thread.vendorEmail}
                type="button"
                onClick={() => {
                  setActiveVendorEmail(thread.vendorEmail)
                  setError('')
                }}
                className="w-full rounded-xl px-3 py-3 text-left transition-colors"
                style={active ? { background: '#fff3eb' } : { background: 'transparent' }}
              >
                <p className="truncate text-sm font-semibold" style={{ color: active ? '#1e3a2f' : '#4a6358' }}>
                  {thread.vendorName || thread.vendorEmail}
                </p>
                <p className="mt-0.5 truncate text-xs" style={{ color: '#8a9e96' }}>
                  {lastMessage ? lastMessage.message : 'No messages yet'}
                </p>
              </button>
            )
          })}
        </div>
      </aside>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: '#e2d9cf' }}>
        <header className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: '#ede8e2' }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#fa6b04' }}>Message Center</p>
            <h2 className="mt-1 text-xl font-semibold" style={{ color: '#1e3a2f' }}>
              {activeThread?.vendorName || activeThread?.vendorEmail}
            </h2>
            <p className="text-xs" style={{ color: '#8a9e96' }}>{activeThread?.vendorEmail}</p>
          </div>
          {!mailboxConnected && (
            <Link
              href="/contractor/settings"
              className="rounded-full px-3 py-2 text-xs font-semibold"
              style={{ background: '#fdf0e8', color: '#a85c2a', border: '1px solid #e8c4a0' }}
            >
              Connect mailbox to send
            </Link>
          )}
        </header>

        <div className="min-h-[24rem] space-y-3 px-5 py-5" style={{ background: '#f5f0eb' }}>
          {(activeThread?.messages ?? []).length === 0 ? (
            <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed bg-white px-6 text-center" style={{ borderColor: '#e2d9cf' }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: '#1e3a2f' }}>No messages yet</p>
                <p className="mt-1 text-xs" style={{ color: '#8a9e96' }}>
                  Start the thread and the vendor will receive a magic-link email to respond.
                </p>
              </div>
            </div>
          ) : (
            activeThread?.messages.map((message) => {
              const isContractor = message.author_role === 'contractor'
              return (
                <div key={message.id} className={isContractor ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    className="max-w-[78%] rounded-2xl border px-4 py-3 text-sm shadow-sm"
                    style={{
                      background: isContractor ? '#fff3eb' : '#ffffff',
                      borderColor: isContractor ? '#fdc89a' : '#e2d9cf',
                      color: '#1e3a2f',
                    }}
                  >
                    <div className="mb-1 flex items-center gap-2 text-xs font-semibold" style={{ color: isContractor ? '#fa6b04' : '#2d6a4f' }}>
                      <span>{message.author_name}</span>
                      <span style={{ color: '#8a9e96' }}>{new Date(message.created_at).toLocaleString()}</span>
                    </div>
                    <p className="whitespace-pre-wrap leading-6">{message.message}</p>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="border-t p-4" style={{ borderColor: '#ede8e2' }}>
          {error && (
            <div className="mb-3 rounded-xl px-4 py-3 text-sm" style={{ background: '#fdeaea', border: '1px solid #f5c6c6', color: '#c0392b' }}>
              {error}
            </div>
          )}
          <textarea
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={isPending}
            className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition focus:ring-2"
            style={{ borderColor: '#e2d9cf', color: '#1e3a2f' }}
            placeholder="Write a message to this vendor..."
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs" style={{ color: '#8a9e96' }}>
              Messages are emailed with a secure response link and saved to this thread.
            </p>
            <button
              type="button"
              disabled={!draft.trim() || isPending}
              onClick={() => {
                if (!activeThread || !draft.trim()) return
                if (!mailboxConnected) {
                  setError('Connect Gmail or Outlook in Settings before sending vendor messages.')
                  return
                }
                setError('')
                startTransition(async () => {
                  const result = await sendRFQVendorMessageAction(
                    rfqId,
                    activeThread.vendorEmail,
                    activeThread.vendorName,
                    draft,
                    activeThread.vendorId,
                  )
                  if (!result.success) {
                    setError(result.error ?? 'Failed to send message.')
                    return
                  }
                  setDraft('')
                  router.refresh()
                })
              }}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: '#fa6b04' }}
            >
              <Send className="h-4 w-4" />
              Send
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
