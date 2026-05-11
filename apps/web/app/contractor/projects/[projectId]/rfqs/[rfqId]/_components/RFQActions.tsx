'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteRFQAction, retractRFQAction } from '@/lib/actions/contractor'

interface Props {
  rfqId: string
  projectId: string
  status: string
}

export function RFQActions({ rfqId, projectId, status }: Props) {
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (status !== 'draft' && status !== 'active') return null

  const isDraft = status === 'draft'
  const label = isDraft ? 'Delete Draft' : 'Retract RFQ'
  const confirmLabel = isDraft ? 'Delete' : 'Retract'
  const confirmMsg = isDraft
    ? 'This will permanently delete this draft. Cannot be undone.'
    : 'This will retract the RFQ and remove it from vendor view. Active quotes will be discarded.'

  async function handleConfirm() {
    setLoading(true)
    setError('')
    try {
      const result = isDraft
        ? await deleteRFQAction(projectId, rfqId)
        : await retractRFQAction(projectId, rfqId)
      if (!result.success) {
        setError(result.error ?? 'Action failed.')
        setLoading(false)
        return
      }
      router.push(`/contractor/projects/${projectId}`)
      router.refresh()
    } catch {
      setError('Action failed. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className="rounded border bg-white px-3 py-1.5 text-xs font-medium transition-colors"
        style={{ borderColor: '#f5c6c6', color: '#c0392b' }}
      >
        {label}
      </button>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-xl" style={{ borderColor: '#e2d9cf' }}>
            <h3 className="mb-2 text-base font-semibold" style={{ color: '#1e3a2f' }}>{label}</h3>
            <p className="mb-4 text-sm" style={{ color: '#8a9e96' }}>{confirmMsg}</p>
            {error && (
              <div className="mb-3 rounded border px-3 py-2" style={{ borderColor: '#f5c6c6', background: '#fdeaea' }}>
                <p className="text-sm" style={{ color: '#c0392b' }}>{error}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={loading}
                className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
                style={{ background: '#c0392b' }}
              >
                {loading ? 'Processing…' : confirmLabel}
              </button>
              <button
                type="button"
                onClick={() => { setShowConfirm(false); setError('') }}
                className="rounded-md border bg-white px-4 py-2 text-sm font-medium transition-colors"
                style={{ borderColor: '#e2d9cf', color: '#4a6358' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
