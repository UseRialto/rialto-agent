import mammoth from 'mammoth'
import ExcelJS from 'exceljs'
import { z } from 'zod'
import type { ToolDefinition } from '../domain/types.js'

export const documentReadInputSchema = z.object({
  filename: z.string(),
  mimeType: z.string().optional(),
  bytesBase64: z.string(),
})

export type DocumentReadInput = z.infer<typeof documentReadInputSchema>

export interface DocumentReadOutput {
  action: 'document-extracted'
  filename: string
  sourceKind: 'pdf' | 'excel' | 'csv' | 'docx' | 'text'
  text: string
  warnings: string[]
}

function sourceKind(filename: string, mimeType?: string): DocumentReadOutput['sourceKind'] {
  const lower = filename.toLowerCase()
  if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf'
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    lower.endsWith('.xlsx')
  ) return 'excel'
  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) return 'csv'
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower.endsWith('.docx')
  ) return 'docx'
  return 'text'
}

async function extractSpreadsheet(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])
  const warnings: string[] = []
  const parts: string[] = []
  workbook.eachSheet((sheet) => {
    const rows: string[] = []
    sheet.eachRow((row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : []
      const text = values
        .map((cell) => {
          if (cell == null) return ''
          if (typeof cell === 'object' && 'text' in cell) return String(cell.text)
          if (typeof cell === 'object' && 'result' in cell) return String(cell.result ?? '')
          return String(cell)
        })
        .map((cell) => cell.trim())
        .join('\t')
        .trim()
      if (text) rows.push(text)
    })
    if (rows.length) parts.push(`Sheet: ${sheet.name}\n${rows.join('\n')}`)
  })
  if (parts.length === 0) warnings.push('No usable worksheet text was found.')
  return { text: parts.join('\n\n'), warnings }
}

let pdfRuntimeReady: Promise<void> | undefined

class PdfDOMMatrix {
  a = 1
  b = 0
  c = 0
  d = 1
  e = 0
  f = 0

  scaleSelf(scaleX = 1, scaleY = scaleX) {
    this.a *= scaleX
    this.d *= scaleY
    return this
  }

  translateSelf(x = 0, y = 0) {
    this.e += x
    this.f += y
    return this
  }

  multiplySelf(other: Partial<PdfDOMMatrix>) {
    const a = this.a * (other.a ?? 1) + this.c * (other.b ?? 0)
    const b = this.b * (other.a ?? 1) + this.d * (other.b ?? 0)
    const c = this.a * (other.c ?? 0) + this.c * (other.d ?? 1)
    const d = this.b * (other.c ?? 0) + this.d * (other.d ?? 1)
    const e = this.a * (other.e ?? 0) + this.c * (other.f ?? 0) + this.e
    const f = this.b * (other.e ?? 0) + this.d * (other.f ?? 0) + this.f
    this.a = a
    this.b = b
    this.c = c
    this.d = d
    this.e = e
    this.f = f
    return this
  }
}

class PdfDOMPoint {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
    public w = 1,
  ) {}
}

class PdfDOMRect {
  constructor(
    public x = 0,
    public y = 0,
    public width = 0,
    public height = 0,
  ) {}
}

class PdfImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

class PdfPath2D {}

async function ensurePdfRuntime() {
  pdfRuntimeReady ??= (async () => {
    const globalWithCanvas = globalThis as Record<string, unknown>

    globalWithCanvas.DOMMatrix ??= PdfDOMMatrix
    globalWithCanvas.DOMPoint ??= PdfDOMPoint
    globalWithCanvas.DOMRect ??= PdfDOMRect
    globalWithCanvas.ImageData ??= PdfImageData
    globalWithCanvas.Path2D ??= PdfPath2D
  })()

  await pdfRuntimeReady
}

async function extractText(input: DocumentReadInput): Promise<Omit<DocumentReadOutput, 'action' | 'filename'>> {
  const kind = sourceKind(input.filename, input.mimeType)
  const buffer = Buffer.from(input.bytesBase64, 'base64')
  if (kind === 'pdf') {
    await ensurePdfRuntime()
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await parser.getText()
      return { sourceKind: kind, text: result.text.trim(), warnings: result.text.trim() ? [] : ['No selectable PDF text was found.'] }
    } finally {
      await parser.destroy()
    }
  }
  if (kind === 'excel') {
    const extracted = await extractSpreadsheet(buffer)
    return { sourceKind: kind, ...extracted }
  }
  if (kind === 'docx') {
    const result = await mammoth.extractRawText({ buffer })
    return {
      sourceKind: kind,
      text: result.value.trim(),
      warnings: result.messages.map((message) => message.message),
    }
  }
  return { sourceKind: kind, text: buffer.toString('utf8').trim(), warnings: [] }
}

export const documentReadTool: ToolDefinition<DocumentReadInput, DocumentReadOutput> = {
  id: 'document.extract_line_items',
  productModule: 'vendor-response-intake',
  surface: 'document-read',
  description: 'Read PDF, XLSX, CSV, DOCX, or text bytes and return extracted text for line-item extraction/review.',
  visibleToUser: true,
  mutatesPersistentData: false,
  requiresUserApproval: true,
  inputSchema: documentReadInputSchema,
  async execute(input) {
    const parsed = documentReadInputSchema.parse(input)
    const extracted = await extractText(parsed)
    return { action: 'document-extracted', filename: parsed.filename, ...extracted }
  },
}
