'use client'

import Link from 'next/link'
import { useActionState, useState, useRef, useEffect } from 'react'
import type { FormEvent } from 'react'
import { FileText, UploadCloud, X } from 'lucide-react'
import { createProjectAction } from '@/lib/actions/contractor'
import { uploadProjectSpecPdf } from '@/lib/files/blob-client-upload'
import { ADDRESS_SUGGESTIONS } from '@/lib/fixtures/address-suggestions'

function formatBudgetInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, '')
  const [whole = '', ...decimalParts] = cleaned.split('.')
  const formattedWhole = whole.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const decimal = decimalParts.join('').slice(0, 2)
  if (cleaned.includes('.')) return `${formattedWhole || '0'}.${decimal}`
  return formattedWhole
}

function isProjectSpecPdf(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export function CreateProjectForm() {
  const [state, action, pending] = useActionState(createProjectAction, undefined)
  const [location, setLocation] = useState('')
  const [budget, setBudget] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [draggingFiles, setDraggingFiles] = useState(false)
  const [uploadingProjectFiles, setUploadingProjectFiles] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadedSpecsInputRef = useRef<HTMLInputElement>(null)
  const submitAfterUploadRef = useRef(false)
  const uploadBatchRef = useRef(`project-${crypto.randomUUID().slice(0, 10)}`)

  const filteredSuggestions = location.length > 0
    ? ADDRESS_SUGGESTIONS.filter((s) => s.toLowerCase().includes(location.toLowerCase())).slice(0, 6)
    : ADDRESS_SUGGESTIONS.slice(0, 6)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function syncFileInput(files: File[]) {
    if (!fileInputRef.current) return
    const transfer = new DataTransfer()
    files.forEach((file) => transfer.items.add(file))
    fileInputRef.current.files = transfer.files
  }

  function addFiles(files: FileList | File[]) {
    const incoming = Array.from(files)
    const pdfFiles = incoming.filter(isProjectSpecPdf)
    const skippedCount = incoming.length - pdfFiles.length
    const merged = [...selectedFiles]
    for (const file of pdfFiles) {
      const duplicate = merged.some((existing) => (
        existing.name === file.name &&
        existing.size === file.size &&
        existing.lastModified === file.lastModified
      ))
      if (!duplicate) merged.push(file)
    }
    setSelectedFiles(merged)
    syncFileInput(merged)
    setUploadError(skippedCount > 0 ? `${skippedCount} non-PDF file${skippedCount === 1 ? '' : 's'} skipped. Project spec uploads must be PDFs.` : '')
  }

  function removeFile(index: number) {
    const next = selectedFiles.filter((_, i) => i !== index)
    setSelectedFiles(next)
    syncFileInput(next)
  }

  async function uploadProjectSpecFiles() {
    if (selectedFiles.length === 0) return []

    const uploaded = []
    for (const file of selectedFiles) {
      const json = await uploadProjectSpecPdf(file, `project-specs/pending/${uploadBatchRef.current}`)
      uploaded.push({
        filename: json.filename,
        fileUrl: json.url,
        mimeType: json.mimeType,
        sizeBytes: json.sizeBytes,
      })
    }
    return uploaded
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (submitAfterUploadRef.current) {
      submitAfterUploadRef.current = false
      return
    }
    if (selectedFiles.length === 0) return

    event.preventDefault()
    setUploadError('')
    setUploadingProjectFiles(true)
    try {
      const uploadedSpecs = await uploadProjectSpecFiles()
      if (uploadedSpecsInputRef.current) {
        uploadedSpecsInputRef.current.value = JSON.stringify(uploadedSpecs)
      }
      submitAfterUploadRef.current = true
      formRef.current?.requestSubmit()
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to upload project spec PDFs.')
    } finally {
      setUploadingProjectFiles(false)
    }
  }

  return (
    <form ref={formRef} action={action} onSubmit={handleSubmit} className="space-y-5">
      <input ref={uploadedSpecsInputRef} type="hidden" name="project_spec_uploads" />
      {state?.message && (
        <div className="rounded-md border px-4 py-3" style={{ borderColor: '#f5c6c6', background: '#fdeaea' }}>
          <p className="text-sm" style={{ color: '#c0392b' }}>{state.message}</p>
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium" style={{ color: '#4a6358' }}>
          Project Name <span style={{ color: '#fa6b04' }}>*</span>
        </label>
        <input
          name="name"
          type="text"
          required
          placeholder="e.g. UCSD Triton Center Phase 2"
          className="w-full rounded-md border bg-white px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none"
          style={{ borderColor: '#e2d9cf', color: '#1e3a2f' }}
        />
        {state?.errors?.name && (
          <p className="mt-1 text-xs" style={{ color: '#c0392b' }}>{state.errors.name[0]}</p>
        )}
      </div>

      {/* Location with autocomplete */}
      <div ref={dropdownRef} className="relative">
        <label className="mb-1 block text-sm font-medium" style={{ color: '#4a6358' }}>
          Location <span style={{ color: '#fa6b04' }}>*</span>
        </label>
        <input
          name="location"
          type="text"
          required
          value={location}
          onChange={(e) => { setLocation(e.target.value); setShowDropdown(true) }}
          onFocus={() => setShowDropdown(true)}
          placeholder="e.g. San Diego, CA"
          autoComplete="off"
          className="w-full rounded-md border bg-white px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none"
          style={{ borderColor: '#e2d9cf', color: '#1e3a2f' }}
        />
        {showDropdown && filteredSuggestions.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow-lg" style={{ borderColor: '#e2d9cf' }}>
            {filteredSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="w-full px-3 py-2 text-left text-sm"
                style={{ color: '#4a6358' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#ede8e2')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                onMouseDown={() => { setLocation(s); setShowDropdown(false) }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {state?.errors?.location && (
          <p className="mt-1 text-xs" style={{ color: '#c0392b' }}>{state.errors.location[0]}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" style={{ color: '#4a6358' }}>
          General Contractor
        </label>
        <input
          name="general_contractor"
          type="text"
          placeholder="e.g. McCarthy Building Companies"
          className="w-full rounded-md border bg-white px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none"
          style={{ borderColor: '#e2d9cf', color: '#1e3a2f' }}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" style={{ color: '#4a6358' }}>
          Description <span className="font-normal" style={{ color: '#8a9e96' }}>(optional)</span>
        </label>
        <textarea
          name="description"
          rows={3}
          placeholder="Brief overview of the project scope and objectives"
          className="w-full rounded-md border bg-white px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none resize-none"
          style={{ borderColor: '#e2d9cf', color: '#1e3a2f' }}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" style={{ color: '#4a6358' }}>
          Budget <span className="font-normal" style={{ color: '#8a9e96' }}>(optional)</span>
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm" style={{ color: '#8a9e96' }}>$</span>
          <input
            name="budget"
            type="text"
            inputMode="decimal"
            value={budget}
            onChange={(event) => setBudget(formatBudgetInput(event.target.value))}
            placeholder="0"
            className="w-full rounded-md border bg-white py-2 pl-7 pr-3 text-sm focus:border-[#fa6b04] focus:outline-none"
            style={{ borderColor: '#e2d9cf', color: '#1e3a2f' }}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" style={{ color: '#4a6358' }}>
          Project Files <span className="font-normal" style={{ color: '#8a9e96' }}>(optional)</span>
        </label>
        <div
          role="button"
          tabIndex={0}
          className="rounded-xl border border-dashed p-4 text-center transition-colors"
          style={{
            background: draggingFiles ? '#e8f4ee' : '#faf8f5',
            borderColor: draggingFiles ? '#a8d5ba' : '#d6cdc3',
            color: '#4a6358',
          }}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              fileInputRef.current?.click()
            }
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDraggingFiles(true)
          }}
          onDragLeave={() => setDraggingFiles(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDraggingFiles(false)
            addFiles(e.dataTransfer.files)
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => addFiles(e.target.files ?? [])}
          />
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: '#e8f4ee', color: '#2d6a4f' }}>
            <UploadCloud className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-semibold" style={{ color: '#1e3a2f' }}>Drop files here or click to browse</p>
          <p className="mt-1 text-xs" style={{ color: '#8a9e96' }}>Add PDF drawings, schedules, specs, or project reference documents.</p>
        </div>

        {selectedFiles.length > 0 && (
          <div className="mt-3 space-y-2">
            {selectedFiles.map((file, index) => (
              <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ background: '#ffffff', borderColor: '#e2d9cf' }}>
                <FileText className="h-4 w-4 shrink-0" style={{ color: '#4a6358' }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" style={{ color: '#1e3a2f' }}>{file.name}</p>
                  <p className="text-xs" style={{ color: '#8a9e96' }}>{Math.max(1, Math.round(file.size / 1024)).toLocaleString()} KB</p>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[#ede8e2]"
                  style={{ color: '#4a6358' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    removeFile(index)
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        {uploadError && (
          <div className="mt-3 rounded-md border px-3 py-2" style={{ borderColor: '#f5c6c6', background: '#fdeaea' }}>
            <p className="text-sm" style={{ color: '#c0392b' }}>{uploadError}</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t pt-4" style={{ borderColor: '#e2d9cf' }}>
        <Link href="/contractor/projects" className="text-sm" style={{ color: '#8a9e96' }}>
          ← Cancel
        </Link>
        <button
          type="submit"
          disabled={pending || uploadingProjectFiles}
          className="rounded-md px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: '#1e3a2f' }}
        >
          {uploadingProjectFiles ? 'Uploading files...' : pending ? 'Creating…' : 'Create Project'}
        </button>
      </div>
    </form>
  )
}
