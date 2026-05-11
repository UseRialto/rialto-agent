import { NextRequest } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { getBidsForRFQ, getRFQById } from '@/lib/store/contractor-store'

type ExportFormat = 'csv' | 'xlsx' | 'pdf'

function csvSafe(value: string | number | null | undefined) {
  return String(value ?? '').replace(/\r?\n/g, ' ').trim()
}

function safeFilePart(value: string) {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90) || 'quote-comparison'
}

function parseRows(value: FormDataEntryValue | null): (string | number)[][] {
  if (typeof value !== 'string') return []
  const parsed = JSON.parse(value) as unknown
  if (!Array.isArray(parsed)) return []
  return parsed.map((row) => Array.isArray(row) ? row.map((cell) => typeof cell === 'number' ? cell : String(cell ?? '')) : [])
}

function attachment(body: BodyInit, filename: string, contentType: string) {
  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

function rowsFromRFQ(rfq: NonNullable<Awaited<ReturnType<typeof getRFQById>>>, bids: Awaited<ReturnType<typeof getBidsForRFQ>>) {
  const headers = ['Item', 'Description', 'Qty']
  for (const bid of bids) {
    headers.push(`${bid.vendor_name} Unit Price`, `${bid.vendor_name} Total Price`, `${bid.vendor_name} Lead Time`, `${bid.vendor_name} Alt`)
  }
  return [
    headers,
    ...rfq.line_items.map((item) => {
      const row: (string | number)[] = [
        item.sku || item.id,
        item.description,
        `${item.quantity.toLocaleString()} ${item.unit}`,
      ]
      for (const bid of bids) {
        const response = bid.line_item_responses.find((entry) => entry.line_item_id === item.id)
        if (!response || response.availability === 'unavailable') {
          row.push('', '', '', '')
          continue
        }
        row.push(
          `$${Math.round(response.unit_price).toLocaleString()}`,
          `$${Math.round(response.total_price).toLocaleString()}`,
          `${response.lead_time_days}d`,
          response.is_alternate ? 'Alternate' : '',
        )
      }
      return row
    }),
  ]
}

async function createPdf(title: string, rows: (string | number)[][]) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const margin = 36
  const pageW = 792
  const pageH = 612
  let page = pdf.addPage([pageW, pageH])
  let y = pageH - margin

  function newPage() {
    page = pdf.addPage([pageW, pageH])
    y = pageH - margin
  }

  page.drawText(title, { x: margin, y, size: 14, font: bold, color: rgb(0.12, 0.23, 0.18) })
  y -= 26
  const visibleRows = rows.slice(0, 80)
  const visibleCols = Math.min(Math.max(...visibleRows.map((row) => row.length), 1), 8)
  const colW = (pageW - margin * 2) / visibleCols
  for (const [rowIndex, row] of visibleRows.entries()) {
    if (y < margin + 18) newPage()
    const isHeader = rowIndex === 0
    row.slice(0, visibleCols).forEach((cell, colIndex) => {
      const value = String(cell ?? '').replace(/\s+/g, ' ').slice(0, 32)
      page.drawText(value, {
        x: margin + colIndex * colW,
        y,
        size: isHeader ? 8 : 7,
        font: isHeader ? bold : font,
        color: isHeader ? rgb(0.12, 0.23, 0.18) : rgb(0.15, 0.17, 0.16),
      })
    })
    y -= 15
  }
  return pdf.save()
}

async function exportRows(format: ExportFormat, title: string, rows: (string | number)[][]) {
  const base = safeFilePart(title)
  if (format === 'csv') {
    const csv = rows.map((row) => row.map((cell) => `"${csvSafe(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
    return attachment(new TextEncoder().encode(`\uFEFF${csv}`), `${base}.csv`, 'text/csv;charset=utf-8')
  }

  if (format === 'xlsx') {
    const XLSX = await import('xlsx')
    const worksheet = XLSX.utils.aoa_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Quote Comparison')
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    return attachment(new Uint8Array(buffer), `${base}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  }

  const pdf = await createPdf(title, rows)
  return attachment(new Uint8Array(pdf), `${base}.pdf`, 'application/pdf')
}

export async function GET(request: NextRequest) {
  const rfqId = request.nextUrl.searchParams.get('rfqId')
  const format = request.nextUrl.searchParams.get('format') as ExportFormat | null
  if (!rfqId) return new Response('rfqId is required', { status: 400 })
  if (!format || !['csv', 'xlsx', 'pdf'].includes(format)) return new Response('Unsupported export format', { status: 400 })

  const rfq = await getRFQById(rfqId)
  if (!rfq) return new Response('RFQ not found', { status: 404 })
  const bids = await getBidsForRFQ(rfq.id)
  return exportRows(format, rfq.title, rowsFromRFQ(rfq, bids))
}

export async function POST(request: NextRequest) {
  const form = await request.formData()
  const format = form.get('format') as ExportFormat | null
  const title = typeof form.get('title') === 'string' ? String(form.get('title')) : 'Quote Comparison'
  const rows = parseRows(form.get('rows'))
  if (!format || !['csv', 'xlsx', 'pdf'].includes(format)) return new Response('Unsupported export format', { status: 400 })
  if (rows.length === 0) return new Response('No rows to export', { status: 400 })

  return exportRows(format, title, rows)
}
