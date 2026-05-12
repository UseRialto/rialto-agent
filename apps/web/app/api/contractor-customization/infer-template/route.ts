import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import {
  BUILT_IN_LINE_ITEM_FIELD_BANK,
  defaultContractorCustomization,
  makeFieldDefinition,
  mergeFieldDefinitions,
  isCoreLineItemFieldLike,
  normalizeFieldKey,
  sanitizeLineItemFields,
  type CustomLineItemFieldDefinition,
} from '@/lib/contractor-customization'
import { loadPdfJs } from '@/lib/pdf/runtime'

const MAX_FILE_BYTES = 4 * 1024 * 1024
const DEFAULT_MODEL = 'gemini-2.5-flash'

function isExcelFile(file: File) {
  const name = file.name.toLowerCase()
  return name.endsWith('.xlsx') || name.endsWith('.xls') || file.type.includes('spreadsheet') || file.type.includes('excel')
}

function isPdfFile(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

function normalizeHeader(value: string) {
  return value.replace(/[_/-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function titleCaseHeaderLabel(value: string) {
  const acronyms = new Set(['sku', 'rfq', 'uom', 'hvac', 'mep', 'astm', 'ul', 'psi', 'pdf', 'csv', 'bom'])
  return normalizeHeader(value)
    .split(' ')
    .map((word) => {
      const lower = word.toLowerCase()
      if (acronyms.has(lower)) return lower.toUpperCase()
      if (/^[A-Z0-9]+$/.test(word) && /[A-Z]/.test(word)) return word
      return lower.replace(/[a-z]/, (letter) => letter.toUpperCase())
    })
    .join(' ')
}

function parseDelimited(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) return []
  const delimiter = ['\t', ',', ';', '|']
    .map((candidate) => ({ candidate, count: lines.slice(0, 8).reduce((sum, line) => sum + line.split(candidate).length, 0) }))
    .sort((a, b) => b.count - a.count)[0]?.candidate ?? ','
  return lines.map((line) => line.split(delimiter).map((cell) => normalizeHeader(cell.replace(/^"|"$/g, ''))))
}

async function extractExcelRows(buffer: Buffer) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, blankrows: false, defval: '' })
      .map((row) => row.map((cell) => normalizeHeader(String(cell ?? ''))))
      .filter((row) => row.some(Boolean))
    if (rows.length) return rows
  }
  return []
}

async function extractPdfText(buffer: Buffer) {
  const pdfjs = await loadPdfJs()
  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise
  const pageTexts: string[] = []
  for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 20); pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    pageTexts.push(content.items.flatMap((item) => ('str' in item ? item.str : '')).join(' '))
  }
  return pageTexts.join('\n')
}

function scoreHeaderRow(row: string[]) {
  const text = row.join(' ').toLowerCase()
  const hits = ['description', 'qty', 'quantity', 'unit', 'size', 'finish', 'grade', 'spec', 'manufacturer', 'model', 'location']
    .filter((token) => text.includes(token)).length
  return hits + Math.min(row.filter(Boolean).length, 12) / 20
}

function findHeaderRow(rows: string[][]) {
  return rows.slice(0, 10).sort((a, b) => scoreHeaderRow(b) - scoreHeaderRow(a))[0] ?? []
}

function mapHeaderToField(header: string, order: number): CustomLineItemFieldDefinition | null {
  const normalized = normalizeHeader(header)
  if (!normalized || /^(#|no\.?)$/i.test(normalized) || isCoreLineItemFieldLike(normalized)) return null
  const key = normalizeFieldKey(normalized)
  const bank = BUILT_IN_LINE_ITEM_FIELD_BANK.find((entry) => {
    const entryKey = normalizeFieldKey(entry.key)
    const entryLabel = normalizeFieldKey(entry.label)
    return key === entryKey || key.includes(entryKey) || key.includes(entryLabel) || entryLabel.includes(key)
  })
  return makeFieldDefinition(bank?.label ?? titleCaseHeaderLabel(normalized), order, 'spreadsheet', {
    key: bank?.key ?? key,
    group: bank?.group ?? 'From uploaded example',
  })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'contractor') {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const trade = String(formData.get('trade') ?? '').trim()
    const preferUploadedColumns = String(formData.get('preferUploadedColumns') ?? '') === 'true'
    const file = formData.get('file')
    if (!(file instanceof File)) {
      const customization = defaultContractorCustomization(trade, trade ? 'trade' : 'default')
      return NextResponse.json({ customization, warnings: ['No example file uploaded; using trade defaults.'] })
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'Use an example file under 4 MB.' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    let rows: string[][] = []
    if (isExcelFile(file)) {
      rows = await extractExcelRows(buffer)
    } else if (isPdfFile(file)) {
      rows = parseDelimited(await extractPdfText(buffer))
    } else {
      rows = parseDelimited(buffer.toString('utf8'))
    }

    const headerRow = findHeaderRow(rows)
    const deterministicFields = headerRow
      .map((header, index) => mapHeaderToField(header, index))
      .filter((field): field is CustomLineItemFieldDefinition => Boolean(field))
    const inferredFields: CustomLineItemFieldDefinition[] = deterministicFields

    const base = defaultContractorCustomization(trade, 'spreadsheet')
    const lineItemFields = preferUploadedColumns
      ? inferredFields
      : inferredFields.length
        ? mergeFieldDefinitions(base.lineItemFields, inferredFields)
        : base.lineItemFields
    const customization = {
      ...base,
      lineItemFields: sanitizeLineItemFields(lineItemFields),
      inferenceSource: inferredFields.length ? (inferredFields.some((field) => field.source === 'ai') ? 'ai' : 'spreadsheet') : base.inferenceSource,
      updatedAt: new Date().toISOString(),
    }

    return NextResponse.json({
      customization,
      detectedHeaders: headerRow,
      warnings: inferredFields.length ? [] : ['No custom headers were detected; using trade defaults.'],
    })
  } catch (error) {
    console.error('Contractor template inference failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to infer field template.' },
      { status: 500 },
    )
  }
}
