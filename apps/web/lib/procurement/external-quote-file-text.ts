export function isPdfImportFile(file: Pick<File, 'name' | 'type'>) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export function isExcelImportFile(file: Pick<File, 'name' | 'type'>) {
  const name = file.name.toLowerCase()
  return (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel'
  )
}

export async function extractPdfImportText(buffer: Buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const document = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    isEvalSupported: false,
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
  if (isExcelImportFile(file)) return extractExcelImportText(buffer)
  return buffer.toString('utf8')
}
