export type ComparisonExportFormat = 'csv' | 'xlsx' | 'pdf'

export interface ComparisonExportInput {
  format: ComparisonExportFormat
  title: string
  rows: (string | number)[][]
}

export function comparisonExportFormFields(input: ComparisonExportInput) {
  return {
    format: input.format,
    title: input.title,
    rows: JSON.stringify(input.rows),
  }
}

export interface ComparisonExportDownload {
  blob: Blob
  filename: string
}

export function comparisonExportFilenameFromDisposition(value: string | null, fallback: string) {
  if (!value) return fallback
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(value)
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1].replace(/^"|"$/g, ''))
  const match = /filename="?([^";]+)"?/i.exec(value)
  return match?.[1]?.trim() || fallback
}

function fallbackFilename(input: ComparisonExportInput) {
  const safeTitle = input.title
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90) || 'quote-comparison'
  return `${safeTitle}.${input.format}`
}

export async function submitComparisonExport(input: ComparisonExportInput): Promise<ComparisonExportDownload> {
  const form = new FormData()
  for (const [name, value] of Object.entries(comparisonExportFormFields(input))) form.append(name, value)

  const response = await fetch('/api/comparison-export', {
    method: 'POST',
    body: form,
  })

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || 'Export failed.')
  }

  return {
    blob: await response.blob(),
    filename: comparisonExportFilenameFromDisposition(response.headers.get('content-disposition'), fallbackFilename(input)),
  }
}
