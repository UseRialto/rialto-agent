import { z } from 'zod'
import type { ToolDefinition } from '../domain/types.js'

export const navigateInputSchema = z.object({
  path: z.string().min(1).refine((path) => path.startsWith('/'), 'Path must be an app-relative route.'),
  reason: z.string().optional(),
})

export type NavigateInput = z.infer<typeof navigateInputSchema>

export interface NavigateOutput {
  action: 'navigate'
  path: string
  reason?: string
}

export const navigateTool: ToolDefinition<NavigateInput, NavigateOutput> = {
  id: 'site.navigate',
  productModule: 'app-shell',
  surface: 'navigation',
  description: 'Navigate the visible app to an app route while the user is watching.',
  visibleToUser: true,
  mutatesPersistentData: false,
  requiresUserApproval: false,
  inputSchema: navigateInputSchema,
  async execute(input) {
    const parsed = navigateInputSchema.parse(input)
    return { action: 'navigate', path: parsed.path, reason: parsed.reason }
  },
}
