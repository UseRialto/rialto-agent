import Link from 'next/link'
import {
  ArrowRight,
  FileSearch,
  FileText,
  Mail,
  PackageCheck,
  Send,
} from 'lucide-react'
import type { ContractorActivityNotification } from '@/lib/types/contractor'

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'just now'
}

function getHref(n: ContractorActivityNotification): string {
  if (n.type === 'bid_received' && n.project_id && n.rfq_id) {
    return `/contractor/projects/${n.project_id}/rfqs/${n.rfq_id}`
  }
  if (n.type === 'message_received' && n.project_id && n.rfq_id) {
    return `/contractor/projects/${n.project_id}/rfqs/${n.rfq_id}?section=message-center`
  }
  if ((n.type === 'email_received' || n.type === 'review_task' || n.type === 'rfq_published') && n.project_id && n.rfq_id) {
    return `/contractor/projects/${n.project_id}/rfqs/${n.rfq_id}`
  }
  if (n.project_id) {
    return `/contractor/projects/${n.project_id}`
  }
  return '/contractor/projects'
}

type ActivityVisual = { Icon: React.ComponentType<{ className?: string }>; label: string; bg: string; color: string }

function getActivityVisual(type: ContractorActivityNotification['type']): ActivityVisual {
  switch (type) {
    case 'bid_received':
      return { Icon: FileText, label: 'Quote received', bg: '#e8f4ee', color: '#2d6a4f' }
    case 'email_received':
      return { Icon: Mail, label: 'Quote reply', bg: '#ede8e2', color: '#4a6358' }
    case 'message_received':
      return { Icon: Mail, label: 'Message received', bg: '#fff3eb', color: '#fa6b04' }
    case 'rfq_published':
      return { Icon: Send, label: 'RFQ sent', bg: '#e8f4ee', color: '#2d6a4f' }
    case 'review_task':
      return { Icon: FileSearch, label: 'Review task', bg: '#fdf0e8', color: '#a85c2a' }
    default:
      return { Icon: PackageCheck, label: 'Update', bg: '#ede8e2', color: '#4a6358' }
  }
}

function getDarkActivityVisual(type: ContractorActivityNotification['type']): ActivityVisual {
  const base = getActivityVisual(type)
  switch (type) {
    case 'bid_received':
    case 'rfq_published':
      return { ...base, bg: '#e8f4ee', color: '#2d6a4f' }
    case 'message_received':
      return { ...base, bg: '#fff3eb', color: '#fa6b04' }
    case 'review_task':
      return { ...base, bg: '#fdf0e8', color: '#a85c2a' }
    default:
      return { ...base, bg: '#ffffff', color: '#4a6358' }
  }
}

export function ActivityFeed({
  notifications,
  variant = 'light',
}: {
  notifications: ContractorActivityNotification[]
  variant?: 'light' | 'dark'
}) {
  const unreadCount = notifications.filter((n) => !n.read).length
  const isDark = variant === 'dark'

  return (
    <section
      className={isDark ? 'rounded-2xl p-5' : undefined}
      style={isDark ? { background: '#faf8f5', border: '1px solid #e2d9cf', boxShadow: '0 18px 42px rgba(30,58,47,0.08)' } : undefined}
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight" style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: '#1e3a2f' }}>Recent Activity</h2>
            {unreadCount > 0 && (
              <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={isDark ? { background: '#e8f4ee', color: '#2d6a4f', outline: '1px solid #a8d5ba' } : { background: '#e8f4ee', color: '#2d6a4f', outline: '1px solid #a8d5ba' }}>
                {unreadCount} new
              </span>
            )}
          </div>
          <p className="mt-1 text-sm" style={{ color: isDark ? '#4a6358' : '#8a9e96' }}>Quotes, vendor replies, and order milestones across your projects.</p>
        </div>
      </div>

      <div
        className="overflow-hidden rounded-2xl"
        style={isDark
          ? { background: 'transparent', border: '0', boxShadow: 'none' }
          : { background: '#ffffff', border: '1px solid #e2d9cf', boxShadow: '0 12px 32px rgba(30,58,47,0.06)' }}
      >
        {notifications.length === 0 ? (
          <div className="rounded-xl px-5 py-12 text-center" style={{ background: isDark ? '#ffffff' : 'transparent', border: isDark ? '1px solid #e2d9cf' : undefined }}>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: isDark ? '#e8f4ee' : '#ede8e2', color: isDark ? '#2d6a4f' : '#4a6358' }}>
              <PackageCheck className="h-5 w-5" />
            </div>
            <p className="mt-4 text-sm font-semibold" style={{ color: '#1e3a2f' }}>No recent activity yet.</p>
            <p className="mt-1 text-sm" style={{ color: isDark ? '#4a6358' : '#8a9e96' }}>Published RFQs, quotes, quote replies, and order updates will appear here.</p>
          </div>
        ) : (
          <div className={isDark ? 'space-y-2' : 'divide-y'} style={{ borderColor: '#e2d9cf' }}>
            {notifications.map((n) => (
            (() => {
              const visual = isDark ? getDarkActivityVisual(n.type) : getActivityVisual(n.type)
              const Icon = visual.Icon
              return (
                <Link
                  key={n.id}
                  href={getHref(n)}
                  className={`group grid gap-2 px-3.5 py-3 transition-colors sm:grid-cols-[2.25rem_minmax(0,1fr)] ${isDark ? 'rounded-xl hover:bg-[#f3f8f5]' : 'hover:bg-[#faf8f5]'} `}
                  style={{
                    background: isDark ? '#ffffff' : undefined,
                    border: isDark ? '1px solid #d9e3dc' : undefined,
                    borderLeft: `4px solid ${!n.read ? '#fa6b04' : 'transparent'}`,
                    boxShadow: isDark ? '0 8px 20px rgba(30,58,47,0.05)' : undefined,
                  }}
                >
                  <div
                    className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: visual.bg, color: visual.color, outline: isDark ? '1px solid rgba(45,106,79,0.14)' : '1px solid rgba(30,58,47,0.05)' }}
                    aria-label={visual.label}
                  >
                    <Icon className="h-4 w-4" />
                    {!n.read && (
                      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2" style={{ background: '#fa6b04', borderColor: '#ffffff' }} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          background: visual.bg,
                          color: visual.color,
                          outline: isDark ? '1px solid rgba(45,106,79,0.14)' : undefined,
                        }}
                      >
                        {visual.label}
                      </span>
                      <span className="text-xs sm:hidden" style={{ color: isDark ? '#4a6358' : '#8a9e96' }}>{relativeTime(n.created_at)}</span>
                    </div>
                    <p className="mt-1 text-sm leading-5" style={{ fontWeight: !n.read ? 700 : 600, color: !n.read ? '#1e3a2f' : '#4a6358' }}>
                      {n.title}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-xs leading-4" style={{ color: isDark ? '#4a6358' : '#8a9e96' }}>{n.body}</p>
                  </div>
                  <div className="col-span-full flex items-center justify-between pl-11 sm:col-span-full">
                    <span className="whitespace-nowrap text-xs" style={{ color: isDark ? '#4a6358' : '#8a9e96' }}>{relativeTime(n.created_at)}</span>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${isDark ? 'group-hover:bg-[#e8f4ee]' : 'group-hover:bg-[#ede8e2]'}`} style={{ color: isDark ? '#4a6358' : '#4a6358' }}>
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              )
            })()
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
