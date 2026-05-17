import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { getProject, saveRFQ, appendBidToRFQ } from '@/lib/store/contractor-store'
import { saveComparisonSheetView } from '@/lib/store/comparison-sheet-view-store'
import { DEFAULT_COMPARISON_SHEET_VIEW } from '@/lib/procurement/comparison-sheet-state'
import { IMPORT_REVIEW_HIGHLIGHT, PRICING_MISTAKE_HIGHLIGHT } from '@/lib/procurement/comparison-analytics'
import { buildImportedQuoteComparison, type QuoteComparisonImportUpload } from '@/lib/modules/quote-comparison/imported-quote-comparison'
import { loadUploadedExternalQuoteFile, type UploadedExternalQuoteFileReference } from '@/lib/procurement/external-quote-upload-source'

export const runtime = 'nodejs'

const MAX_IMPORT_BYTES = 100 * 1024 * 1024
const MAX_IMPORT_FILES = 12
const MAX_TOTAL_IMPORT_BYTES = 500 * 1024 * 1024

function parseUploadedFileReferences(raw: FormDataEntryValue | null): UploadedExternalQuoteFileReference[] {
  if (typeof raw !== 'string' || !raw.trim()) return []
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const record = entry as Record<string, unknown>
    const url = typeof record.url === 'string' ? record.url : ''
    if (!url) return []
    return [{
      url,
      filename: typeof record.filename === 'string' ? record.filename : undefined,
      mimeType: typeof record.mimeType === 'string' ? record.mimeType : undefined,
      sizeBytes: typeof record.sizeBytes === 'number' ? record.sizeBytes : undefined,
    }]
  })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'contractor') {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const projectId = String(formData.get('projectId') ?? '')
    const rfqName = String(formData.get('rfqName') ?? '').trim()
    const files = formData.getAll('files').filter((value): value is File => value instanceof File)
    const legacyFile = formData.get('file')
    if (legacyFile instanceof File) files.push(legacyFile)
    const uploadedFileReferences = parseUploadedFileReferences(formData.get('uploadedFiles'))
    const allFiles = files

    if (!projectId || (allFiles.length === 0 && uploadedFileReferences.length === 0)) {
      return NextResponse.json({ error: 'Upload a PDF, CSV, or Excel quote file for a project.' }, { status: 400 })
    }
    if (allFiles.length + uploadedFileReferences.length > MAX_IMPORT_FILES) {
      return NextResponse.json({ error: `Upload ${MAX_IMPORT_FILES} quote files or fewer at a time.` }, { status: 400 })
    }
    const totalBytes = allFiles.reduce((sum, file) => sum + file.size, 0) + uploadedFileReferences.reduce((sum, file) => sum + (file.sizeBytes ?? 0), 0)
    if (totalBytes > MAX_TOTAL_IMPORT_BYTES) {
      return NextResponse.json({ error: 'Import files are too large. Use a combined upload under 500 MB.' }, { status: 400 })
    }
    const emptyFile = allFiles.find((file) => file.size <= 0)
    if (emptyFile) {
      return NextResponse.json({ error: `${emptyFile.name} is empty.` }, { status: 400 })
    }
    const oversizedFile = allFiles.find((file) => file.size > MAX_IMPORT_BYTES)
    if (oversizedFile) {
      return NextResponse.json({ error: `${oversizedFile.name} is too large. Use files under 100 MB.` }, { status: 400 })
    }
    const oversizedUploadedFile = uploadedFileReferences.find((file) => (file.sizeBytes ?? 0) > MAX_IMPORT_BYTES)
    if (oversizedUploadedFile) {
      return NextResponse.json({ error: `${oversizedUploadedFile.filename ?? 'Uploaded file'} is too large. Use files under 100 MB.` }, { status: 400 })
    }

    const project = await getProject(projectId)
    if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 })
    if (project.owner_id !== session.userId && !(project.collaborator_ids ?? []).includes(session.userId)) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
    }

    const uploadFiles: QuoteComparisonImportUpload[] = []
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer())
      uploadFiles.push({
        name: file.name,
        type: file.type,
        buffer,
      })
    }
    for (const reference of uploadedFileReferences) {
      uploadFiles.push({
        ...(await loadUploadedExternalQuoteFile(reference, MAX_IMPORT_BYTES)),
        sourceUrl: reference.url,
      })
    }
    const built = await buildImportedQuoteComparison({
      projectId,
      projectName: project.name,
      title: rfqName,
      files: uploadFiles,
    })
    const { imported, analyticsHighlights } = built

    await saveRFQ(imported.rfq)
    for (const bid of imported.bids) {
      await appendBidToRFQ(imported.rfq.id, bid)
    }
    if (analyticsHighlights.length > 0) {
      const importReviewCount = analyticsHighlights.filter((highlight) => highlight.color.toLowerCase() === IMPORT_REVIEW_HIGHLIGHT).length
      const pricingMistakeCount = analyticsHighlights.filter((highlight) => highlight.color.toLowerCase() === PRICING_MISTAKE_HIGHLIGHT).length
      const highlightSummary = [
        importReviewCount > 0 ? `Flagged ${importReviewCount} importer-normalized price cell${importReviewCount === 1 ? '' : 's'} for review` : '',
        pricingMistakeCount > 0 ? `flagged ${pricingMistakeCount} pricing mistake candidate${pricingMistakeCount === 1 ? '' : 's'}` : '',
      ].filter(Boolean).join(' and ')
      await saveComparisonSheetView(imported.rfq.id, {
        ...DEFAULT_COMPARISON_SHEET_VIEW,
        highlights: analyticsHighlights,
      }, {
        source: 'import',
        actorUserId: session.userId,
        actorName: session.name,
        summary: `${highlightSummary}.`,
      })
    }
    revalidatePath(`/contractor/projects/${projectId}`)
    revalidatePath(`/contractor/projects/${projectId}/rfqs/${imported.rfq.id}`)

    const importMessage = built.diagnostics.usedAgentFallback
      ? 'Converted non-CSV/Excel quote files to verified CSV through the smart import agent.'
      : 'Processed correctly through the normal importer.'

    return NextResponse.json({
      rfqId: imported.rfq.id,
      lineItemCount: imported.rfq.line_items.length,
      vendorName: imported.bid.vendor_name,
      vendorCount: imported.bids.length,
      warnings: built.warnings,
      importDiagnostics: built.diagnostics,
      redirectTo: `/contractor/projects/${projectId}/rfqs/${imported.rfq.id}?importStatus=${built.diagnostics.usedAgentFallback ? 'fallback' : 'normal'}&importMessage=${encodeURIComponent(importMessage)}`,
    })
  } catch (error) {
    console.error('External quote import failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import quote comparison.' },
      { status: 500 },
    )
  }
}
