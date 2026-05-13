import type { RequestType } from '@/lib/types/procurement'

export function buildRFQEmailSubject(rfqTitle: string, requestType: RequestType = 'rfq') {
  return `${requestType === 'rfp' ? 'Request for Proposal' : 'Request for Quote'}: ${rfqTitle}`
}

export function buildRFQEmailBody(params: {
  contractorName: string
  senderName?: string
  projectName: string
  rfqTitle: string
  requestType?: RequestType
  bidDeadline?: string | null
}) {
  const senderName = params.senderName?.trim() || 'Rialto'
  const deadline = params.bidDeadline
    ? `Please send your quote by ${params.bidDeadline}.`
    : 'Please send your quote at your earliest convenience.'

  return [
    'Hello {{vendor_first_name}},',
    '',
    `${params.contractorName} is requesting ${params.requestType === 'rfp' ? 'a proposal' : 'a quote'} for ${params.rfqTitle} on the ${params.projectName} project. ${deadline} Use the secure quote form linked in this email to review the request details and submit your pricing, lead times, and any scope notes.`,
    '',
    'Best,',
    senderName,
  ].join('\n')
}

export function appendMagicFormLink(body: string, magicFormUrl: string) {
  return [
    body.trim(),
    '',
    'Secure quote form:',
    magicFormUrl,
  ].join('\n')
}

export function buildMagicFormPreviewUrl() {
  return 'https://rialto.app/vendor/magic-rfq/preview-link'
}

export function deriveVendorFirstName(vendorName?: string, vendorEmail?: string) {
  const trimmedName = (vendorName ?? '').trim()
  if (trimmedName && !trimmedName.includes('@')) {
    return trimmedName.split(/\s+/)[0] ?? 'Vendor'
  }
  const emailLocalPart = (vendorEmail ?? '').split('@')[0]?.trim()
  if (!emailLocalPart) return 'Vendor'
  const cleaned = emailLocalPart
    .replace(/[._-]+/g, ' ')
    .trim()
  return cleaned.split(/\s+/)[0] ?? 'Vendor'
}

export function renderVendorEmailTemplate(body: string, params: { vendorName?: string; vendorEmail?: string; vendorFirstName?: string }) {
  const vendorName = (params.vendorName ?? '').trim() || params.vendorEmail?.trim() || 'Vendor'
  const firstName = params.vendorFirstName?.trim() || deriveVendorFirstName(vendorName, params.vendorEmail)
  return body
    .replaceAll('{{vendor_first_name}}', firstName)
    .replaceAll('{{vendor_name}}', vendorName)
    .replaceAll('{{vendor_full_name}}', vendorName)
    .replaceAll('{{vendor_email}}', params.vendorEmail?.trim() ?? '')
}

export function buildRFQEmailDraft(params: {
  contractorName: string
  senderName?: string
  projectName: string
  rfqTitle: string
  requestType?: RequestType
  bidDeadline?: string | null
  savedSubject?: string
  savedBody?: string
}) {
  return {
    subject: params.savedSubject || buildRFQEmailSubject(params.rfqTitle, params.requestType),
    body: params.savedBody || buildRFQEmailBody(params),
  }
}
