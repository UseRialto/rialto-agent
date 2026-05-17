'use client'

import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, FileSpreadsheet, FileText, Loader2, Plus, Trash2, UploadCloud } from 'lucide-react'
import { uploadRequestAttachmentFile } from '@/lib/files/blob-client-upload'

interface Props {
  projectId: string
  projectName: string
}

type ImportResponse = {
  redirectTo?: string
  error?: string
  lineItemCount?: number
  vendorCount?: number
  warnings?: Array<{ message: string; row?: number }>
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function fileIcon(file: File) {
  return file.name.toLowerCase().endsWith('.pdf')
    ? <FileText className="h-4 w-4" />
    : <FileSpreadsheet className="h-4 w-4" />
}

export function VendorQuoteImportWorkflow({ projectId, projectName }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [rfqName, setRfqName] = useState(`${projectName} - Vendor Quote Comparison`)
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<Array<{ message: string; row?: number }>>([])

  const totalBytes = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files])
  const canSubmit = rfqName.trim().length > 1 && files.length > 0 && !busy

  function addFiles(fileList: FileList | null) {
    if (!fileList) return
    const incoming = Array.from(fileList)
    setFiles((current) => {
      const existing = new Set(current.map(fileKey))
      return [
        ...current,
        ...incoming.filter((file) => {
          const key = fileKey(file)
          if (existing.has(key)) return false
          existing.add(key)
          return true
        }),
      ]
    })
  }

  function removeFile(key: string) {
    setFiles((current) => current.filter((file) => fileKey(file) !== key))
  }

  async function submitImport() {
    if (!canSubmit) return
    setBusy(true)
    setError('')
    setWarnings([])
    try {
      const uploadFolder = `quote-imports/${crypto.randomUUID().slice(0, 8)}`
      const uploadedFiles = await Promise.all(files.map((file) => uploadRequestAttachmentFile(file, uploadFolder)))
      const formData = new FormData()
      formData.append('projectId', projectId)
      formData.append('rfqName', rfqName.trim())
      formData.append('uploadedFiles', JSON.stringify(uploadedFiles))
      const response = await fetch('/api/external-quote-import', {
        method: 'POST',
        body: formData,
      })
      const json = await response.json() as ImportResponse
      if (!response.ok || !json.redirectTo) {
        throw new Error(json.error ?? 'Import failed.')
      }
      setWarnings(json.warnings ?? [])
      router.push(json.redirectTo)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="rounded-2xl border bg-white p-5 shadow-sm lg:p-6" style={{ borderColor: '#e2d9cf' }}>
        <div className="grid gap-5">
          <label className="grid gap-2">
            <span className="text-sm font-semibold" style={{ color: '#1e3a2f' }}>RFQ name</span>
            <input
              value={rfqName}
              onChange={(event) => setRfqName(event.target.value)}
              className="h-11 rounded-xl border px-3 text-sm outline-none transition focus:ring-2"
              style={{ borderColor: '#d6c9bd', color: '#1e3a2f', '--tw-ring-color': '#a8d5ba' } as CSSProperties}
            />
          </label>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold" style={{ color: '#1e3a2f' }}>Vendor quote files</span>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-colors"
                style={{ background: '#1e3a2f' }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Files
              </button>
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.csv,.tsv,.xlsx,.xls,.xsl,.xml,.txt,application/pdf,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/xml,application/xml,text/plain"
              className="sr-only"
              onChange={(event) => {
                addFiles(event.currentTarget.files)
                event.currentTarget.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                addFiles(event.dataTransfer.files)
              }}
              className="flex min-h-52 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors"
              style={{ borderColor: '#d6c9bd', background: '#fbfaf8', color: '#4a6358' }}
            >
              <UploadCloud className="h-9 w-9" style={{ color: '#2d6a4f' }} />
              <span className="mt-3 text-sm font-semibold">Drop quotes here</span>
              <span className="mt-1 text-xs" style={{ color: '#8a9e96' }}>Multiple vendor files can be imported together.</span>
            </button>
          </div>

          {files.length > 0 && (
            <div className="grid gap-2">
              {files.map((file) => {
                const key = fileKey(file)
                return (
                  <div key={key} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2" style={{ borderColor: '#e2d9cf', background: '#ffffff' }}>
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: '#eef7f1', color: '#2d6a4f' }}>
                        {fileIcon(file)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold" style={{ color: '#1e3a2f' }}>{file.name}</p>
                        <p className="text-xs" style={{ color: '#8a9e96' }}>{formatBytes(file.size)}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(key)}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors hover:bg-red-50"
                      style={{ color: '#b84a3a' }}
                      aria-label={`Remove ${file.name}`}
                      title={`Remove ${file.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: '#f5c6c6', background: '#fff7f7', color: '#9b2c2c' }}>
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {warnings.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: '#f2d6a2', background: '#fffaf0', color: '#7c4a03' }}>
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{warnings[0].message}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: '#e2d9cf' }}>
            <span className="text-xs font-medium" style={{ color: '#8a9e96' }}>
              {files.length} file{files.length === 1 ? '' : 's'} selected · {formatBytes(totalBytes)}
            </span>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void submitImport()}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: '#fa6b04' }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              {busy ? 'Importing...' : 'Create Comparison'}
            </button>
          </div>
        </div>
      </section>

      <aside className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: '#e2d9cf' }}>
        <h2 className="text-sm font-semibold" style={{ color: '#1e3a2f' }}>Import summary</h2>
        <dl className="mt-4 grid gap-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt style={{ color: '#8a9e96' }}>Project</dt>
            <dd className="truncate font-semibold" style={{ color: '#1e3a2f' }}>{projectName}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt style={{ color: '#8a9e96' }}>Files</dt>
            <dd className="font-semibold" style={{ color: '#1e3a2f' }}>{files.length}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt style={{ color: '#8a9e96' }}>Size</dt>
            <dd className="font-semibold" style={{ color: '#1e3a2f' }}>{formatBytes(totalBytes)}</dd>
          </div>
        </dl>
      </aside>
    </div>
  )
}
