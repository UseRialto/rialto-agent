import type { AgentMessage, AgentToolCall, UserContext } from '../domain/types.js'

export interface LlmPlanRequest {
  userContext: UserContext
  messages: AgentMessage[]
  tools: Array<{
    id: string
    surface: string
    description: string
    visibleToUser: boolean
    mutatesPersistentData: boolean
    requiresUserApproval: boolean
  }>
}

export interface LlmPlanResponse {
  reply: string
  plan?: string[]
  toolCalls: AgentToolCall[]
}

export interface LlmPlanner {
  plan(request: LlmPlanRequest): Promise<LlmPlanResponse>
}

export function parseJson<T>(text: string): T {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced?.[1]?.trim() ?? trimmed
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('LLM response did not contain JSON.')
  return JSON.parse(raw.slice(start, end + 1)) as T
}

function buildPrompt(request: LlmPlanRequest) {
  return [
    'You are Rialto Agent, the single intelligence core for construction procurement.',
    'Choose only from the provided tools. All actions must be visible to the user.',
    'Do not perform post-comparison vendor selection or hidden backend mutations in v1.',
    'Email tools only create drafts; the user sends.',
    'Spreadsheet tools preview changes for review unless a future product policy explicitly allows direct tiny edits.',
    'Return JSON only with shape: {"reply":"...","plan":["..."],"toolCalls":[{"id":"call-1","toolId":"...","input":{}}]}.',
    '',
    `Tools: ${JSON.stringify(request.tools)}`,
    '',
    `User Context: ${JSON.stringify(request.userContext)}`,
    '',
    'Conversation:',
    ...request.messages.slice(-12).map((message) => `${message.role}: ${message.content}`),
  ].join('\n')
}

export class OpenAIPlanner implements LlmPlanner {
  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.OPENAI_MODEL ?? 'gpt-5-mini',
  ) {}

  async plan(request: LlmPlanRequest): Promise<LlmPlanResponse> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: 'Return valid JSON only.' },
          { role: 'user', content: buildPrompt(request) },
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: 1800,
      }),
    })
    const json = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>
      error?: { message?: string }
    }
    if (!response.ok) throw new Error(json.error?.message ?? `OpenAI request failed (${response.status}).`)
    const text = json.choices?.[0]?.message?.content
    if (!text) throw new Error('OpenAI returned an empty response.')
    return parseJson<LlmPlanResponse>(text)
  }
}

export class DeterministicPlanner implements LlmPlanner {
  async plan(request: LlmPlanRequest): Promise<LlmPlanResponse> {
    const last = request.messages.at(-1)?.content.toLowerCase() ?? ''
    if (/\b(ai|model|llm|api key|openai|running|runtime)\b/.test(last)) {
      return {
        reply: 'NO API KEY',
        plan: [],
        toolCalls: [],
      }
    }
    if (/\b(email|draft|send to vendor|outreach)\b/.test(last)) {
      const quoteRequest = request.userContext.data.quoteRequests[0]
      const vendor = request.userContext.data.vendorDirectory.find((candidate) =>
        last.includes(candidate.name.toLowerCase().split(/\s+/)[0] ?? candidate.name.toLowerCase()),
      ) ?? request.userContext.data.vendorDirectory[0]
      const contact = vendor?.contacts.find((candidate) => !candidate.suppressed) ?? vendor?.contacts[0]
      const subject = quoteRequest ? `Request for Quote: ${quoteRequest.title}` : 'Request for Quote'
      const body = [
        `Hello ${contact?.name?.split(/\s+/)[0] ?? 'there'},`,
        '',
        `${request.userContext.user.name} is requesting pricing for ${quoteRequest?.title ?? 'the attached material package'}.`,
        'Please review the line items and send pricing, lead times, alternates, exclusions, and any quantity or unit notes.',
        '',
        'Thank you,',
        request.userContext.user.name,
      ].join('\n')
      return {
        reply: 'I prepared an email draft for review. You send it when it looks right.',
        plan: ['Open a visible email draft composer.', 'Fill recipients, subject, and body for estimator review.'],
        toolCalls: [{
          id: 'call-email-draft',
          toolId: 'email.draft_vendor_outreach',
          input: {
            quoteRequestId: quoteRequest?.id,
            vendorId: vendor?.id,
            to: contact?.email ? [contact.email] : [],
            subject,
            body,
          },
        }],
      }
    }
    if (/\b(excel|spreadsheet|comparison|sheet|highlight|column|row)\b/.test(last)) {
      const firstSheet = request.userContext.data.comparisonSheets[0]
      const operations = /\b(lowest|complete|quote)\b/.test(last)
        ? [{
            kind: 'highlight-range',
            range: 'lowest-complete-comparable-quote',
            color: 'green',
            note: 'Highlight the lowest complete comparable quote; lower partial totals remain separate caveated context.',
          }]
        : []
      return {
        reply: 'I prepared a spreadsheet edit preview.',
        plan: ['Preview the requested comparison-sheet change before applying it.'],
        toolCalls: [{
          id: 'call-sheet-preview',
          toolId: 'sheet.preview_comparison_patch',
          input: {
            comparisonSheetId: firstSheet?.id ?? 'unknown',
            summary: request.messages.at(-1)?.content ?? 'Spreadsheet edit',
            operations,
          },
        }],
      }
    }
    if (/\b(go to|open|navigate|show me)\b/.test(last)) {
      return {
        reply: 'I can navigate the app to the relevant page.',
        plan: ['Move the visible app to the requested page.'],
        toolCalls: [{
          id: 'call-navigate',
          toolId: 'site.navigate',
          input: { path: '/quote-requests', reason: 'User asked to navigate or view procurement work.' },
        }],
      }
    }
    return {
      reply: 'NO API KEY',
      plan: [],
      toolCalls: [],
    }
  }
}

export function defaultPlanner(): LlmPlanner {
  if (process.env.OPENAI_API_KEY) return new OpenAIPlanner(process.env.OPENAI_API_KEY)
  return new DeterministicPlanner()
}
