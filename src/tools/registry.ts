import type { ToolDefinition, ToolExecutionContext, ToolResult } from '../domain/types.js'
import { z } from 'zod'
import { documentReadTool } from './document-read.js'
import { emailDraftTool } from './email-draft.js'
import { navigateTool } from './navigation.js'
import { spreadsheetEditTool } from './spreadsheet-edit.js'

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>()

  constructor(tools: ToolDefinition[]) {
    for (const tool of tools) this.tools.set(tool.id, tool)
  }

  list() {
    return [...this.tools.values()].map((tool) => ({
      id: tool.id,
      productModule: tool.productModule,
      surface: tool.surface,
      description: tool.description,
      inputSchema: toJsonSchema(tool.inputSchema),
      visibleToUser: tool.visibleToUser,
      mutatesPersistentData: tool.mutatesPersistentData,
      requiresUserApproval: tool.requiresUserApproval,
    }))
  }

  get(id: string) {
    return this.tools.get(id)
  }

  async execute(callId: string, toolId: string, input: unknown, context: ToolExecutionContext): Promise<ToolResult> {
    const tool = this.get(toolId)
    if (!tool) {
      return { callId, toolId, status: 'error', summary: `Unknown tool: ${toolId}` }
    }
    try {
      const data = await tool.execute(input, context)
      return {
        callId,
        toolId,
        status: tool.requiresUserApproval ? 'needs-user-action' : 'ok',
        summary: toolSummary(tool.surface, tool.requiresUserApproval),
        data,
      }
    } catch (error) {
      return {
        callId,
        toolId,
        status: 'error',
        summary: error instanceof Error ? error.message : 'Tool execution failed.',
      }
    }
  }
}

function toJsonSchema(schema: unknown) {
  try {
    return z.toJSONSchema(schema as never)
  } catch {
    return undefined
  }
}

function toolSummary(surface: ToolDefinition['surface'], requiresUserApproval: boolean) {
  if (surface === 'email-draft') return 'Prepared a visible email draft for user review.'
  if (surface === 'spreadsheet-edit') return 'Prepared a visible spreadsheet edit preview for user review.'
  if (surface === 'document-read') return 'Extracted document text for review.'
  if (surface === 'navigation') return 'Prepared visible app navigation.'
  return requiresUserApproval ? 'Prepared visible user-reviewed action.' : 'Tool completed.'
}

export const defaultToolRegistry = new ToolRegistry([
  navigateTool,
  emailDraftTool,
  spreadsheetEditTool,
  documentReadTool,
])
