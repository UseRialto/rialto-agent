'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
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

type ActivityCategoryKey = 'review' | 'messages' | 'quotes' | 'rfqs'

type ActivityCategory = {
  key: ActivityCategoryKey
  label: string
  description: string
  notifications: ContractorActivityNotification[]
  visual: ActivityVisual
}

const ACK_STORAGE_KEY = 'rialto:contractor-activity-acknowledged:v1'

function readAcknowledgedIds() {
  if (typeof window === 'undefined') return new Set<string>()
  try {
    const stored = window.localStorage.getItem(ACK_STORAGE_KEY)
    if (!stored) return new Set<string>()
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return new Set<string>()
    return new Set(parsed.filter((value): value is string => typeof value === 'string'))
  } catch {
    return new Set<string>()
  }
}

function getCategoryKey(type: ContractorActivityNotification['type']): ActivityCategoryKey {
  switch (type) {
    case 'review_task':
      return 'review'
    case 'email_received':
    case 'message_received':
      return 'messages'
    case 'bid_received':
      return 'quotes'
    case 'rfq_published':
    default:
      return 'rfqs'
  }
}

function getCategoryCopy(key: ActivityCategoryKey) {
  switch (key) {
    case 'review':
      return { label: 'Review', description: 'Open extraction and comparison tasks' }
    case 'messages':
      return { label: 'Messages', description: 'Vendor replies and in-app messages' }
    case 'quotes':
      return { label: 'Quotes', description: 'Received vendor pricing' }
    case 'rfqs':
    default:
      return { label: 'RFQs', description: 'Published quote requests' }
  }
}

function buildCategories(notifications: ContractorActivityNotification[], isDark: boolean): ActivityCategory[] {
  const grouped = new Map<ActivityCategoryKey, ContractorActivityNotification[]>()
  for (const notification of notifications) {
    const key = getCategoryKey(notification.type)
    grouped.set(key, [...(grouped.get(key) ?? []), notification])
  }

  return (['review', 'messages', 'quotes', 'rfqs'] as ActivityCategoryKey[])
    .map((key) => {
      const categoryNotifications = grouped.get(key) ?? []
      const copy = getCategoryCopy(key)
      const visualType: ContractorActivityNotification['type'] = key === 'review'
        ? 'review_task'
        : key === 'messages'
          ? 'message_received'
          : key === 'quotes'
            ? 'bid_received'
            : 'rfq_published'
      return {
        key,
        ...copy,
        notifications: categoryNotifications,
        visual: isDark ? getDarkActivityVisual(visualType) : getActivityVisual(visualType),
      }
    })
    .filter((category) => category.notifications.length > 0)
}

export function ActivityFeed({
  notifications,
  variant = 'light',
}: {
  notifications: ContractorActivityNotification[]
  variant?: 'light' | 'dark'
}) {
  const isDark = variant === 'dark'
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(readAcknowledgedIds)
  const [expandedKey, setExpandedKey] = useState<ActivityCategoryKey | null>(null)
  const categories = useMemo(() => buildCategories(notifications, isDark), [notifications, isDark])
  const unreadCount = notifications.filter((n) => !acknowledgedIds.has(n.id)).length

  function updateAcknowledged(next: Set<string>) {
    setAcknowledgedIds(next)
    try {
      window.localStorage.setItem(ACK_STORAGE_KEY, JSON.stringify([...next]))
    } catch {
      // Local acknowledgement is a convenience only; rendering should keep working if storage is blocked.
    }
  }

  function markNotificationRead(id: string) {
    const next = new Set(acknowledgedIds)
    next.add(id)
    updateAcknowledged(next)
  }

  function markCategoryRead(category: ActivityCategory) {
    const next = new Set(acknowledgedIds)
    for (const notification of category.notifications) {
      next.add(notification.id)
    }
    updateAcknowledged(next)
  }

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
          <p className="mt-1 text-sm" style={{ color: isDark ? '#4a6358' : '#8a9e96' }}>Grouped updates across your projects.</p>
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
            {categories.map((category) => {
              const categoryUnreadCount = category.notifications.filter((n) => !acknowledgedIds.has(n.id)).length
              const isExpanded = expandedKey === category.key
              const CategoryIcon = category.visual.Icon
              return (
                <div
                  key={category.key}
                  className={isDark ? 'overflow-hidden rounded-xl' : undefined}
                  style={{
                    background: isDark ? '#ffffff' : undefined,
                    border: isDark ? '1px solid #d9e3dc' : undefined,
                    boxShadow: isDark ? '0 8px 20px rgba(30,58,47,0.05)' : undefined,
                  }}
                >
                  <div className="flex items-center gap-3 px-3.5 py-3">
                    <button
                      type="button"
                      onClick={() => setExpandedKey(isExpanded ? null : category.key)}
                      className="grid min-w-0 flex-1 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2 text-left"
                    >
                      <span
                        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                        style={{ background: category.visual.bg, color: category.visual.color, outline: isDark ? '1px solid rgba(45,106,79,0.14)' : '1px solid rgba(30,58,47,0.05)' }}
                        aria-label={category.label}
                      >
                        <CategoryIcon className="h-4 w-4" />
                        {categoryUnreadCount > 0 && (
                          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white" style={{ background: '#fa6b04' }}>
                            {categoryUnreadCount}
                          </span>
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold" style={{ color: '#1e3a2f' }}>{category.label}</span>
                          <span className="text-xs" style={{ color: isDark ? '#4a6358' : '#8a9e96' }}>
                            {category.notifications.length}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs" style={{ color: isDark ? '#4a6358' : '#8a9e96' }}>{category.description}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        {categoryUnreadCount > 0 && (
                          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: '#fff3eb', color: '#9a4a00', outline: '1px solid #f8caa8' }}>
                            {categoryUnreadCount} unread
                          </span>
                        )}
                        <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} style={{ color: '#4a6358' }} />
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => markCategoryRead(category)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[#e8f4ee]"
                      style={{ color: categoryUnreadCount > 0 ? '#2d6a4f' : '#8a9e96' }}
                      aria-label={`Mark ${category.label} read`}
                      title={`Mark ${category.label} read`}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="border-t" style={{ borderColor: '#e2d9cf' }}>
                      {category.notifications.map((n) => {
                        const visual = isDark ? getDarkActivityVisual(n.type) : getActivityVisual(n.type)
                        const Icon = visual.Icon
                        const isUnread = !acknowledgedIds.has(n.id)
                        return (
                          <div
                            key={n.id}
                            className="grid gap-2 px-3.5 py-3 sm:grid-cols-[2rem_minmax(0,1fr)]"
                            style={{
                              background: isUnread ? '#fffaf5' : '#ffffff',
                              borderLeft: `4px solid ${isUnread ? '#fa6b04' : 'transparent'}`,
                            }}
                          >
                            <div
                              className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                              style={{ background: visual.bg, color: visual.color, outline: isDark ? '1px solid rgba(45,106,79,0.14)' : '1px solid rgba(30,58,47,0.05)' }}
                              aria-label={visual.label}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0">
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
                                <span className="text-xs" style={{ color: isDark ? '#4a6358' : '#8a9e96' }}>{relativeTime(n.created_at)}</span>
                              </div>
                              <Link href={getHref(n)} className="group mt-1 block">
                                <p className="text-sm leading-5 group-hover:underline" style={{ fontWeight: isUnread ? 700 : 600, color: isUnread ? '#1e3a2f' : '#4a6358' }}>
                                  {n.title}
                                </p>
                                <p className="mt-0.5 line-clamp-2 text-xs leading-4" style={{ color: isDark ? '#4a6358' : '#8a9e96' }}>{n.body}</p>
                              </Link>
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => markNotificationRead(n.id)}
                                  className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors hover:bg-[#e8f4ee]"
                                  style={{ color: isUnread ? '#2d6a4f' : '#8a9e96' }}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  {isUnread ? 'Mark read' : 'Read'}
                                </button>
                                <Link
                                  href={getHref(n)}
                                  className="flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition-colors hover:bg-[#ede8e2]"
                                  style={{ color: '#4a6358' }}
                                >
                                  Open
                                  <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
