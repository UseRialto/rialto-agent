import { readFileSync } from 'fs'
import { join } from 'path'
import type { AISpecAssistantResult, ProcurementLineItemAttribute, RequestType } from '@/lib/types/procurement'

type AssistantLineItem = {
  description: string
  quantity?: number
  unit?: string
  specs?: string
  constraints?: string
  attributes?: ProcurementLineItemAttribute[]
}

type EmailLineItem = {
  sku?: string
  description: string
  quantity: number
  unit: string
  specs?: string
  certifications?: string[]
  notes?: string
  contractor_budget?: number
  suggested_lead_time_days?: number
}

type EmailDraftInput = {
  rfqTitle: string
  projectName: string
  projectLocation: string
  items: EmailLineItem[]
  senderName?: string
  bidDeadline?: string
  currentDraft?: string
  refinementPrompt?: string
}

type AssistantInput = {
  requestType?: RequestType
  category?: string
  projectName?: string
  lineItems?: AssistantLineItem[]
  selectedSpec?: string
  pmQuestion?: string
}

let envLoaded = false

function ensureLocalEnvLoaded() {
  if (envLoaded) return
  envLoaded = true
  try {
    const lines = readFileSync(join(process.cwd(), '.env.local'), 'utf8').split('\n')
    for (const line of lines) {
      const eq = line.indexOf('=')
      if (eq > 0) {
        const key = line.slice(0, eq).trim()
        const val = line.slice(eq + 1).trim()
        if (key && !process.env[key]) process.env[key] = val
      }
    }
  } catch {}
}

function toBullets(values: string[]) {
  return values.map((value) => `- ${value}`).join('\n')
}

function compact(text?: string) {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

function formatAttributeSummary(attributes?: ProcurementLineItemAttribute[]) {
  return (attributes ?? [])
    .filter((attribute) => attribute.value?.trim())
    .map((attribute) => `${attribute.label}: ${attribute.value.trim()}`)
    .join('; ')
}

function parseJsonResponse<T>(content: string): T {
  const trimmed = content.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced?.[1]?.trim() ?? trimmed
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    throw new Error('LLM response did not contain a JSON object.')
  }
  return JSON.parse(raw.slice(start, end + 1)) as T
}

async function callOpenAIJson<T>(prompt: string, system: string): Promise<T> {
  ensureLocalEnvLoaded()
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.')
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5-mini',
      response_format: { type: 'json_object' },
      max_completion_tokens: 1200,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    }),
  })
  if (!response.ok) throw new Error(`OpenAI request failed with ${response.status}.`)
  const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = json.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('OpenAI response was empty.')
  return parseJsonResponse<T>(content)
}

async function callLlmJson<T>(
  prompt: string,
  system: string,
  options?: { fallbackFactory?: () => T; requireConfigured?: boolean },
): Promise<T> {
  try {
    if (process.env.OPENAI_API_KEY) return await callOpenAIJson<T>(prompt, system)
    if (options?.requireConfigured) throw new Error('Configure OPENAI_API_KEY to run the AI assistant.')
  } catch (error) {
    if (!options?.fallbackFactory || options.requireConfigured) throw error
  }
  if (options?.fallbackFactory) return options.fallbackFactory()
  throw new Error('OPENAI_API_KEY is not configured.')
}

function fallbackSpecAssistant(input: AssistantInput): AISpecAssistantResult {
  const category = compact(input.category) || 'general materials'
  const items = input.lineItems ?? []
  const selectedSpec = compact(input.selectedSpec)
  const describedItems = items
    .slice(0, 4)
    .map((item) => {
      const parts = [compact(item.description)]
      if (item.quantity && item.unit) parts.push(`${item.quantity} ${item.unit}`)
      const attrSummary = formatAttributeSummary(item.attributes)
      if (attrSummary) parts.push(attrSummary)
      if (compact(item.specs)) parts.push(compact(item.specs))
      return parts.filter(Boolean).join(' | ')
    })
    .filter(Boolean)

  const summaryLead = selectedSpec
    ? `For spec ${selectedSpec}, the matching package appears to cover ${describedItems.join('; ') || category}.`
    : `This request covers ${describedItems.join('; ') || category}.`
  const questionText = compact(input.pmQuestion)

  return {
    summary: `${summaryLead} ${questionText ? `For your question, the safest read is to answer against the exact selected spec first, spell out any assumptions, and clearly flag alternates or exclusions before price is treated as firm.` : 'The safest read is to answer against the exact selected spec first, spell out any assumptions, and clearly flag alternates or exclusions before price is treated as firm.'}`,
    draft_intro: `Please review the attached ${category} package and respond with recommended materials, alternates, lead time assumptions, and any scope clarifications needed to price this request accurately.`,
    selected_spec: selectedSpec || undefined,
    pm_question: questionText || undefined,
  }
}

function buildDefaultEmailDraft(input: EmailDraftInput) {
  const validItems = input.items.filter((item) => item.sku || item.description)
  const senderName = input.senderName?.trim() || 'Rialto'
  const deadlineLine = input.bidDeadline
    ? `Please send pricing through Rialto by ${input.bidDeadline}.`
    : 'Please send pricing through Rialto when you can.'
  const itemSummary = validItems.length === 0
    ? 'the attached procurement package'
    : validItems.length === 1
      ? `${validItems[0].description}`
      : `${validItems[0].description} and ${validItems.length - 1} other item${validItems.length === 2 ? '' : 's'}`

  return [
    'Hello {{vendor_first_name}},',
    '',
    `Could you take a look at ${itemSummary} for the ${input.projectName} project in ${input.projectLocation}? ${deadlineLine} Use the Rialto link in this email to submit pricing, lead time, and any substitutions or scope notes.`,
    '',
    'Best,',
    senderName,
  ].join('\n')
}

function fallbackRefinedEmail(input: EmailDraftInput) {
  const prompt = compact(input.refinementPrompt).toLowerCase()
  const base = buildDefaultEmailDraft(input)
  const senderName = input.senderName?.trim() || 'Rialto'
  if (!prompt) return input.currentDraft?.trim() || base

  if (prompt.includes('short')) {
    return [
      'Hello {{vendor_first_name}},',
      '',
      `Please quote the attached ${input.rfqTitle} for ${input.projectName}. ${input.bidDeadline ? `Please submit through Rialto by ${input.bidDeadline}.` : 'Please submit through Rialto when you can.'}`,
      '',
      'Best,',
      senderName,
    ].join('\n')
  }

  if (prompt.includes('urg')) {
    return [
      'Hello {{vendor_first_name}},',
      '',
      `Please review ${input.rfqTitle} for ${input.projectName}. ${input.bidDeadline ? `We need your Rialto response by ${input.bidDeadline}, so an early turn would help.` : 'An early response through Rialto would help on this package.'} Please include pricing, lead time, and any substitutions or scope concerns.`,
      '',
      'Best,',
      senderName,
    ].join('\n')
  }

  return input.currentDraft
    ?.replace(/^Hi \{\{vendor_name\}\},/m, 'Hello {{vendor_first_name}},')
    .replace(/^Hi \{\{vendor_first_name\}\},/m, 'Hello {{vendor_first_name}},')
    .replace(/^Hello \{\{vendor_name\}\},/m, 'Hello {{vendor_first_name}},')
    .replace(/^Hello,$/m, 'Hello {{vendor_first_name}},') || base
}

export async function generateSpecAssistantOutput(input: AssistantInput): Promise<AISpecAssistantResult> {
  const itemsText = (input.lineItems ?? [])
    .map((item, index) => {
      const attributeSummary = formatAttributeSummary(item.attributes)
      return [
        `${index + 1}. ${item.description}${item.quantity ? ` - ${item.quantity} ${item.unit ?? ''}` : ''}`,
        compact(item.specs) ? `Specs: ${compact(item.specs)}` : '',
        compact(item.constraints) ? `Constraints: ${compact(item.constraints)}` : '',
        attributeSummary ? `Structured specs: ${attributeSummary}` : '',
      ].filter(Boolean).join('\n')
    })
    .join('\n\n')

  const prompt = [
    `Return a JSON object with keys: summary, missing_information, vendor_questions, recommended_material_specs, draft_intro.`,
    `Request type: ${input.requestType ?? 'rfq'}`,
    `Category: ${input.category ?? 'Unknown'}`,
    `Project: ${input.projectName ?? 'Unknown'}`,
    `Selected spec: ${input.selectedSpec ?? 'None provided'}`,
    `PM question: ${input.pmQuestion ?? 'None provided'}`,
    `Current line items:\n${itemsText || 'None provided'}`,
  ].join('\n\n')

  return callLlmJson<AISpecAssistantResult>(
    prompt,
    'You are a practical construction procurement assistant. Answer the PM question directly in one short paragraph inside the "summary" field. Return only valid JSON with arrays for missing_information, vendor_questions, and recommended_material_specs.',
    { requireConfigured: true },
  )
}

export async function generateVendorOutreachDraft(input: EmailDraftInput): Promise<string> {
  const validItems = input.items.filter((item) => item.sku || item.description)
  const itemsList = validItems
    .slice(0, 8)
    .map((item, idx) => {
      const extra = [
        item.specs ? `Specs: ${item.specs}` : '',
        item.suggested_lead_time_days ? `Lead time needed: ${item.suggested_lead_time_days} days` : '',
      ].filter(Boolean).join(' | ')
      return `${idx + 1}. ${item.description}${item.sku ? ` (SKU: ${item.sku})` : ''} - ${item.quantity} ${item.unit}${extra ? ` - ${extra}` : ''}`
    })
    .join('\n')

  const promptContent = input.currentDraft && input.refinementPrompt
    ? [
        'Return only the revised plain-text email body.',
        'Preserve the token {{vendor_first_name}} exactly.',
        'The first line must be: Hello {{vendor_first_name}},',
        'Use fewer paragraph breaks: greeting, one natural body paragraph, then sign-off.',
        input.senderName ? `Sign off exactly with:\nBest,\n${input.senderName}` : `Sign off with:\nBest,\nRialto`,
        `Current draft:\n${input.currentDraft}`,
        `Refinement request: ${input.refinementPrompt}`,
      ].join('\n\n')
    : [
        'Return only the email body in plain text.',
        'Open exactly with: Hello {{vendor_first_name}},',
        'Keep it warm, direct, and natural.',
        'Use fewer paragraph breaks: greeting, one concise body paragraph, then sign-off.',
        input.senderName ? `Sign off exactly with:\nBest,\n${input.senderName}` : `Sign off with:\nBest,\nRialto`,
        `Request: ${input.rfqTitle}`,
        `Project: ${input.projectName}`,
        `Location: ${input.projectLocation}`,
        `Quote deadline: ${input.bidDeadline ?? 'Not provided'}`,
        `Items:\n${itemsList || 'None provided'}`,
      ].join('\n\n')

  const fallback = input.currentDraft && input.refinementPrompt
    ? fallbackRefinedEmail(input)
    : buildDefaultEmailDraft(input)

  const response = await callLlmJson<{ draft?: string }>(
    `Return JSON with one key: draft.\n\n${promptContent}`,
    'You write short construction procurement outreach emails. Return only valid JSON.',
    { fallbackFactory: () => ({ draft: fallback }) },
  )

  return response.draft?.trim() || fallback
}
