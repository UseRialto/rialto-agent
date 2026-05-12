import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { findUserById } from '@/lib/auth/users'
import { getRFQById, getProject } from '@/lib/store/contractor-store'
import type { ContractorRFQLineItem } from '@/lib/types/contractor'
import type { CommodityWatch, ProcurementRequirement, RFPDetails, RequestType } from '@/lib/types/procurement'

const MARGIN = 42
const PAGE_W = 612
const PAGE_H = 792
const CONTENT_W = PAGE_W - MARGIN * 2
const FOOTER_H = 28
const LINE_H = 11
const TABLE_HEADER_H = 18
const TABLE_COL = {
  item: MARGIN,
  material: MARGIN + 28,
  qty: MARGIN + 248,
  unit: MARGIN + 298,
  budget: MARGIN + 346,
  details: MARGIN + 425,
}

type RFQPdfData = {
  rfqId: string
  projectId: string
  projectName: string
  projectLocation: string
  contractorName?: string
  requestType: RequestType
  title: string
  status: string
  bidDeadline?: string
  publishedAt?: string
  rfpDetails?: RFPDetails
  attachmentUrls?: string[]
  procurementRequirements?: ProcurementRequirement[]
  commodityWatch?: CommodityWatch[]
  lineItems: ContractorRFQLineItem[]
}

type PdfContext = {
  pdfDoc: PDFDocument
  fontBold: PDFFont
  fontReg: PDFFont
  pages: PDFPage[]
}

function clamp(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return []

  const words = normalized.split(' ')
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word
      continue
    }

    let chunk = ''
    for (const char of word) {
      const next = `${chunk}${char}`
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        chunk = next
      } else {
        if (chunk) lines.push(chunk)
        chunk = char
      }
    }
    current = chunk
  }

  if (current) lines.push(current)
  return lines
}

function makeDrawers(page: PDFPage) {
  function drawText(text: string, x: number, y: number, opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {}) {
    page.drawText(text, {
      x,
      y,
      size: opts.size ?? 10,
      font: opts.font,
      color: opts.color ?? rgb(0, 0, 0),
    })
  }

  function drawLine(x1: number, y1: number, x2: number, y2: number, opts: { color?: ReturnType<typeof rgb>; thickness?: number } = {}) {
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: opts.thickness ?? 0.5,
      color: opts.color ?? rgb(0.78, 0.78, 0.78),
    })
  }

  function drawRect(x: number, y: number, w: number, h: number, opts: { fill?: ReturnType<typeof rgb>; border?: ReturnType<typeof rgb> } = {}) {
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      color: opts.fill ?? rgb(0.97, 0.97, 0.97),
      borderColor: opts.border,
      borderWidth: opts.border ? 0.75 : 0,
    })
  }

  return { drawText, drawLine, drawRect }
}

function createPage(ctx: PdfContext) {
  const page = ctx.pdfDoc.addPage([PAGE_W, PAGE_H])
  ctx.pages.push(page)
  return { page, ...makeDrawers(page) }
}

function drawHeader(
  ctx: PdfContext,
  data: RFQPdfData,
  pageLabel: string,
  showSummary = true,
) {
  const drawers = createPage(ctx)
  const { drawText, drawLine, drawRect } = drawers
  let y = PAGE_H - MARGIN

  drawText(data.contractorName || 'Rialto Contractor', MARGIN, y, {
    font: ctx.fontBold,
    size: 18,
    color: rgb(0.08, 0.12, 0.22),
  })
  y -= 19
  drawText(data.requestType === 'rfp' ? 'REQUEST FOR PROPOSAL' : 'REQUEST FOR QUOTE', MARGIN, y, {
    font: ctx.fontBold,
    size: 14,
    color: rgb(0.18, 0.18, 0.18),
  })
  drawText(pageLabel, PAGE_W - MARGIN - ctx.fontReg.widthOfTextAtSize(pageLabel, 8), y + 2, {
    font: ctx.fontReg,
    size: 8,
    color: rgb(0.42, 0.42, 0.42),
  })
  y -= 8
  drawLine(MARGIN, y, PAGE_W - MARGIN, y, { color: rgb(0.22, 0.22, 0.22), thickness: 1.1 })
  y -= 18

  if (showSummary) {
    drawRect(MARGIN, y - 62, CONTENT_W, 62, {
      fill: rgb(0.97, 0.98, 0.995),
      border: rgb(0.84, 0.88, 0.95),
    })

    const leftRows: [string, string][] = [
      ['Project', data.projectName || data.projectId],
      ['Location', data.projectLocation || '-'],
      [data.requestType === 'rfp' ? 'RFP' : 'RFQ', data.rfqId],
    ]
    const rightRows: [string, string][] = [
      ['Issue Date', data.publishedAt ? new Date(data.publishedAt).toLocaleDateString() : new Date().toLocaleDateString()],
      ['Quote Deadline', data.bidDeadline || 'TBD'],
      ['Status', data.status.toUpperCase()],
    ]

    let rowY = y - 14
    for (const [label, value] of leftRows) {
      drawText(`${label}:`, MARGIN + 12, rowY, { font: ctx.fontBold, size: 8.5, color: rgb(0.32, 0.32, 0.32) })
      drawText(clamp(value, 34), MARGIN + 72, rowY, { font: ctx.fontReg, size: 8.5 })
      rowY -= 16
    }

    rowY = y - 14
    for (const [label, value] of rightRows) {
      drawText(`${label}:`, MARGIN + 302, rowY, { font: ctx.fontBold, size: 8.5, color: rgb(0.32, 0.32, 0.32) })
      drawText(clamp(value, 24), MARGIN + 368, rowY, { font: ctx.fontReg, size: 8.5 })
      rowY -= 16
    }

    y -= 78

    drawText('Scope / Buy Package', MARGIN, y, {
      font: ctx.fontBold,
      size: 10,
      color: rgb(0.22, 0.22, 0.22),
    })
    y -= 14
    for (const line of wrapText(data.title, ctx.fontReg, 9, CONTENT_W)) {
      drawText(line, MARGIN, y, { font: ctx.fontReg, size: 9 })
      y -= 12
    }
    y -= 4
  } else {
    drawText(data.title, MARGIN, y, {
      font: ctx.fontBold,
      size: 10,
      color: rgb(0.22, 0.22, 0.22),
    })
    y -= 18
  }

  return { y, ...drawers }
}

function drawTableHeader(ctx: PdfContext, page: PDFPage, y: number) {
  const { drawRect, drawText } = makeDrawers(page)
  drawRect(MARGIN, y - TABLE_HEADER_H + 4, CONTENT_W, TABLE_HEADER_H, { fill: rgb(0.13, 0.16, 0.22) })
  const headers: [string, number][] = [
    ['#', TABLE_COL.item + 2],
    ['MATERIAL / SKU', TABLE_COL.material + 2],
    ['QTY', TABLE_COL.qty + 2],
    ['UNIT', TABLE_COL.unit + 2],
    ['TARGET', TABLE_COL.budget + 2],
    ['DETAILS', TABLE_COL.details + 2],
  ]

  for (const [label, x] of headers) {
    drawText(label, x, y - 9, {
      font: ctx.fontBold,
      size: 7.5,
      color: rgb(1, 1, 1),
    })
  }
}

function itemDetailLines(item: ContractorRFQLineItem, font: PDFFont) {
  const lines: string[] = []
  const customFields = (item.attributes ?? [])
    .filter((attribute) => attribute.value?.trim())
    .map((attribute) => `${attribute.label}: ${attribute.value}`)
    .join('; ')
  if (customFields) lines.push(...wrapText(`Fields: ${customFields}`, font, 7.2, 136))
  if (item.specs?.trim()) lines.push(...wrapText(`Specs: ${item.specs.trim()}`, font, 7.2, 136))
  if (item.constraints?.trim()) lines.push(...wrapText(`Constraints: ${item.constraints.trim()}`, font, 7.2, 136))
  if (item.certifications?.length) lines.push(...wrapText(`Certs: ${item.certifications.join(', ')}`, font, 7.2, 136))
  if (item.notes?.trim()) lines.push(...wrapText(`Notes: ${item.notes.trim()}`, font, 7.2, 136))
  if (item.suggested_lead_time_days != null) lines.push(...wrapText(`Target lead time: ${item.suggested_lead_time_days} days`, font, 7.2, 136))
  return lines.slice(0, 8)
}

function drawLineItemRow(
  ctx: PdfContext,
  page: PDFPage,
  y: number,
  item: ContractorRFQLineItem,
  index: number,
) {
  const { drawRect, drawText } = makeDrawers(page)
  const materialLines = [
    ...wrapText(item.description || '-', ctx.fontReg, 8.3, 138),
  ]
  if (item.sku?.trim()) {
    materialLines.unshift(item.sku.trim())
  }
  const details = itemDetailLines(item, ctx.fontReg)
  const lineCount = Math.max(materialLines.length, details.length, 1)
  const rowHeight = Math.max(20, 8 + lineCount * LINE_H)

  if (index % 2 === 0) {
    drawRect(MARGIN, y - rowHeight + 3, CONTENT_W, rowHeight, { fill: rgb(0.985, 0.985, 0.985) })
  }

  let textY = y - 10
  drawText(String(index + 1), TABLE_COL.item + 2, textY, { font: ctx.fontReg, size: 8 })
  drawText(String(item.quantity), TABLE_COL.qty + 2, textY, { font: ctx.fontReg, size: 8 })
  drawText(item.unit || 'ea', TABLE_COL.unit + 2, textY, { font: ctx.fontReg, size: 8 })
  drawText(
    item.contractor_budget != null ? `$${item.contractor_budget.toLocaleString()}` : '-',
    TABLE_COL.budget + 2,
    textY,
    { font: item.contractor_budget != null ? ctx.fontBold : ctx.fontReg, size: 8, color: item.contractor_budget != null ? rgb(0, 0, 0) : rgb(0.5, 0.5, 0.5) },
  )

  materialLines.forEach((line, lineIndex) => {
    drawText(clamp(line, 34), TABLE_COL.material + 2, y - 10 - lineIndex * LINE_H, {
      font: lineIndex === 0 && item.sku?.trim() ? ctx.fontBold : ctx.fontReg,
      size: lineIndex === 0 && item.sku?.trim() ? 7.8 : 8.1,
      color: lineIndex === 0 && item.sku?.trim() ? rgb(0.16, 0.16, 0.16) : rgb(0.27, 0.27, 0.27),
    })
  })

  details.forEach((line, lineIndex) => {
    drawText(clamp(line, 32), TABLE_COL.details + 2, y - 10 - lineIndex * LINE_H, {
      font: ctx.fontReg,
      size: 7.1,
      color: rgb(0.35, 0.35, 0.35),
    })
  })

  return rowHeight
}

function drawFooter(ctx: PdfContext, data: RFQPdfData) {
  const totalPages = ctx.pages.length
  ctx.pages.forEach((page, pageIndex) => {
    const { drawLine, drawText } = makeDrawers(page)
    const y = MARGIN - 6
    drawLine(MARGIN, y + 10, PAGE_W - MARGIN, y + 10, { color: rgb(0.82, 0.82, 0.82) })
    drawText(
      `Generated by Rialto • ${data.requestType === 'rfp' ? 'RFP' : 'RFQ'} ${data.rfqId} • ${new Date().toLocaleDateString()}`,
      MARGIN,
      y,
      { font: ctx.fontReg, size: 7, color: rgb(0.58, 0.58, 0.58) },
    )
    const pageText = `Page ${pageIndex + 1} of ${totalPages}`
    drawText(pageText, PAGE_W - MARGIN - ctx.fontReg.widthOfTextAtSize(pageText, 7), y, {
      font: ctx.fontReg,
      size: 7,
      color: rgb(0.58, 0.58, 0.58),
    })
  })
}

function drawRfpBriefSection(ctx: PdfContext, page: PDFPage, y: number, details?: RFPDetails) {
  if (!details) return y
  const rows = [
    ['Objective', details.procurement_objective],
    ['Scope', details.scope_summary],
    ['Desired Outcome', details.desired_outcome],
    ['Performance', details.performance_requirements],
    ['Alternates', details.approved_alternates],
    ['Quantity / Budget', details.quantity_context],
    ['Site Conditions', details.site_conditions],
    ['Delivery ZIP', details.delivery_zip],
    ['Logistics', details.delivery_logistics],
    ['Delivery Window', details.delivery_window],
    ['Phased Delivery', details.phased_delivery],
    ['Submittals', details.submittals_required],
    ['Lead Time Sensitivity', details.lead_time_sensitivity],
    ['Exclusions', details.exclusions],
    ['Unknowns / Questions', details.unknowns_or_questions],
    ['Vendor Questions', details.vendor_questions_requested],
    ['Vendor Guidance', details.vendor_guidance_requested],
    ['Attachments Summary', details.attachments_summary],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))

  if (rows.length === 0) return y

  const { drawRect, drawText } = makeDrawers(page)
  drawRect(MARGIN, y - 18, CONTENT_W, 18, { fill: rgb(0.94, 0.94, 0.94) })
  drawText('RFP BRIEF', MARGIN + 6, y - 12, { font: ctx.fontBold, size: 8.5 })
  y -= 28

  for (const [label, value] of rows) {
    const lines = wrapText(`${label}: ${value}`, ctx.fontReg, 8, CONTENT_W - 8)
    for (const line of lines) {
      drawText(line, MARGIN + 4, y, { font: ctx.fontReg, size: 8, color: rgb(0.3, 0.3, 0.3) })
      y -= 11
    }
  }

  return y - 6
}

function attachmentLabel(url: string) {
  const filename = url.split('/').pop() ?? url
  return decodeURIComponent(filename).replace(/^\d+-/, '')
}

function drawContextSection(ctx: PdfContext, page: PDFPage, y: number, data: RFQPdfData) {
  const rows: [string, string][] = [
    ...(data.procurementRequirements ?? []).map((requirement): [string, string] => [
      'Supplier Requirement',
      `${requirement.label}${requirement.note ? ` - ${requirement.note}` : ''}`,
    ]),
    ...(data.commodityWatch ?? []).map((watch): [string, string] => [
      'Commodity Watch',
      `${watch.category} (${watch.risk_level}): ${watch.summary}`,
    ]),
    ...(data.attachmentUrls ?? []).map((url): [string, string] => ['Reference File', attachmentLabel(url)]),
  ]

  if (rows.length === 0) return y

  const { drawRect, drawText } = makeDrawers(page)
  drawRect(MARGIN, y - 18, CONTENT_W, 18, { fill: rgb(0.94, 0.94, 0.94) })
  drawText('REQUEST CONTEXT', MARGIN + 6, y - 12, { font: ctx.fontBold, size: 8.5 })
  y -= 28

  for (const [label, value] of rows) {
    for (const line of wrapText(`${label}: ${value}`, ctx.fontReg, 8, CONTENT_W - 8)) {
      drawText(line, MARGIN + 4, y, { font: ctx.fontReg, size: 8, color: rgb(0.3, 0.3, 0.3) })
      y -= 11
    }
  }

  return y - 6
}

async function buildRFQPdfBytesForData(data: RFQPdfData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create()
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const ctx: PdfContext = { pdfDoc, fontBold, fontReg, pages: [] }

  let pageState = drawHeader(ctx, data, `${data.requestType === 'rfp' ? 'RFP' : 'RFQ'} Preview`)
  let y = pageState.y
  let page = pageState.page

  if (data.requestType === 'rfp') {
    y = drawRfpBriefSection(ctx, page, y, data.rfpDetails)
  }

  y = drawContextSection(ctx, page, y, data)

  const summaryLines = [
    ...new Set(
      data.lineItems.flatMap((item) => [
        item.specs?.trim(),
        item.certifications?.length ? `Required certifications: ${item.certifications.join(', ')}` : undefined,
      ]).filter((line): line is string => Boolean(line)),
    ),
  ]

  if (summaryLines.length > 0) {
    const { drawText, drawRect } = makeDrawers(page)
    drawRect(MARGIN, y - 18, CONTENT_W, 18, { fill: rgb(0.94, 0.94, 0.94) })
    drawText('KEY REQUIREMENTS', MARGIN + 6, y - 12, { font: ctx.fontBold, size: 8.5 })
    y -= 28
    for (const requirement of summaryLines.slice(0, 5)) {
      for (const line of wrapText(`• ${requirement}`, ctx.fontReg, 8, CONTENT_W - 10)) {
        drawText(line, MARGIN + 4, y, { font: ctx.fontReg, size: 8, color: rgb(0.3, 0.3, 0.3) })
        y -= 11
      }
    }
    y -= 6
  }

  drawTableHeader(ctx, page, y)
  y -= 22

  for (let index = 0; index < data.lineItems.length; index += 1) {
    const item = data.lineItems[index]
    const materialLines = [item.sku?.trim(), item.description?.trim()].filter(Boolean).flatMap((line) =>
      wrapText(String(line), line === item.sku?.trim() ? ctx.fontBold : ctx.fontReg, line === item.sku?.trim() ? 7.8 : 8.3, 138),
    )
    const details = itemDetailLines(item, ctx.fontReg)
    const lineCount = Math.max(materialLines.length, details.length, 1)
    const rowHeight = Math.max(20, 8 + lineCount * LINE_H)

    if (y - rowHeight < MARGIN + FOOTER_H + 36) {
      pageState = drawHeader(ctx, data, `Line Items (continued)`, false)
      page = pageState.page
      y = pageState.y
      drawTableHeader(ctx, page, y)
      y -= 22
    }

    const usedHeight = drawLineItemRow(ctx, page, y, item, index)
    y -= usedHeight
  }

  drawFooter(ctx, data)
  return Buffer.from(await pdfDoc.save())
}

export async function buildRFQPdfBytes(rfqId: string): Promise<Buffer> {
  const rfq = await getRFQById(rfqId)
  if (!rfq) throw new Error('RFQ not found')

  const project = rfq.project_id ? await getProject(rfq.project_id) : null
  const owner = project?.owner_id ? await findUserById(project.owner_id) : null

  return buildRFQPdfBytesForData({
    rfqId: rfq.id,
    projectId: rfq.project_id,
    projectName: project?.name ?? rfq.project_id,
    projectLocation: project?.location ?? '-',
    contractorName: owner?.company_info?.company_name ?? owner?.name ?? 'General Contractor',
    requestType: rfq.request_type ?? 'rfq',
    title: rfq.title,
    status: rfq.status,
    bidDeadline: rfq.bid_deadline,
    publishedAt: rfq.published_at,
    rfpDetails: rfq.rfp_details,
    attachmentUrls: rfq.attachment_urls,
    procurementRequirements: rfq.procurement_requirements,
    commodityWatch: rfq.commodity_watch,
    lineItems: rfq.line_items,
  })
}

export async function buildRFQPreviewPdfBytes(input: {
  rfqId?: string
  projectId: string
  projectName: string
  projectLocation: string
  contractorName?: string
  requestType?: RequestType
  rfpDetails?: RFPDetails
  attachmentUrls?: string[]
  procurementRequirements?: ProcurementRequirement[]
  commodityWatch?: CommodityWatch[]
  title: string
  bidDeadline?: string
  lineItems: ContractorRFQLineItem[]
}) {
  return buildRFQPdfBytesForData({
    rfqId: input.rfqId || 'preview-rfq',
    projectId: input.projectId,
    projectName: input.projectName,
    projectLocation: input.projectLocation,
    contractorName: input.contractorName,
    requestType: input.requestType ?? 'rfq',
    title: input.title,
    status: input.rfqId ? 'draft' : 'preview',
    bidDeadline: input.bidDeadline,
    rfpDetails: input.rfpDetails,
    attachmentUrls: input.attachmentUrls,
    procurementRequirements: input.procurementRequirements,
    commodityWatch: input.commodityWatch,
    lineItems: input.lineItems,
  })
}
