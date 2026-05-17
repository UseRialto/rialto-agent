'use client'

import { useState } from 'react'
import { CheckCircle2, TriangleAlert, X } from 'lucide-react'

export function ImportStatusBubble({
  status,
  message,
}: {
  status?: string
  message?: string
}) {
  const [visible, setVisible] = useState(Boolean(message))
  if (!message || !visible) return null

  const isFallback = status === 'fallback'
  const Icon = isFallback ? TriangleAlert : CheckCircle2

  return (
    <div className="fixed right-5 top-24 z-50 max-w-sm rounded-xl border bg-white px-3 py-2 shadow-xl" style={{
      borderColor: isFallback ? '#fdc89a' : '#a8d5ba',
      boxShadow: '0 18px 42px rgba(30,58,47,0.16)',
    }}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: isFallback ? '#a85c2a' : '#2d6a4f' }} />
        <p className="min-w-0 flex-1 text-xs font-semibold leading-5" style={{ color: isFallback ? '#a85c2a' : '#2d6a4f' }}>
          {message}
        </p>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-[#edf3f0]"
          style={{ color: '#587067' }}
          aria-label="Dismiss import status"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
