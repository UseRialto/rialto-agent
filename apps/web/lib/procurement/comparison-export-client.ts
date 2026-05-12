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

export function submitComparisonExport(input: ComparisonExportInput, ownerDocument: Document = document) {
  const form = ownerDocument.createElement('form')
  form.method = 'POST'
  form.action = '/api/comparison-export'
  form.style.display = 'none'

  for (const [name, value] of Object.entries(comparisonExportFormFields(input))) {
    const field = ownerDocument.createElement('input')
    field.type = 'hidden'
    field.name = name
    field.value = value
    form.appendChild(field)
  }

  ownerDocument.body.appendChild(form)
  form.submit()
  form.remove()
}
