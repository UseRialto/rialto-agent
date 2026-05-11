'use client'

import { useRouter } from 'next/navigation'
import type { CSSProperties } from 'react'
import { useState } from 'react'

export function EditableRFQTitle({
  rfqId,
  initialTitle,
  className,
  style,
}: {
  rfqId: string
  initialTitle: string
  className?: string
  style?: CSSProperties
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(initialTitle)
  const [draft, setDraft] = useState(initialTitle)

  async function commit() {
    const next = draft.trim()
    if (!next) { setDraft(title); setEditing(false); return }
    if (next === title) { setEditing(false); return }
    setTitle(next)
    setEditing(false)
    const response = await fetch(`/api/rfqs/${rfqId}/title`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: next }),
    })
    if (!response.ok) {
      setTitle(title)
      setDraft(title)
      return
    }
    router.refresh()
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); void commit() }
          if (event.key === 'Escape') { event.preventDefault(); setDraft(title); setEditing(false) }
        }}
        className={className}
        style={{ ...style, background: '#ffffff', border: '1px solid #2563eb', borderRadius: 4, padding: '0 6px', outline: 'none' }}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={className}
      style={{ ...style, display: 'block', textAlign: 'left' }}
      title="Click to rename"
    >
      {title}
    </button>
  )
}
