import { NextRequest, NextResponse } from 'next/server'
import {
  importLineItems,
  isProbablyText,
  type ImportWarning,
} from '@/lib/ai/line-item-import'
import { loadPdfJs } from '@/lib/pdf/runtime'
import type { RequestType } from '@/lib/types/procurement'

const MAX_IMPORT_BYTES = 512 * 1024
const MAX_PDF_BYTES = 4 * 1024 * 1024
const MAX_EXCEL_BYTES = 4 * 1024 * 1024

function isExcelFile(file: File) {
  const name = file.name.toLowerCase()
  return (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel'
  )
}

function isPdfFile(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

async function extractPdfText(buffer: Buffer) {
  const pdfjs = await loadPdfJs()
  const options = {
    data: new Uint8Array(buffer),
    isEvalSupported: false,
  } satisfies Parameters<typeof pdfjs.getDocument>[0]
  const document = await pdfjs.getDocument(options).promise
  const pageTexts: string[] = []
  for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 40); pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    const rows = new Map<number, string[]>()
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const transform = 'transform' in item && Array.isArray(item.transform) ? item.transform : []
      const y = typeof transform[5] === 'number' ? Math.round(transform[5]) : 0
      rows.set(y, [...(rows.get(y) ?? []), item.str])
    }
    pageTexts.push(
      [...rows.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, parts]) => parts.join(' ').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n'),
    )
  }
  return pageTexts.filter(Boolean).join('\n')
}

const SPREADSHEET_UNIT_PATTERN = /^(?:ea|each|pcs?|pieces?|sf|sq\.?\s*ft|sqft|ft2|sy|sq\.?\s*yd|sqyd|yd2|lf|lft|lin\.?\s*ft|linear\s*ft|ft|cy|cu\.?\s*yd|cubic\s*yd|yd3|tons?|tn|tonnes?|bf|sheets?|lbs?|lb|pounds?)$/i

function spreadsheetNumber(value: string) {
  const match = value.match(/-?\$?\s*[0-9][0-9,\s]*(?:\.[0-9]+)?/)
  if (!match) return undefined
  const parsed = Number.parseFloat(match[0].replace(/[$,\s]/g, ''))
  return Number.isFinite(parsed) ? parsed : undefined
}

function scoreWorksheetRows(rows: string[][]) {
  let materialRowScore = 0
  let headerScore = 0
  for (const row of rows.slice(0, 80)) {
    const cells = row.map((cell) => cell.trim()).filter(Boolean)
    if (cells.length === 0) continue
    const hasText = cells.some((cell) => /[A-Za-z]/.test(cell) && cell.length > 3 && !SPREADSHEET_UNIT_PATTERN.test(cell))
    const hasCombinedQuantityUnit = cells.some((cell) => /[0-9]/.test(cell) && /\b(?:ea|each|sf|sy|sq\.?\s*yd|lf|cy|tons?|tn|bf|sheets?|lbs?)\b/i.test(cell))
    const hasAdjacentQuantityUnit = row.some((cell, index) => (
      spreadsheetNumber(cell) !== undefined &&
      (SPREADSHEET_UNIT_PATTERN.test(row[index + 1]?.trim() ?? '') || SPREADSHEET_UNIT_PATTERN.test(row[index - 1]?.trim() ?? ''))
    ))
    if (hasText && (hasCombinedQuantityUnit || hasAdjacentQuantityUnit)) materialRowScore += 3
    const normalized = cells.join(' ').toLowerCase()
    if (/\b(?:sku|item|description|material|qty|quantity|takeoff|unit|uom)\b/.test(normalized)) headerScore += 1
  }
  return materialRowScore + headerScore + Math.min(rows.length, 20) / 20
}

async function extractExcelText(buffer: Buffer) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  const warnings: ImportWarning[] = []
  let selectedSheetName = ''
  let selectedRows: string[][] = []
  let selectedScore = -1

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false,
      blankrows: false,
      defval: '',
    })
      .map((row) => row.map((cell) => String(cell ?? '').trim()))
      .filter((row) => row.some(Boolean))

    if (rows.length >= 2) {
      const score = scoreWorksheetRows(rows)
      if (score > selectedScore) {
        selectedScore = score
        selectedSheetName = sheetName
        selectedRows = rows
      }
    }
  }

  if (selectedRows.length === 0) {
    throw new Error('No usable worksheet rows were found in this Excel file.')
  }

  const ignoredSheets = workbook.SheetNames.filter((sheetName) => sheetName !== selectedSheetName)
  if (ignoredSheets.length > 0) {
    const preview = ignoredSheets.slice(0, 3).map((sheetName) => `"${sheetName}"`).join(', ')
    warnings.push({
      message: `Imported worksheet "${selectedSheetName}" and ignored ${ignoredSheets.length} other sheet${ignoredSheets.length === 1 ? '' : 's'}${preview ? ` (${preview})` : ''}.`,
    })
  }

  return {
    text: selectedRows.map((row) => row.join('\t')).join('\n'),
    warnings,
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Upload a text-like takeoff file.' }, { status: 400 })
    }
    if (file.size <= 0) {
      return NextResponse.json({ error: 'Import file is empty.' }, { status: 400 })
    }
    const buffer = Buffer.from(await file.arrayBuffer())
    const isPdf = isPdfFile(file)
    const isExcel = isExcelFile(file)
    if (isPdf && file.size > MAX_PDF_BYTES) {
      return NextResponse.json({ error: 'PDF import file is too large. Use a file under 4 MB.' }, { status: 400 })
    }
    if (isExcel && file.size > MAX_EXCEL_BYTES) {
      return NextResponse.json({ error: 'Excel import file is too large. Use a file under 4 MB.' }, { status: 400 })
    }
    if (!isPdf && file.size > MAX_IMPORT_BYTES) {
      if (!isExcel) {
        return NextResponse.json({ error: 'Import file is too large. Use a file under 512 KB.' }, { status: 400 })
      }
    }

    let text = ''
    let sourceKind: 'text' | 'pdf' | 'spreadsheet' = 'text'
    let extractionWarnings: ImportWarning[] = []
    if (isPdf) {
      sourceKind = 'pdf'
      text = await extractPdfText(buffer)
      if (!text.trim()) {
        return NextResponse.json({ error: 'No selectable text was found in this PDF.' }, { status: 400 })
      }
    } else if (isExcel) {
      sourceKind = 'spreadsheet'
      const extracted = await extractExcelText(buffer)
      text = extracted.text
      extractionWarnings = extracted.warnings
    } else {
      if (!isProbablyText(buffer)) {
        return NextResponse.json({ error: 'Only CSV, TSV, TXT, PDF, Excel, or other text-like files are supported for this import.' }, { status: 400 })
      }
      text = buffer.toString('utf8')
    }

    const result = await importLineItems({
      text,
      filename: file.name,
      requestType: (formData.get('requestType') as RequestType | null) ?? 'rfq',
      category: String(formData.get('category') ?? ''),
      projectName: String(formData.get('projectName') ?? ''),
      sourceKind,
      extractionWarnings,
    })

    return NextResponse.json({ items: result.items, metadata: result.metadata })
  } catch (error) {
    console.error('Line item import failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import line items.' },
      { status: 500 },
    )
  }
}
