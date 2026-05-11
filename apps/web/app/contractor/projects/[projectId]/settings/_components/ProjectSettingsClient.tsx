'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateProjectAction, deleteProjectAction, registerProjectSpecDocumentAction } from '@/lib/actions/contractor'
import { uploadProjectSpecPdf } from '@/lib/files/blob-client-upload'
import type { ContractorProject } from '@/lib/types/contractor'
import { ProjectSpecIndexKickoff } from '../../_components/ProjectSpecIndexKickoff'

export function ProjectSettingsClient({ project }: { project: ContractorProject }) {
  const router = useRouter()
  const [name, setName] = useState(project.name)
  const [location, setLocation] = useState(project.location)
  const [description, setDescription] = useState(project.description ?? '')
  const [budget, setBudget] = useState(project.budget?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [uploadingSpec, setUploadingSpec] = useState(false)
  const [specError, setSpecError] = useState('')

  async function handleSpecUpload(file: File | null) {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setSpecError('Upload a PDF spec manual.')
      return
    }
    setUploadingSpec(true)
    setSpecError('')
    try {
      const uploaded = await uploadProjectSpecPdf(file, `project-specs/${project.id}`)
      const result = await registerProjectSpecDocumentAction(project.id, {
        filename: uploaded.filename,
        fileUrl: uploaded.url,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
      })
      if (!result.success) {
        setSpecError(result.error ?? 'Spec document upload failed.')
      }
      router.refresh()
    } catch (error) {
      setSpecError(error instanceof Error ? error.message : 'Failed to upload spec manual.')
    } finally {
      setUploadingSpec(false)
    }
  }

  async function handleSave() {
    if (!name.trim() || !location.trim()) {
      setSaveError('Name and location are required.')
      return
    }
    setSaving(true)
    setSaveError('')
    setSaveSuccess(false)
    try {
      const result = await updateProjectAction(project.id, { name, location, description, budget })
      if (!result.success) {
        setSaveError(result.error ?? 'Failed to save changes.')
      } else {
        setSaveSuccess(true)
        router.refresh()
      }
    } catch {
      setSaveError('Failed to save changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteProjectAction(project.id)
      // deleteProjectAction redirects on success
    } catch (e: unknown) {
      // Server action redirect throws - check if it's a real error
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('NEXT_REDIRECT')) {
        setDeleteError(msg || 'Failed to delete project.')
        setDeleting(false)
      }
    }
  }

  return (
    <div className="space-y-6">
      <ProjectSpecIndexKickoff projectId={project.id} documents={project.spec_documents ?? []} />
      {/* Edit form */}
      <div className="rounded-lg border bg-white p-6 shadow-sm" style={{ borderColor: '#e2d9cf' }}>
        <h2 className="mb-4 text-sm font-semibold" style={{ color: '#4a6358' }}>Project Details</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Project Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setSaveSuccess(false) }}
              className="w-full rounded-md border bg-white px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none"
              style={{ borderColor: '#e2d9cf', color: '#1e3a2f' }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => { setLocation(e.target.value); setSaveSuccess(false) }}
              className="w-full rounded-md border bg-white px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none"
              style={{ borderColor: '#e2d9cf', color: '#1e3a2f' }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>
              Description <span className="font-normal" style={{ color: '#8a9e96' }}>(optional)</span>
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => { setDescription(e.target.value); setSaveSuccess(false) }}
              className="w-full rounded-md border bg-white px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none resize-none"
              style={{ borderColor: '#e2d9cf', color: '#1e3a2f' }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>
              Budget <span className="font-normal" style={{ color: '#8a9e96' }}>(optional)</span>
            </label>
            <input
              type="number"
              placeholder="e.g. 5000000"
              value={budget}
              onChange={(e) => { setBudget(e.target.value); setSaveSuccess(false) }}
              className="w-full rounded-md border bg-white px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none"
              style={{ borderColor: '#e2d9cf', color: '#1e3a2f' }}
            />
          </div>
        </div>

        {saveError && (
          <div className="mt-4 rounded-md border px-3 py-2" style={{ borderColor: '#f5c6c6', background: '#fdeaea' }}>
            <p className="text-sm" style={{ color: '#c0392b' }}>{saveError}</p>
          </div>
        )}
        {saveSuccess && (
          <div className="mt-4 rounded-md border px-3 py-2" style={{ borderColor: '#a8d5ba', background: '#e8f4ee' }}>
            <p className="text-sm" style={{ color: '#2d6a4f' }}>Changes saved.</p>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-md px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
            style={{ background: '#1e3a2f' }}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-6 shadow-sm" style={{ borderColor: '#e2d9cf' }}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: '#4a6358' }}>Project Specification Manuals</h2>
            <p className="mt-1 text-sm" style={{ color: '#8a9e96' }}>
              Upload project manuals or addenda once. Rialto checks future vendor quotes against indexed spec pages.
            </p>
          </div>
          <label
            className={`inline-flex cursor-pointer items-center justify-center rounded-md px-4 py-2 text-sm font-semibold text-white ${uploadingSpec ? 'pointer-events-none opacity-60' : ''}`}
            style={{ background: '#1e3a2f' }}
          >
            {uploadingSpec ? 'Uploading...' : 'Upload PDF'}
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              disabled={uploadingSpec}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null
                event.target.value = ''
                void handleSpecUpload(file)
              }}
            />
          </label>
        </div>

        {specError && (
          <div className="mt-4 rounded-md border px-3 py-2" style={{ borderColor: '#f5c6c6', background: '#fdeaea' }}>
            <p className="text-sm" style={{ color: '#c0392b' }}>{specError}</p>
          </div>
        )}

        <div className="mt-4 space-y-2">
          {(project.spec_documents ?? []).length === 0 ? (
            <div className="rounded-md border border-dashed px-4 py-5 text-center" style={{ borderColor: '#e2d9cf', color: '#8a9e96' }}>
              <p className="text-sm">No project spec manuals uploaded yet.</p>
            </div>
          ) : (
            project.spec_documents?.map((document) => (
              <div key={document.id} className="flex flex-col gap-2 rounded-md border px-3 py-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: '#e2d9cf' }}>
                <div>
                  <a href={document.file_url} target="_blank" rel="noreferrer" className="text-sm font-semibold hover:underline" style={{ color: '#1e3a2f' }}>
                    {document.filename}
                  </a>
                  <p className="mt-0.5 text-xs" style={{ color: '#8a9e96' }}>
                    {document.page_count ? `${document.page_count.toLocaleString()} pages · ` : ''}
                    Uploaded {new Date(document.created_at).toLocaleDateString()}
                  </p>
                  {document.extraction_error && (
                    <p className="mt-1 text-xs" style={{ color: '#c0392b' }}>{document.extraction_error}</p>
                  )}
                </div>
                <span
                  className="w-fit rounded-full px-2.5 py-1 text-xs font-semibold capitalize"
                  style={{
                    background: document.status === 'indexed' ? '#e8f4ee' : document.status === 'failed' ? '#fdeaea' : '#fdf0e8',
                    color: document.status === 'indexed' ? '#2d6a4f' : document.status === 'failed' ? '#c0392b' : '#a85c2a',
                  }}
                >
                  {document.status === 'indexed'
                    ? 'indexed'
                    : document.status === 'failed'
                      ? 'failed'
                      : document.status === 'processing'
                        ? 'indexing'
                        : 'queued'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Danger zone */}
      <div className="rounded-lg border bg-white p-6 shadow-sm" style={{ borderColor: '#f5c6c6' }}>
        <h2 className="mb-2 text-sm font-semibold" style={{ color: '#c0392b' }}>Danger Zone</h2>
        <p className="mb-4 text-sm" style={{ color: '#8a9e96' }}>
          Deleting this project will remove all draft and active RFQs. This cannot be undone.
        </p>

        {deleteError && (
          <div className="mb-4 rounded-md border px-3 py-2" style={{ borderColor: '#f5c6c6', background: '#fdeaea' }}>
            <p className="text-sm" style={{ color: '#c0392b' }}>{deleteError}</p>
          </div>
        )}

        {!showDeleteConfirm ? (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="rounded-md border bg-white px-4 py-2 text-sm font-medium transition-colors"
            style={{ borderColor: '#f5c6c6', color: '#c0392b' }}
          >
            Delete Project
          </button>
        ) : (
          <div className="rounded-md border p-4" style={{ borderColor: '#f5c6c6', background: '#fdeaea' }}>
            <p className="mb-3 text-sm font-medium" style={{ color: '#c0392b' }}>
              Are you sure? This will permanently delete &ldquo;{project.name}&rdquo; and its quote request history.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
                style={{ background: '#c0392b' }}
              >
                {deleting ? 'Deleting…' : 'Yes, Delete Project'}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-md border bg-white px-4 py-2 text-sm font-medium transition-colors"
                style={{ borderColor: '#e2d9cf', color: '#4a6358' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
