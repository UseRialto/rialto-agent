import { readFileSync } from 'fs'
import { join } from 'path'
import type { ComplianceEvaluationInput, ComplianceEvaluationResult } from './types'
import type { BidSpecComplianceEvidence, BidSpecComplianceItemStatus } from '@/lib/types/procurement'

const MAX_CONTEXT_CHARS = 18_000

let envLoaded = false

function ensureLocalEnvLoaded() {
  if (envLoaded) return
  envLoaded = true
  try {
    const lines = readFileSync(join(process.cwd(), '.env.local'), 'utf8').split('\n')
    for (const line of lines) {
      const eq = line.indexOf('=')
      if (eq <= 0) continue
      const key = line.slice(0, eq).trim()
      const raw = line.slice(eq + 1).trim()
      const value = raw.replace(/^"|"$/g, '')
      if (key && !process.env[key]) process.env[key] = value
    }
  } catch {}
}

function parseJsonResponse(content: string) {
  const trimmed = content.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced?.[1]?.trim() ?? trimmed
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    throw new Error('LLM response did not contain a JSON object.')
  }
  return JSON.parse(raw.slice(start, end + 1))
}

const STATUSES = new Set(['compliant', 'violation', 'needs_review', 'no_spec_found', 'not_quoted'])
const SEVERITIES = new Set(['low', 'medium', 'high'])

function normalizeStatus(value: unknown): BidSpecComplianceItemStatus {
  const normalized = String(value ?? '').toLowerCase().replace(/[\s-]+/g, '_')
  return STATUSES.has(normalized) ? normalized as BidSpecComplianceItemStatus : 'needs_review'
}

function normalizeSeverity(value: unknown): ComplianceEvaluationResult['severity'] {
  const normalized = String(value ?? '').toLowerCase()
  if (SEVERITIES.has(normalized)) return normalized as ComplianceEvaluationResult['severity']
  if (['critical', 'major', 'severe', 'noncompliant', 'fail'].includes(normalized)) return 'high'
  if (['moderate', 'review', 'unknown'].includes(normalized)) return 'medium'
  return 'low'
}

function normalizeEvidence(value: unknown, input: ComplianceEvaluationInput): BidSpecComplianceEvidence[] {
  if (Array.isArray(value)) {
    const normalized: BidSpecComplianceEvidence[] = []
    for (const entry of value) {
      if (typeof entry === 'string') {
        const chunk = input.chunks.find((candidate) => candidate.content.includes(entry.slice(0, 80))) ?? input.chunks[0]
        if (chunk) {
          normalized.push({
            document_id: chunk.document_id,
            document_name: chunk.document_name,
            page_start: chunk.page_start,
            page_end: chunk.page_end,
            section_number: chunk.section_number,
            section_title: chunk.section_title,
            quote: entry,
          })
        }
        continue
      }
      if (!entry || typeof entry !== 'object') continue
      const raw = entry as Partial<BidSpecComplianceEvidence>
      const documentName = String(raw.document_name ?? input.chunks[0]?.document_name ?? 'Project specification')
      const pageStart = Number(raw.page_start ?? input.chunks[0]?.page_start ?? 1)
      const pageEnd = Number(raw.page_end ?? pageStart)
      const matchedChunk = input.chunks.find((chunk) => (
        chunk.document_name === documentName &&
        chunk.page_start <= pageStart &&
        chunk.page_end >= pageEnd
      ))
      normalized.push({
        document_id: matchedChunk?.document_id,
        document_name: documentName,
        page_start: pageStart,
        page_end: pageEnd,
        section_number: raw.section_number,
        section_title: raw.section_title,
        quote: String(raw.quote ?? matchedChunk?.content.slice(0, 350) ?? ''),
      })
    }
    return normalized
  }

  if (typeof value === 'string' && value.trim()) {
    const chunk = input.chunks.find((candidate) => candidate.content.includes(value.slice(0, 80))) ?? input.chunks[0]
    if (!chunk) return []
    return [{
      document_id: chunk.document_id,
      document_name: chunk.document_name,
      page_start: chunk.page_start,
      page_end: chunk.page_end,
      section_number: chunk.section_number,
      section_title: chunk.section_title,
      quote: value,
    }]
  }

  return input.chunks.slice(0, 2).map((chunk) => ({
    document_id: chunk.document_id,
    document_name: chunk.document_name,
    page_start: chunk.page_start,
    page_end: chunk.page_end,
    section_number: chunk.section_number,
    section_title: chunk.section_title,
    quote: chunk.content.slice(0, 350),
  }))
}

function normalizeEvaluation(raw: unknown, input: ComplianceEvaluationInput): ComplianceEvaluationResult {
  const obj = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  return {
    status: normalizeStatus(obj.status),
    severity: normalizeSeverity(obj.severity),
    requirement_summary: String(obj.requirement_summary ?? ''),
    vendor_summary: String(obj.vendor_summary ?? ''),
    explanation: String(obj.explanation ?? 'AI returned an incomplete compliance explanation.'),
    suggested_follow_up: typeof obj.suggested_follow_up === 'string' ? obj.suggested_follow_up : undefined,
    evidence: normalizeEvidence(obj.evidence, input),
  }
}

function getModelInfo() {
  ensureLocalEnvLoaded()
  return { apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || 'gpt-5-mini' }
}

export function configuredComplianceModel() {
  const model = getModelInfo()
  return model.model
}

function compact(value?: string | number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function buildPrompt(input: ComplianceEvaluationInput) {
  const item = input.lineItem
  const response = input.response
  const profile = input.productProfile
  const lookup = profile?.lookup
  const context = input.chunks
    .map((chunk, index) => [
      `Evidence ${index + 1}: ${chunk.document_name}, pages ${chunk.page_start}-${chunk.page_end}${chunk.section_number ? `, section ${chunk.section_number}` : ''}${chunk.section_title ? ` ${chunk.section_title}` : ''}`,
      chunk.content.slice(0, 4_000),
    ].join('\n'))
    .join('\n\n')
    .slice(0, MAX_CONTEXT_CHARS)

  return [
    'Return only valid JSON with keys: status, severity, requirement_summary, vendor_summary, explanation, suggested_follow_up, evidence.',
    'Status must be one of: compliant, violation, needs_review, no_spec_found.',
    'Severity must be exactly one of: low, medium, high.',
    'Evidence must be an array of objects with document_name, page_start, page_end, section_number, section_title, and quote.',
    'Use no_spec_found when the provided spec evidence does not contain requirements for this RFQ item.',
    'Do not use compliant unless the vendor product facts and the cited spec evidence both support compliance.',
    'Use violation only when the vendor quote clearly conflicts with a stated requirement.',
    'Use needs_review when evidence is relevant but the quote lacks enough detail or the match is uncertain.',
    'Treat random SKUs as unknown unless vendor details or product lookup facts explain what they are.',
    'Do not punish unquoted/unavailable items here; those are handled before this evaluator runs.',
    '',
    `RFQ: ${input.rfq.title}`,
    `RFQ category: ${input.rfq.category ?? 'unknown'}`,
    `Item: ${compact(item.sku)} ${item.description}`,
    `Requested quantity: ${item.quantity} ${item.unit}`,
    `Requested specs: ${compact(item.specs) || 'none'}`,
    `Requested constraints: ${compact(item.constraints) || 'none'}`,
    `Item notes: ${compact(item.notes) || 'none'}`,
    '',
    `Vendor: ${input.bid.vendor_name}`,
    `Availability: ${response.availability}`,
    `Vendor SKU: ${compact(response.sku) || 'none'}`,
    `Vendor description: ${compact(response.description) || 'none'}`,
    `Quoted quantity: ${response.quoted_quantity ?? response.quantity} ${response.unit}`,
    `Quoted unit price: ${response.unit_price}`,
    `Quoted product details: ${compact(response.quoted_product_details) || 'none'}`,
    `Vendor substitution notes: ${compact(response.substitution_notes) || 'none'}`,
    `Vendor notes: ${compact(response.notes) || 'none'}`,
    '',
    'Normalized vendor product profile:',
    `Requested SKU: ${profile?.requested_sku ?? 'none'}`,
    `Requested description: ${profile?.requested_description ?? 'none'}`,
    `Requested specs: ${profile?.requested_specs ?? 'none'}`,
    `Vendor SKU: ${profile?.vendor_sku ?? 'none'}`,
    `Manufacturer: ${profile?.manufacturer ?? 'unknown'}`,
    `Model: ${profile?.model ?? 'unknown'}`,
    `Meaningful vendor detail supplied: ${profile?.has_meaningful_vendor_detail ? 'yes' : 'no'}`,
    `Product lookup status: ${lookup?.status ?? 'skipped'}${lookup?.provider ? ` via ${lookup.provider}` : ''}`,
    `Product lookup summary: ${compact(lookup?.summary) || 'none'}`,
    `Product lookup results: ${(lookup?.results ?? []).slice(0, 3).map((result) => `${result.title}${result.snippet ? ` - ${result.snippet}` : ''}`).join(' | ') || 'none'}`,
    '',
    `Spec evidence:\n${context || 'No matching spec evidence was retrieved.'}`,
  ].join('\n')
}

async function callOpenAI(prompt: string, model: string, apiKey: string) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      max_completion_tokens: 900,
      messages: [
        { role: 'system', content: 'You are a construction specification compliance reviewer. Be strict, evidence-based, and concise.' },
        { role: 'user', content: prompt },
      ],
    }),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`OpenAI compliance request failed with ${response.status} for model "${model}". ${detail.slice(0, 300)}`)
  }
  const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  return json.choices?.[0]?.message?.content ?? ''
}

function fallbackEvaluation(input: ComplianceEvaluationInput): ComplianceEvaluationResult {
  const profile = input.productProfile
  if (input.chunks.length === 0) {
    return {
      status: 'no_spec_found',
      severity: 'low',
      requirement_summary: 'No matching specification text was found for this line item.',
      vendor_summary: compact(input.response.quoted_product_details) || compact(input.response.notes) || compact(input.response.sku) || 'No vendor product details provided.',
      explanation: 'The RFQ item can be compared manually, but there was no indexed spec evidence to evaluate automatically.',
      suggested_follow_up: 'Ask the vendor to confirm whether their quoted product complies with the project specifications.',
      evidence: [],
      retrieval_diagnostics: input.retrievalDiagnostics,
      product_lookup: profile?.lookup,
    }
  }

  return {
    status: compact(input.response.quoted_product_details) ? 'needs_review' : 'needs_review',
    severity: profile?.has_meaningful_vendor_detail || profile?.lookup?.status === 'found' ? 'medium' : 'high',
    requirement_summary: 'Relevant specification text was found and requires manual review.',
    vendor_summary: compact(input.response.quoted_product_details) || compact(input.response.notes) || compact(input.response.sku) || 'Vendor did not provide specific product details.',
    explanation: 'AI compliance analysis is not configured. The retrieved spec evidence is available for contractor review.',
    suggested_follow_up: 'Compare the vendor product details against the cited specification pages before award.',
    evidence: input.chunks.slice(0, 3).map((chunk) => ({
      document_id: chunk.document_id,
      document_name: chunk.document_name,
      page_start: chunk.page_start,
      page_end: chunk.page_end,
      section_number: chunk.section_number,
      section_title: chunk.section_title,
      quote: chunk.content.slice(0, 350),
    })),
    retrieval_diagnostics: input.retrievalDiagnostics,
    product_lookup: profile?.lookup,
  }
}

export async function evaluateLineItemCompliance(input: ComplianceEvaluationInput): Promise<ComplianceEvaluationResult> {
  const modelInfo = getModelInfo()
  if (!modelInfo.apiKey || !modelInfo.model) return fallbackEvaluation(input)

  const raw = await callOpenAI(buildPrompt(input), modelInfo.model, modelInfo.apiKey)
  const result = normalizeEvaluation(parseJsonResponse(raw), input)
  const lookupFound = input.productProfile?.lookup?.status === 'found'
  if (result.status === 'compliant' && !input.productProfile?.has_meaningful_vendor_detail && !lookupFound) {
    return {
      ...result,
      status: 'needs_review',
      severity: result.severity === 'low' ? 'medium' : result.severity,
      explanation: `Vendor product details were too thin to verify compliance automatically. ${result.explanation}`,
      suggested_follow_up: result.suggested_follow_up ?? 'Ask the vendor for manufacturer, model, dimensions, finish, material, and substitution details.',
      retrieval_diagnostics: input.retrievalDiagnostics,
      product_lookup: input.productProfile?.lookup,
    }
  }
  return {
    ...result,
    retrieval_diagnostics: input.retrievalDiagnostics,
    product_lookup: input.productProfile?.lookup,
  }
}
