import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { canAccessContractorProject } from '@/lib/auth/project-access'
import { appendBidToRFQ, appendRFQLineItemsAndInvites, getBidsForRFQ, getProject, getRFQ, updateRFQAttachmentUrls } from '@/lib/store/contractor-store'
import { mergeExternalQuoteImportIntoRFQ } from '@/lib/procurement/external-quote-import'
import { buildImportedQuoteComparison, type QuoteComparisonImportUpload } from '@/lib/modules/quote-comparison/imported-quote-comparison'
import { loadUploadedExternalQuoteFile, type UploadedExternalQuoteFileReference } from '@/lib/procurement/external-quote-upload-source'
import { suggestExternalQuoteSemanticMatches } from '@/lib/procurement/external-quote-semantic-match'
import { buildQuoteImportReviewHighlights } from '@/lib/procurement/comparison-analytics'
import { getComparisonSheetViewRecord, saveComparisonSheetView } from '@/lib/store/comparison-sheet-view-store'

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ rfqId: string }> },
) {
  const session = await getSession()
  if (!session || session.role !== 'contractor') {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  try {
    const { rfqId } = await params
    const formData = await request.formData()
    const files = formData.getAll('files').filter((value): value is File => value instanceof File)
    const legacyFile = formData.get('file')
    if (legacyFile instanceof File) files.push(legacyFile)
    const uploadedFileReferences = parseUploadedFileReferences(formData.get('uploadedFiles'))

    if (files.length === 0 && uploadedFileReferences.length === 0) {
      return NextResponse.json({ error: 'Upload at least one quote file.' }, { status: 400 })
    }
    if (files.length + uploadedFileReferences.length > MAX_IMPORT_FILES) {
      return NextResponse.json({ error: `Upload ${MAX_IMPORT_FILES} quote files or fewer at a time.` }, { status: 400 })
    }
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0) + uploadedFileReferences.reduce((sum, file) => sum + (file.sizeBytes ?? 0), 0)
    if (totalBytes > MAX_TOTAL_IMPORT_BYTES) {
      return NextResponse.json({ error: 'Import files are too large. Use a combined upload under 500 MB.' }, { status: 400 })
    }
    const emptyFile = files.find((file) => file.size <= 0)
    if (emptyFile) {
      return NextResponse.json({ error: `${emptyFile.name} is empty.` }, { status: 400 })
    }
    const oversizedFile = files.find((file) => file.size > MAX_IMPORT_BYTES)
    if (oversizedFile) {
      return NextResponse.json({ error: `${oversizedFile.name} is too large. Use files under 100 MB.` }, { status: 400 })
    }
    const oversizedUploadedFile = uploadedFileReferences.find((file) => (file.sizeBytes ?? 0) > MAX_IMPORT_BYTES)
    if (oversizedUploadedFile) {
      return NextResponse.json({ error: `${oversizedUploadedFile.filename ?? 'Uploaded file'} is too large. Use files under 100 MB.` }, { status: 400 })
    }

    const rfq = await getRFQ(rfqId)
    if (!rfq) return NextResponse.json({ error: 'Quote comparison not found.' }, { status: 404 })
    const project = await getProject(rfq.project_id)
    if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 })
    if (!canAccessContractorProject(session, project)) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
    }

    const uploadFiles: QuoteComparisonImportUpload[] = []
    for (const file of files) {
      uploadFiles.push({
        name: file.name,
        type: file.type,
        buffer: Buffer.from(await file.arrayBuffer()),
      })
    }
    for (const reference of uploadedFileReferences) {
      uploadFiles.push({
        ...(await loadUploadedExternalQuoteFile(reference, MAX_IMPORT_BYTES)),
        sourceUrl: reference.url,
      })
    }

    const built = await buildImportedQuoteComparison({
      projectId: rfq.project_id,
      projectName: project.name,
      title: rfq.title,
      files: uploadFiles,
    })
    const existingBids = await getBidsForRFQ(rfq.id)
    const semanticMatches = await suggestExternalQuoteSemanticMatches({
      importedLineItems: built.imported.rfq.line_items,
      targetLineItems: rfq.line_items,
    }).catch((error) => {
      console.error('Semantic quote matching failed:', error)
      return []
    })
    const merged = mergeExternalQuoteImportIntoRFQ({
      targetRfq: rfq,
      existingBids,
      imported: built.imported,
      semanticMatches,
    })

    await appendRFQLineItemsAndInvites(rfq.id, addedLineItemsWithoutExisting(merged.addedLineItems, rfq.line_items), [])
    await updateRFQAttachmentUrls(rfq.id, merged.rfq.attachment_urls ?? [])
    for (const bid of merged.bids) {
      await appendBidToRFQ(rfq.id, bid)
    }
    const importReviewHighlights = buildQuoteImportReviewHighlights(merged.rfq, merged.bids)
    if (importReviewHighlights.length > 0) {
      const viewRecord = await getComparisonSheetViewRecord(rfq.id)
      const highlightsById = new Map([
        ...viewRecord.view.highlights,
        ...importReviewHighlights,
      ].map((highlight) => [highlight.id, highlight]))
      await saveComparisonSheetView(rfq.id, {
        ...viewRecord.view,
        highlights: [...highlightsById.values()],
      }, {
        source: 'import',
        actorUserId: session.userId,
        actorName: session.name,
        summary: `Flagged ${importReviewHighlights.length} importer-normalized price cell${importReviewHighlights.length === 1 ? '' : 's'} for review.`,
      })
    }

    revalidatePath(`/contractor/projects/${rfq.project_id}`)
    revalidatePath(`/contractor/projects/${rfq.project_id}/rfqs/${rfq.id}`)

    const importMessage = built.diagnostics.usedAgentFallback
      ? 'Converted non-CSV/Excel quote files to verified CSV through the smart import agent.'
      : `Added ${merged.bids.length} quote import${merged.bids.length === 1 ? '' : 's'} through the normal importer.`

    return NextResponse.json({
      rfqId: rfq.id,
      lineItemCount: merged.rfq.line_items.length,
      addedLineItemCount: merged.addedLineItems.length,
      vendorCount: existingBids.length + merged.bids.length,
      addedVendorCount: merged.bids.length,
      warnings: uniqueWarnings([...merged.warnings, ...built.warnings]),
      importDiagnostics: built.diagnostics,
      redirectTo: `/contractor/projects/${rfq.project_id}/rfqs/${rfq.id}?importStatus=${built.diagnostics.usedAgentFallback ? 'fallback' : 'normal'}&importMessage=${encodeURIComponent(importMessage)}`,
    })
  } catch (error) {
    console.error('External quote append failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add quote import.' },
      { status: 500 },
    )
  }
}

function addedLineItemsWithoutExisting<T extends { id: string }>(added: T[], existing: T[]) {
  const existingIds = new Set(existing.map((line) => line.id))
  return added.filter((line) => !existingIds.has(line.id))
}

function uniqueWarnings(warnings: Array<{ message: string; row?: number }>) {
  const seen = new Set<string>()
  return warnings.filter((warning) => {
    const key = `${warning.row ?? ''}:${warning.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
