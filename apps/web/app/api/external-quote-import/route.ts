import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { getProject, saveRFQ, appendBidToRFQ } from '@/lib/store/contractor-store'
import { createExternalQuoteImport, createExternalQuoteImportFromFiles, type ExternalQuoteImportFileInput } from '@/lib/procurement/external-quote-import'
import { extractExternalQuoteImportText, isExcelImportFile, isPdfImportFile } from '@/lib/procurement/external-quote-file-text'

export const runtime = 'nodejs'

const MAX_IMPORT_BYTES = 8 * 1024 * 1024
const MAX_IMPORT_FILES = 12
const MAX_TOTAL_IMPORT_BYTES = 32 * 1024 * 1024

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

    if (!projectId || files.length === 0) {
      return NextResponse.json({ error: 'Upload a PDF or Excel quote file for a project.' }, { status: 400 })
    }
    if (files.length > MAX_IMPORT_FILES) {
      return NextResponse.json({ error: `Upload ${MAX_IMPORT_FILES} quote files or fewer at a time.` }, { status: 400 })
    }
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
    if (totalBytes > MAX_TOTAL_IMPORT_BYTES) {
      return NextResponse.json({ error: 'Import files are too large. Use a combined upload under 32 MB.' }, { status: 400 })
    }
    const emptyFile = files.find((file) => file.size <= 0)
    if (emptyFile) {
      return NextResponse.json({ error: `${emptyFile.name} is empty.` }, { status: 400 })
    }
    const oversizedFile = files.find((file) => file.size > MAX_IMPORT_BYTES)
    if (oversizedFile) {
      return NextResponse.json({ error: `${oversizedFile.name} is too large. Use files under 8 MB.` }, { status: 400 })
    }

    const project = await getProject(projectId)
    if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 })
    if (project.owner_id !== session.userId && !(project.collaborator_ids ?? []).includes(session.userId)) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
    }

    const extractedFiles: ExternalQuoteImportFileInput[] = []
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const isPdf = isPdfImportFile(file)
      const isExcel = isExcelImportFile(file)
      if (!isPdf && !isExcel) {
        return NextResponse.json({ error: 'Only PDF and Excel quote comparison imports are supported.' }, { status: 400 })
      }

      const text = await extractExternalQuoteImportText(file, buffer)
      if (!text.trim()) {
        return NextResponse.json({ error: `No readable text or worksheet rows were found in ${file.name}.` }, { status: 400 })
      }
      extractedFiles.push({
        filename: file.name,
        sourceKind: isPdf ? 'pdf' : 'spreadsheet',
        text,
      })
    }

    const imported = files.length === 1 && !rfqName
      ? createExternalQuoteImport({
          projectId,
          projectName: project.name,
          filename: extractedFiles[0].filename,
          sourceKind: extractedFiles[0].sourceKind,
          text: extractedFiles[0].text,
        })
      : createExternalQuoteImportFromFiles({
          projectId,
          projectName: project.name,
          title: rfqName || project.name,
          files: extractedFiles,
        })

    await saveRFQ(imported.rfq)
    for (const bid of imported.bids) {
      await appendBidToRFQ(imported.rfq.id, bid)
    }
    revalidatePath(`/contractor/projects/${projectId}`)
    revalidatePath(`/contractor/projects/${projectId}/rfqs/${imported.rfq.id}`)

    return NextResponse.json({
      rfqId: imported.rfq.id,
      lineItemCount: imported.rfq.line_items.length,
      vendorName: imported.bid.vendor_name,
      vendorCount: imported.bids.length,
      warnings: imported.warnings,
      redirectTo: `/contractor/projects/${projectId}/rfqs/${imported.rfq.id}`,
    })
  } catch (error) {
    console.error('External quote import failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import quote comparison.' },
      { status: 500 },
    )
  }
}
