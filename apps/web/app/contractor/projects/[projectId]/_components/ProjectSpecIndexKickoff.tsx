'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { ProjectSpecDocumentSummary } from '@/lib/types/procurement'

export function ProjectSpecIndexKickoff({
  projectId,
  documents,
}: {
  projectId: string
  documents: ProjectSpecDocumentSummary[]
}) {
  const router = useRouter()
  const startedRef = useRef(new Set<number>())
  const pending = documents.filter((document) => document.status === 'uploaded' || document.status === 'processing')
  const pendingIds = pending.map((document) => document.id).join(',')

  useEffect(() => {
    if (pending.length === 0) return
    let cancelled = false

    for (const document of pending) {
      if (startedRef.current.has(document.id)) continue
      startedRef.current.add(document.id)
      void fetch('/api/project-spec-index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, documentId: document.id }),
      }).finally(() => {
        if (!cancelled) router.refresh()
      })
    }

    const poll = window.setInterval(() => {
      if (!cancelled) router.refresh()
    }, 7000)

    return () => {
      cancelled = true
      window.clearInterval(poll)
    }
  }, [pendingIds, projectId, router])

  return null
}
