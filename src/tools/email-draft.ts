import { z } from 'zod'
import type { ToolDefinition } from '../domain/types.js'

export const emailDraftInputSchema = z.object({
  quoteRequestId: z.string().optional(),
  vendorId: z.string().optional(),
  to: z.array(z.string().email()).default([]),
  cc: z.array(z.string().email()).default([]),
  subject: z.string().default(''),
  body: z.string().default(''),
  attachments: z.array(z.object({
    id: z.string(),
    filename: z.string(),
  })).default([]),
})

export type EmailDraftInput = z.infer<typeof emailDraftInputSchema>

export interface EmailDraftOutput {
  action: 'show-email-draft'
  draft: EmailDraftInput
  sendPolicy: 'user-must-send'
}

export const emailDraftTool: ToolDefinition<EmailDraftInput, EmailDraftOutput> = {
  id: 'email.draft_vendor_outreach',
  surface: 'email-draft',
  description: 'Compose recipients, subject, body, and attachments in a visible email draft. Rialto never sends it automatically.',
  visibleToUser: true,
  mutatesPersistentData: false,
  requiresUserApproval: true,
  inputSchema: emailDraftInputSchema,
  async execute(input) {
    const draft = emailDraftInputSchema.parse(input)
    return { action: 'show-email-draft', draft, sendPolicy: 'user-must-send' }
  },
}

