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

async function ensurePdfRuntime() {
  pdfRuntimeReady ??= (async () => {
    const canvas = await import('@napi-rs/canvas')
    const globalWithCanvas = globalThis as Record<string, unknown>

    globalWithCanvas.DOMMatrix ??= canvas.DOMMatrix
    globalWithCanvas.DOMPoint ??= canvas.DOMPoint
    globalWithCanvas.DOMRect ??= canvas.DOMRect
    globalWithCanvas.ImageData ??= canvas.ImageData
    globalWithCanvas.Path2D ??= canvas.Path2D
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
