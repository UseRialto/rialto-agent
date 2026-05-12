'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileUp } from 'lucide-react'

interface Props {
  projectId: string
  variant?: 'primary' | 'empty'
}

export function ExternalQuoteImportButton({ projectId, variant = 'primary' }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function importFile(file: File) {
    setBusy(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('projectId', projectId)
      formData.append('file', file)
      const response = await fetch('/api/external-quote-import', {
        method: 'POST',
        body: formData,
      })
      const json = await response.json() as { redirectTo?: string; error?: string }
      if (!response.ok || !json.redirectTo) {
        throw new Error(json.error ?? 'Import failed.')
      }
      router.push(json.redirectTo)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Import failed.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const style = variant === 'empty'
    ? { background: '#ffffff', color: '#2d6a4f', border: '1px solid #a8d5ba' }
    : { background: 'rgba(255,255,255,0.08)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.15)' }

  return (
    <div className="relative inline-flex flex-col items-end">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.xlsx,.xls,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="sr-only"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (file) void importFile(file)
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-60"
        style={style}
      >
        <FileUp className="h-4 w-4" />
        {busy ? 'Importing...' : 'Import Vendor Quotes'}
      </button>
      {error && (
        <p className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-72 rounded-lg border bg-white px-3 py-2 text-xs shadow-lg" style={{ borderColor: '#f5c6c6', color: '#c0392b' }}>
          {error}
        </p>
      )}
    </div>
  )
}
