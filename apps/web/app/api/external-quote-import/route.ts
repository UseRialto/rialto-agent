import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getProject, saveRFQ, appendBidToRFQ } from '@/lib/store/contractor-store'
import { createExternalQuoteImport } from '@/lib/procurement/external-quote-import'
import { loadPdfJs } from '@/lib/pdf/runtime'

export const runtime = 'nodejs'

const MAX_IMPORT_BYTES = 8 * 1024 * 1024

function isPdfFile(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

function isExcelFile(file: File) {
  const name = file.name.toLowerCase()
  return (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel'
  )
}

async function extractPdfText(buffer: Buffer) {
  const pdfjs = await loadPdfJs()
  const document = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
  }).promise
  const pageTexts: string[] = []

  for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 60); pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    const rows = new Map<number, Array<{ x: number; text: string }>>()
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const transform = 'transform' in item && Array.isArray(item.transform) ? item.transform : []
      const y = typeof transform[5] === 'number' ? Math.round(transform[5]) : 0
      const x = typeof transform[4] === 'number' ? Math.round(transform[4]) : 0
      rows.set(y, [...(rows.get(y) ?? []), { x, text: item.str }])
    }
    pageTexts.push(
      [...rows.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, parts]) => parts
          .sort((a, b) => a.x - b.x)
          .map((part) => part.text)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim())
        .filter(Boolean)
        .join('\n'),
    )
  }

  return pageTexts.filter(Boolean).join('\n')
}

async function extractExcelText(buffer: Buffer) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  const sheets = workbook.SheetNames
    .map((sheetName) => {
      const sheet = workbook.Sheets[sheetName]
      if (!sheet) return ''
      return XLSX.utils.sheet_to_json<string[]>(sheet, {
        header: 1,
        raw: false,
        blankrows: false,
        defval: '',
      })
        .map((row) => row.map((cell) => String(cell ?? '').trim()).join('\t'))
        .filter((row) => row.trim())
        .join('\n')
    })
    .filter(Boolean)

  return sheets.join('\n')
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'contractor') {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const projectId = String(formData.get('projectId') ?? '')
    const file = formData.get('file')
    if (!projectId || !(file instanceof File)) {
      return NextResponse.json({ error: 'Upload a PDF or Excel quote file for a project.' }, { status: 400 })
    }
    if (file.size <= 0) {
      return NextResponse.json({ error: 'Import file is empty.' }, { status: 400 })
    }
    if (file.size > MAX_IMPORT_BYTES) {
      return NextResponse.json({ error: 'Import file is too large. Use a file under 8 MB.' }, { status: 400 })
    }

    const project = await getProject(projectId)
    if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 })
    if (project.owner_id !== session.userId && !(project.collaborator_ids ?? []).includes(session.userId)) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const isPdf = isPdfFile(file)
    const isExcel = isExcelFile(file)
    if (!isPdf && !isExcel) {
      return NextResponse.json({ error: 'Only PDF and Excel quote comparison imports are supported.' }, { status: 400 })
    }

    const text = isPdf ? await extractPdfText(buffer) : await extractExcelText(buffer)
    if (!text.trim()) {
      return NextResponse.json({ error: 'No readable text or worksheet rows were found in this file.' }, { status: 400 })
    }

    const imported = createExternalQuoteImport({
      projectId,
      projectName: project.name,
      filename: file.name,
      sourceKind: isPdf ? 'pdf' : 'spreadsheet',
      text,
    })

    await saveRFQ(imported.rfq)
    await appendBidToRFQ(imported.rfq.id, imported.bid)

    return NextResponse.json({
      rfqId: imported.rfq.id,
      lineItemCount: imported.rfq.line_items.length,
      vendorName: imported.bid.vendor_name,
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
