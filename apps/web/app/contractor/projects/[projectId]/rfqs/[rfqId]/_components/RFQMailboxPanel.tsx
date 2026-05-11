'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Inbox, MailCheck, RefreshCw, RotateCcw, Send, ShieldCheck } from 'lucide-react'
import { sendRFQEmailsAction, syncRFQMailboxAction } from '@/lib/actions/contractor'
import type { RFQEmailWorkflowSummary } from '@/lib/types/contractor'

type Props = {
  rfqId: string
  summary: RFQEmailWorkflowSummary
}

function fmtDirection(direction: 'inbound' | 'outbound') {
  return direction === 'inbound' ? 'Inbound' : 'Outbound'
}

export function RFQMailboxPanel({ rfqId, summary }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  function handleSend() {
    setMessage('')
    setError('')
    startTransition(async () => {
      const result = await sendRFQEmailsAction(rfqId)
      if (!result.success) {
        setError(result.error ?? 'Failed to send RFQ emails.')
        return
      }
      setMessage('Magic-form invite emails sent to off-platform vendors.')
      router.refresh()
    })
  }

  function handleSync(forceFull = false) {
    setMessage('')
    setError('')
    startTransition(async () => {
      const result = await syncRFQMailboxAction(rfqId, forceFull)
      if (!result.success) {
        setError(result.error ?? 'Failed to sync mailbox.')
        return
      }
      setMessage(`Mailbox sync complete (${result.mode ?? 'incremental'}, ${result.syncedThreads ?? 0} threads).`)
      router.refresh()
    })
  }

  const hasOffPlatformInvites = summary.sendableOffPlatformInviteCount > 0
  const providerLabel = summary.mailbox.provider === 'microsoft_365' ? 'Microsoft 365' : summary.mailbox.provider === 'google' ? 'Google Workspace' : 'Mailbox'

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: '#e2d9cf' }}>
      <div className="border-b px-5 py-5" style={{ borderColor: '#e2d9cf', background: '#fff3eb' }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-[#fdc89a]" style={{ color: '#fa6b04' }}>
              <Inbox className="h-4 w-4" aria-hidden="true" style={{ color: '#fa6b04' }} />
            </span>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: '#1e3a2f' }}>Mailbox & Quote Sync</h2>
              <p className="text-xs font-medium" style={{ color: '#8a9e96' }}>
                {summary.mailbox.connected ? `${providerLabel} connected as ${summary.mailbox.emailAddress}` : 'Connect a mailbox to send and sync off-platform quotes.'}
              </p>
            </div>
          </div>
          <p className="mt-3 max-w-3xl text-sm" style={{ color: '#4a6358' }}>
            Secure quote links, inbound vendor replies, attachments, and review tasks stay tied to this RFQ.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || !summary.mailbox.connected || !hasOffPlatformInvites}
            onClick={handleSend}
            className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: '#1e3a2f' }}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            Resend Invites
          </button>
          <button
            type="button"
            disabled={pending || !summary.mailbox.connected}
            onClick={() => handleSync(false)}
            className="inline-flex items-center gap-2 rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: '#e2d9cf', color: '#4a6358' }}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Sync Replies
          </button>
          <button
            type="button"
            disabled={pending || !summary.mailbox.connected}
            onClick={() => handleSync(true)}
            className="inline-flex items-center gap-2 rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: '#e2d9cf', color: '#4a6358' }}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Full Resync
          </button>
        </div>
        </div>
      </div>

      {message && (
        <div className="mx-5 mt-4 rounded-md border px-4 py-3" style={{ borderColor: '#a8d5ba', background: '#e8f4ee' }}>
          <p className="text-sm" style={{ color: '#2d6a4f' }}>{message}</p>
        </div>
      )}

      {error && (
        <div className="mx-5 mt-4 rounded-md border px-4 py-3" style={{ borderColor: '#f5c6c6', background: '#fdeaea' }}>
          <p className="text-sm" style={{ color: '#c0392b' }}>{error}</p>
        </div>
      )}

      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Sent', summary.sentVendorCount, 'requests delivered'],
          ['Opened', summary.openedVendorCount, 'forms opened'],
          ['Submitted', summary.submittedVendorCount, 'quotes received'],
          ['Needs Review', summary.reviewTaskCount, 'open tasks'],
        ].map(([label, value, detail]) => (
          <div key={label} className="rounded-xl border px-4 py-3" style={{ borderColor: '#e2d9cf', background: '#ede8e2' }}>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>{label}</p>
            <p className="mt-2 text-2xl font-semibold" style={{ color: '#1e3a2f' }}>{value}</p>
            <p className="mt-1 text-xs" style={{ color: '#4a6358' }}>{detail}</p>
          </div>
        ))}
        <div className="rounded-xl border bg-white px-4 py-3 sm:col-span-2" style={{ borderColor: '#e2d9cf' }}>
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4" aria-hidden="true" style={{ color: '#2d6a4f' }} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>Mailbox Status</p>
              <p className="mt-1 text-sm font-semibold" style={{ color: '#1e3a2f' }}>{summary.mailbox.provider ? providerLabel : 'Not connected'}</p>
              <p className="mt-0.5 text-xs" style={{ color: '#8a9e96' }}>Last sync: {summary.mailbox.lastSyncAt ? new Date(summary.mailbox.lastSyncAt).toLocaleString() : 'Never'}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-white px-4 py-3 sm:col-span-2" style={{ borderColor: '#e2d9cf' }}>
          <div className="flex items-start gap-3">
            <MailCheck className="mt-0.5 h-4 w-4" aria-hidden="true" style={{ color: '#fa6b04' }} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>Off-Platform Vendors</p>
              <p className="mt-1 text-sm font-semibold" style={{ color: '#1e3a2f' }}>{summary.sendableOffPlatformInviteCount} invite-ready vendors</p>
              <p className="mt-0.5 text-xs" style={{ color: '#8a9e96' }}>Connected since: {summary.mailbox.connectedAt ? new Date(summary.mailbox.connectedAt).toLocaleString() : '-'}</p>
            </div>
          </div>
        </div>
      </div>

      {!summary.mailbox.oauthAvailable && (
        <div className="mx-5 rounded-md border px-4 py-3" style={{ borderColor: '#e8c4a0', background: '#fdf0e8' }}>
          <p className="text-sm" style={{ color: '#a85c2a' }}>
            Mailbox OAuth is not configured. Add Google Workspace and/or Microsoft 365 credentials, then connect a mailbox in contractor settings.
          </p>
        </div>
      )}

      {summary.mailbox.oauthAvailable && !summary.mailbox.connected && (
        <div className="mx-5 rounded-md border px-4 py-3" style={{ borderColor: '#fdc89a', background: '#fff3eb' }}>
          <p className="text-sm" style={{ color: '#fa6b04' }}>
            Connect a Google Workspace or Microsoft 365 mailbox in contractor settings before publishing RFQs with off-platform invite emails.
          </p>
        </div>
      )}

      <div className="grid gap-6 p-5 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <h3 className="mb-3 text-sm font-semibold" style={{ color: '#4a6358' }}>Vendor Request Status</h3>
          {summary.vendorRequests.length === 0 ? (
            <p className="text-sm italic" style={{ color: '#8a9e96' }}>No off-platform vendor request records yet.</p>
          ) : (
            <div className="space-y-2">
              {summary.vendorRequests.map((request) => (
                <div key={request.id} className="rounded-lg border px-4 py-3" style={{ borderColor: '#e2d9cf' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium" style={{ color: '#1e3a2f' }}>{request.vendorName || request.vendorEmail}</p>
                      <p className="text-xs" style={{ color: '#8a9e96' }}>{request.vendorEmail}</p>
                    </div>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={
                        request.status === 'submitted'
                          ? { background: '#e8f4ee', color: '#2d6a4f' }
                          : request.status === 'opened'
                          ? { background: '#fdf0e8', color: '#a85c2a' }
                          : request.status === 'sent'
                          ? { background: '#fff3eb', color: '#fa6b04' }
                          : { background: '#ede8e2', color: '#8a9e96' }
                      }
                    >
                      {request.status}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: '#8a9e96' }}>
                    <span>Last message: {request.lastMessageAt ? new Date(request.lastMessageAt).toLocaleString() : '-'}</span>
                    <span>Direction: {request.lastMessageDirection || '-'}</span>
                    <span>Match: {request.matchBasis || '-'}</span>
                    <span>Opened: {request.magicFormFirstOpenedAt ? new Date(request.magicFormFirstOpenedAt).toLocaleString() : '-'}</span>
                    <span>Submitted: {request.magicFormLastSubmittedAt ? new Date(request.magicFormLastSubmittedAt).toLocaleString() : '-'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold" style={{ color: '#4a6358' }}>Open Review Tasks</h3>
          {summary.reviewTasks.length === 0 ? (
            <p className="text-sm italic" style={{ color: '#8a9e96' }}>No open review tasks for this RFQ.</p>
          ) : (
            <div className="space-y-2">
              {summary.reviewTasks.map((task) => (
                <div key={task.id} className="rounded-lg border px-4 py-3" style={{ borderColor: '#e8c4a0', background: '#fdf0e8' }}>
                  <p className="text-sm font-medium" style={{ color: '#a85c2a' }}>{task.title}</p>
                  <p className="mt-1 text-xs" style={{ color: '#a85c2a' }}>{task.details.reason ? String(task.details.reason) : task.taskType}</p>
                  {task.sourceMessage && (
                    <div className="mt-2 rounded-md border px-3 py-2" style={{ borderColor: '#e8c4a0', background: 'rgba(255,255,255,0.7)' }}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={task.sourceMessage.direction === 'inbound'
                            ? { background: '#e8f4ee', color: '#2d6a4f' }
                            : { background: '#ede8e2', color: '#4a6358' }}
                        >
                          {fmtDirection(task.sourceMessage.direction)}
                        </span>
                        <span className="text-[11px]" style={{ color: '#a85c2a' }}>
                          {new Date(task.sourceMessage.sentAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-medium" style={{ color: '#1e3a2f' }}>
                        {task.sourceMessage.fromName || task.sourceMessage.fromEmail}
                      </p>
                      <p className="text-xs" style={{ color: '#4a6358' }}>{task.sourceMessage.subject || 'No subject'}</p>
                      {(task.sourceMessage.snippet || task.sourceMessage.textBody) && (
                        <p className="mt-1 line-clamp-3 text-xs" style={{ color: '#8a9e96' }}>
                          {task.sourceMessage.snippet || task.sourceMessage.textBody}
                        </p>
                      )}
                      {task.sourceMessage.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {task.sourceMessage.attachments.map((attachment) => (
                            <a
                              key={attachment.id}
                              href={attachment.url}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                              style={{ background: '#ede8e2', color: '#4a6358' }}
                            >
                              {attachment.filename}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <p className="mt-1 text-xs" style={{ color: '#a85c2a' }}>{new Date(task.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <h3 className="mb-3 text-sm font-semibold" style={{ color: '#4a6358' }}>Recent Email Activity</h3>
        {summary.recentMessages.length === 0 ? (
          <p className="text-sm italic" style={{ color: '#8a9e96' }}>No synced mailbox messages for this RFQ yet.</p>
        ) : (
          <div className="space-y-3">
            {summary.recentMessages.map((messageRow) => (
              <div key={messageRow.id} className="rounded-lg border px-4 py-3" style={{ borderColor: '#e2d9cf' }}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium" style={{ color: '#1e3a2f' }}>{messageRow.fromName || messageRow.fromEmail}</p>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={messageRow.direction === 'inbound'
                      ? { background: '#e8f4ee', color: '#2d6a4f' }
                      : { background: '#ede8e2', color: '#4a6358' }}
                  >
                    {fmtDirection(messageRow.direction)}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={messageRow.matchStatus === 'needs_review'
                      ? { background: '#fdf0e8', color: '#a85c2a' }
                      : { background: '#fff3eb', color: '#fa6b04' }}
                  >
                    {messageRow.matchStatus}
                  </span>
                </div>
                <p className="mt-1 text-sm" style={{ color: '#4a6358' }}>{messageRow.subject || 'No subject'}</p>
                <p className="mt-1 text-xs" style={{ color: '#8a9e96' }}>{new Date(messageRow.sentAt).toLocaleString()}</p>
                {(messageRow.snippet || messageRow.textBody) && (
                  <p className="mt-2 line-clamp-3 text-sm" style={{ color: '#4a6358' }}>{messageRow.snippet || messageRow.textBody}</p>
                )}
                {messageRow.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {messageRow.attachments.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                        style={{ background: '#ede8e2', color: '#4a6358' }}
                      >
                        {attachment.filename}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
