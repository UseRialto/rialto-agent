import ExcelJS from 'exceljs'
import { ingestWorkbookFromSheets, type WorkbookCellValue, type WorkbookModel } from '../tools/workbook-agent.js'

export interface UploadedWorkbookAttachment {
  id: string
  filename: string
  sourceKind: 'excel'
  workbookId: string
  workbook: WorkbookModel
  summary: {
    workbookId: string
    sheetCount: number
    sheets: Array<{ name: string; rowCount: number; columnCount: number }>
  }
}

const uploadedWorkbooks = new Map<string, UploadedWorkbookAttachment>()

export async function registerUploadedWorkbook(input: {
  filename: string
  buffer: Buffer
  attachmentId?: string
  now?: string
}): Promise<UploadedWorkbookAttachment> {
  const attachmentId = input.attachmentId ?? `att-${crypto.randomUUID()}`
  const workbookId = `wb-${crypto.randomUUID()}`
  const excel = new ExcelJS.Workbook()
  await excel.xlsx.load(input.buffer as never)
  const workbook = ingestWorkbookFromSheets({
    id: workbookId,
    sheets: excel.worksheets.map((sheet) => ({ name: sheet.name, rows: rowsFromWorksheet(sheet) })),
    now: input.now,
  })
  const uploaded = {
    id: attachmentId,
    filename: input.filename,
    sourceKind: 'excel' as const,
    workbookId,
    workbook,
    summary: {
      workbookId,
      sheetCount: workbook.sheets.length,
      sheets: workbook.sheets.map((sheet) => ({
        name: sheet.name,
        rowCount: sheet.rows.length,
        columnCount: Math.max(0, ...sheet.rows.map((row) => row.length)),
      })),
    },
  }
  uploadedWorkbooks.set(workbookId, uploaded)
  return uploaded
}

export function getUploadedWorkbook(workbookId: string): UploadedWorkbookAttachment | undefined {
  return uploadedWorkbooks.get(workbookId)
}

export function clearUploadedWorkbooksForTests() {
  uploadedWorkbooks.clear()
}

function rowsFromWorksheet(sheet: ExcelJS.Worksheet): WorkbookCellValue[][] {
  const rows: WorkbookCellValue[][] = []
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    const values: WorkbookCellValue[] = []
    for (let columnNumber = 1; columnNumber <= sheet.actualColumnCount; columnNumber += 1) {
      values.push(normalizeCellValue(row.getCell(columnNumber).value))
    }
    rows.push(values)
  }
  return rows
}

function normalizeCellValue(value: ExcelJS.CellValue | undefined): WorkbookCellValue {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'object' && 'result' in value) return normalizeCellValue(value.result as ExcelJS.CellValue)
  if (typeof value === 'object' && 'text' in value) return String(value.text)
  if (typeof value === 'object' && 'richText' in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text).join('')
  }
  return String(value)
}
