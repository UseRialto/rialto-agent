import { loadPdfJs } from '../pdf/runtime'
import { inflateSync } from 'node:zlib'

export function isPdfImportFile(file: Pick<File, 'name' | 'type'>) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export function isExcelImportFile(file: Pick<File, 'name' | 'type'>) {
  const name = file.name.toLowerCase()
  return (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    name.endsWith('.xsl') ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel'
  )
}

export function isDelimitedSpreadsheetImportFile(file: Pick<File, 'name' | 'type'>) {
  const name = file.name.toLowerCase()
  return (
    name.endsWith('.csv') ||
    name.endsWith('.tsv') ||
    file.type === 'text/csv' ||
    file.type === 'text/tab-separated-values'
  )
}

export function importSourceKindForFile(file: Pick<File, 'name' | 'type'>) {
  if (isPdfImportFile(file)) return 'pdf' as const
  if (isDelimitedSpreadsheetImportFile(file) || isExcelImportFile(file)) return 'spreadsheet' as const
  return undefined
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

type PdfToUnicodeMap = Map<number, string>

function parsePdfToUnicodeMap(value: string): PdfToUnicodeMap {
  const map: PdfToUnicodeMap = new Map()
  for (const match of value.matchAll(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4,})>/g)) {
    const source = Number.parseInt(match[1] ?? '', 16)
    const targetHex = match[2] ?? ''
    let text = ''
    for (let index = 0; index + 3 < targetHex.length; index += 4) {
      text += String.fromCharCode(Number.parseInt(targetHex.slice(index, index + 4), 16))
    }
    if (Number.isFinite(source) && text) map.set(source, text)
  }
  return map
}

function pdfDecodedStreams(buffer: Buffer) {
  const decoded: Array<{ objectNumber?: string; text: string }> = []
  const streamPattern = /(?:(\d+)\s+0\s+obj\s*<<[\s\S]*?>>\s*)?stream\r?\n([\s\S]*?)\r?\nendstream/g
  for (const match of buffer.toString('latin1').matchAll(streamPattern)) {
    const raw = Buffer.from(match[2] ?? '', 'latin1')
    try {
      decoded.push({
        objectNumber: match[1],
        text: inflateSync(raw).toString('latin1'),
      })
    } catch {
      continue
    }
  }
  return decoded
}

function pdfFontUnicodeMaps(decodedStreams: Array<{ objectNumber?: string; text: string }>) {
  const mapsByObject = new Map<string, PdfToUnicodeMap>()
  for (const stream of decodedStreams) {
    if (!stream.objectNumber || !/begin(?:bfchar|bfrange)|begincmap/.test(stream.text)) continue
    const map = parsePdfToUnicodeMap(stream.text)
    if (map.size > 0) mapsByObject.set(stream.objectNumber, map)
  }

  const combined = decodedStreams.map((stream) => stream.text).join('\n')
  const byFontName = new Map<string, PdfToUnicodeMap>()
  for (const match of combined.matchAll(/\/BaseFont\/([A-Z]{6})\+[\s\S]{0,300}?\/ToUnicode\s+(\d+)\s+0\s+R/g)) {
    const fontName = match[1]
    const map = mapsByObject.get(match[2] ?? '')
    if (fontName && map) byFontName.set(fontName, map)
  }
  return byFontName
}

function decodePdfBytes(bytes: Buffer, unicodeMap?: PdfToUnicodeMap) {
  if (unicodeMap) {
    let text = ''
    for (let index = 0; index + 1 < bytes.length; index += 2) {
      const code = bytes.readUInt16BE(index)
      text += unicodeMap.get(code) ?? ''
    }
    return text
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let text = ''
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      text += String.fromCharCode(bytes.readUInt16BE(index))
    }
    return text
  }
  return bytes.toString('latin1')
}

function decodePdfHexText(hex: string, unicodeMap?: PdfToUnicodeMap) {
  const bytes = Buffer.from(hex.replace(/\s+/g, ''), 'hex')
  return decodePdfBytes(bytes, unicodeMap)
}

function decodePdfLiteralText(value: string) {
  return value
    .replace(/\\([nrtbf()\\])/g, (_match, escaped: string) => {
      if (escaped === 'n') return '\n'
      if (escaped === 'r') return '\r'
      if (escaped === 't') return '\t'
      if (escaped === 'b') return '\b'
      if (escaped === 'f') return '\f'
      return escaped
    })
}

function textFromPdfTextBlock(block: string, unicodeMap?: PdfToUnicodeMap) {
  const parts: string[] = []
  for (const match of block.matchAll(/<([0-9A-Fa-f\s]*)>\s*Tj/g)) {
    parts.push(decodePdfHexText(match[1] ?? '', unicodeMap))
  }
  for (const match of block.matchAll(/\(([^()]*(?:\\.[^()]*)*)\)\s*Tj/g)) {
    parts.push(decodePdfBytes(Buffer.from(decodePdfLiteralText(match[1] ?? ''), 'latin1'), unicodeMap))
  }
  for (const arrayMatch of block.matchAll(/\[([\s\S]*?)\]\s*TJ/g)) {
    const array = arrayMatch[1] ?? ''
    for (const hexMatch of array.matchAll(/<([0-9A-Fa-f\s]*)>/g)) {
      parts.push(decodePdfHexText(hexMatch[1] ?? '', unicodeMap))
    }
    for (const literalMatch of array.matchAll(/\(([^()]*(?:\\.[^()]*)*)\)/g)) {
      parts.push(decodePdfBytes(Buffer.from(decodePdfLiteralText(literalMatch[1] ?? ''), 'latin1'), unicodeMap))
    }
  }
  return parts.join('')
}

function textPositionFromPdfTextBlock(block: string, contentBeforeBlock: string) {
  const tmMatches = [...block.matchAll(/(-?[0-9.]+)\s+(-?[0-9.]+)\s+(-?[0-9.]+)\s+(-?[0-9.]+)\s+(-?[0-9.]+)\s+(-?[0-9.]+)\s+Tm/g)]
  const tm = tmMatches.at(-1)
  const cmMatches = [...contentBeforeBlock.matchAll(/(-?[0-9.]+)\s+(-?[0-9.]+)\s+(-?[0-9.]+)\s+(-?[0-9.]+)\s+(-?[0-9.]+)\s+(-?[0-9.]+)\s+cm/g)]
  const cm = cmMatches.at(-1)
  if (!tm && !cm) return undefined
  return {
    x: Number.parseFloat(cm?.[5] ?? '0') + Number.parseFloat(tm?.[5] ?? '0'),
    y: Number.parseFloat(cm?.[6] ?? '0') + Number.parseFloat(tm?.[6] ?? '0'),
  }
}

function looksLikeReadablePdfText(text: string) {
  if (!text.trim() || text.includes('\u0000')) return false
  const nonWhitespace = text.replace(/\s+/g, '')
  if (!nonWhitespace) return false
  const readable = nonWhitespace.replace(/[^A-Za-z0-9$.,:'"()/#&+\-]/g, '')
  return readable.length / nonWhitespace.length > 0.8
}

function estimatedPdfPageCount(buffer: Buffer) {
  return buffer.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length ?? 0
}

function quoteLikeRowCount(text: string) {
  return text.split('\n').filter((line) => {
    const trimmed = line.trim()
    return /^[A-Z]\d{3,}\s+\S+\s+/.test(trimmed) ||
      (/^\d+\s+\S+/.test(trimmed) && /\$\s*[0-9]/.test(trimmed))
  }).length
}

async function extractPdfImportTextFromContentStreams(buffer: Buffer) {
  const pageTexts: string[] = []
  const decodedStreams = pdfDecodedStreams(buffer)
  const fontMaps = pdfFontUnicodeMaps(decodedStreams)
  for (const stream of decodedStreams) {
    const content = stream.text
    if (!/\bBT\b/.test(content) || !/\b(?:Tj|TJ)\b/.test(content)) continue
    const yIncreasesDown = /\b1\s+0\s+0\s+-1\s+0\s+[0-9.]+\s+cm\b/.test(content.slice(0, 5000))
    const rows = new Map<number, Array<{ x: number; text: string }>>()
    for (const blockMatch of content.matchAll(/\bBT\b([\s\S]*?)\bET\b/g)) {
      const block = blockMatch[1] ?? ''
      const fontName = block.match(/\/([A-Z]{6})\s+[0-9.]+\s+Tf/)?.[1]
      const text = textFromPdfTextBlock(block, fontName ? fontMaps.get(fontName) : undefined).trim()
      if (!text) continue
      const position = textPositionFromPdfTextBlock(block, content.slice(Math.max(0, (blockMatch.index ?? 0) - 200), blockMatch.index ?? 0))
      if (!position) continue
      const y = Math.round(position.y)
      rows.set(y, [...(rows.get(y) ?? []), { x: position.x, text }])
    }
    const pageText = [...rows.entries()]
      .sort((a, b) => yIncreasesDown ? a[0] - b[0] : b[0] - a[0])
      .map(([, parts]) => parts
        .sort((a, b) => a.x - b.x)
        .map((part) => part.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim())
      .filter(Boolean)
      .join('\n')
    if (pageText) pageTexts.push(pageText)
  }

  const text = pageTexts.join('\n')
  const pageCount = estimatedPdfPageCount(buffer)
  if (pageCount > 0 && pageTexts.length > 0 && pageTexts.length < pageCount) return ''
  return looksLikeReadablePdfText(text) ? text : ''
}

async function extractPdfImportTextWithPdfJs(buffer: Buffer) {
  const pdfjs = await loadPdfJs()
  const document = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    disableWorker: true,
  } as Parameters<typeof pdfjs.getDocument>[0]).promise
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

async function extractPdfImportTextWithPdfParse(buffer: Buffer) {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText({ first: 60 })
    return String(result.text ?? '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line.replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim())
      .filter((line) => line && !/^--\s+\d+\s+of\s+\d+\s+--$/.test(line))
      .join('\n')
  } finally {
    await parser.destroy()
  }
}

export async function extractPdfImportTextWithFallback(
  buffer: Buffer,
  extractPrimary: (buffer: Buffer) => Promise<string> = extractPdfImportTextWithPdfJs,
  extractBackup: (buffer: Buffer) => Promise<string> = extractPdfImportTextWithPdfParse,
) {
  let primaryError: unknown
  try {
    const text = await extractPrimary(buffer)
    if (text.trim()) return text
    primaryError = new Error('pdfjs returned no readable text')
  } catch (error) {
    primaryError = error
  }

  try {
    const backupText = await extractBackup(buffer)
    if (backupText.trim()) return backupText
    throw new Error('pdf-parse returned no readable text')
  } catch (backupError) {
    throw new Error(`PDF text extraction failed (pdfjs: ${errorMessage(primaryError)}; pdf-parse: ${errorMessage(backupError)}).`)
  }
}

export async function extractPdfImportText(buffer: Buffer) {
  let contentStreamText = ''
  let contentStreamError: unknown
  try {
    contentStreamText = await extractPdfImportTextFromContentStreams(buffer)
  } catch (error) {
    contentStreamError = error
  }

  try {
    const fallbackText = await extractPdfImportTextWithFallback(
      buffer,
      extractPdfImportTextWithPdfJs,
      extractPdfImportTextWithPdfParse,
    )
    if (!contentStreamText.trim()) return fallbackText
    return quoteLikeRowCount(fallbackText) > quoteLikeRowCount(contentStreamText) ? fallbackText : contentStreamText
  } catch (fallbackError) {
    if (contentStreamText.trim()) return contentStreamText
    throw new Error(`PDF text extraction failed (pdfjs: ${errorMessage(contentStreamError ?? new Error('content stream extraction returned no readable text'))}; pdf-parse: ${errorMessage(fallbackError)}).`)
  }
}

export async function extractExcelImportText(buffer: Buffer) {
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

export async function extractExternalQuoteImportText(file: Pick<File, 'name' | 'type'>, buffer: Buffer) {
  if (isPdfImportFile(file)) return extractPdfImportText(buffer)
  if (isDelimitedSpreadsheetImportFile(file)) return buffer.toString('utf8')
  if (isExcelImportFile(file)) return extractExcelImportText(buffer)
  return buffer.toString('utf8')
}
