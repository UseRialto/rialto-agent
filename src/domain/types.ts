export type ISODateTime = string

export type UserRole = 'estimator' | 'admin' | 'vendor'

export interface AuthenticatedUser {
  id: string
  contractorOrganizationId: string
  role: UserRole
  name: string
  email: string
}

export interface UserContext {
  generatedAt: ISODateTime
  user: AuthenticatedUser
  pages: Array<{
    path: string
    title: string
    entityType?: 'project' | 'quote-request' | 'comparison-sheet' | 'vendor-directory'
    entityId?: string
  }>
  data: {
    projects: ProjectSummary[]
    quoteRequests: QuoteRequestSummary[]
    comparisonSheets: ComparisonSheetSummary[]
    vendorDirectory: VendorSummary[]
  }
  procurementMemory: ProcurementMemory
}

export interface QuoteComparisonTurnContext {
  currentView?: unknown
  sheetSchema?: unknown
  snapshot?: unknown
}

export interface AgentRequestContext {
  currentPage?: {
    path: string
    title?: string
  }
  quoteComparison?: QuoteComparisonTurnContext
}

export interface ProjectSummary {
  id: string
  name: string
  location?: string
}

export interface QuoteRequestSummary {
  id: string
  projectId: string
  title: string
  status: 'draft' | 'sent' | 'collecting-responses' | 'comparison' | 'closed'
  expiresAt?: ISODateTime
  vendorInvitationCount: number
  responseCount: number
}

export interface ComparisonSheetSummary {
  id: string
  quoteRequestId: string
  title: string
  unresolvedReviewHighlightCount: number
  updatedAt: ISODateTime
}

export interface VendorSummary {
  id: string
  name: string
  contacts: Array<{
    id: string
    name?: string
    email: string
    suppressed?: boolean
  }>
}

export interface ProcurementMemory {
  preferredEmailTone?: string
  materialNamingPatterns: string[]
  unitNormalizationHints: string[]
  recentSelectedVendors: Array<{
    vendorId: string
    materialDescription: string
    selectedAt: ISODateTime
  }>
}

export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
}

export type ToolSurface = 'navigation' | 'email-draft' | 'spreadsheet-edit' | 'document-read'

export type ProductModule = 'requesting-quotes' | 'vendor-response-intake' | 'quote-comparison' | 'app-shell'

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  id: string
  productModule: ProductModule
  surface: ToolSurface
  description: string
  visibleToUser: boolean
  mutatesPersistentData: boolean
  requiresUserApproval: boolean
  inputSchema: unknown
  execute(input: TInput, context: ToolExecutionContext): Promise<TOutput>
}

export interface ToolExecutionContext {
  userContext: UserContext
  requestId: string
}

export interface AgentToolCall {
  id: string
  toolId: string
  input: unknown
}

export interface AgentTurnRequest {
  requestId: string
  user: AuthenticatedUser
  messages: AgentMessage[]
  debug?: boolean
  currentPage?: {
    path: string
    title?: string
  }
  quoteComparison?: QuoteComparisonTurnContext
}

export interface AgentTurnResponse {
  requestId: string
  status: 'completed' | 'needs_clarification' | 'blocked' | 'tool_error'
  reply: string
  plan?: string[]
  proposal?: AgentProposal
  clarification?: {
    question: string
    choices?: Array<{ id: string; label: string }>
  }
  reason?: string
  debugTrace?: AgentDebugTrace
  toolCalls: AgentToolCall[]
  toolResults: ToolResult[]
}

export interface ToolResult {
  callId: string
  toolId: string
  status: 'ok' | 'needs-user-action' | 'error'
  summary: string
  data?: unknown
}

export type AgentProposal = ComparisonPatchProposal

export interface ComparisonPatchProposal {
  kind: 'comparison-patch-proposal'
  summary: string
  approvalMode: 'approve-all-or-discard'
  operations: ComparisonOperation[]
  warnings?: string[]
  provenanceNotes?: ComparisonProvenanceNote[]
}

export interface ComparisonPatchFragment {
  summary: string
  operations: ComparisonOperation[]
  warnings?: string[]
  provenanceNotes?: ComparisonProvenanceNote[]
}

export type ComparisonOperation =
  | {
      kind: 'set-cell'
      rowKey: string
      colKey: string
      value: string | number | boolean | null
      note?: string
    }
  | {
      kind: 'add-highlight'
      id: string
      selector:
        | { kind: 'cell'; rowKey: string; colKey: string }
        | { kind: 'rule'; rule: 'fastest-lead-per-row' | 'lowest-price-per-row' | 'highest-coverage-overall' }
      color: 'red' | 'orange' | 'blue' | 'green' | 'yellow' | string
      note?: string
    }
  | {
      kind: 'hide-column' | 'delete-column' | 'show-column'
      colKey: string
    }
  | {
      kind: 'hide-row' | 'delete-row' | 'show-row'
      rowKey: string
    }
  | {
      kind: 'set-column-label'
      colKey: string
      label: string
    }
  | {
      kind: 'insert-column'
      colKey: string
      label: string
      afterColKey?: string
      beforeColKey?: string
    }
  | {
      kind: 'insert-row'
      rowKey: string
      afterRowKey?: string
      beforeRowKey?: string
      initialValues?: Record<string, string | number | boolean | null>
    }
  | {
      kind: 'add-derived-column'
      colKey: string
      label: string
      formula: string
      afterColKey?: string
      beforeColKey?: string
    }
  | {
      kind: 'sort-rows'
      colKey: string
      direction: 'asc' | 'desc'
    }
  | {
      kind: 'filter-blank-rows'
      colKey: string
    }
  | {
      kind: 'set-selection-state'
      rowKey: string
      state: 'selected-vendor' | 'no-award' | 'deferred' | 'out-of-scope'
      vendorId?: string
      reason?: string
    }

export interface ComparisonProvenanceNote {
  rowKey?: string
  colKey?: string
  sourceId?: string
  note: string
}

export interface AgentDebugTrace {
  responseState: AgentTurnResponse['status']
  plan?: string[]
  toolCalls?: AgentToolCall[]
  toolResults?: ToolResult[]
  patchFragments?: ComparisonPatchFragment[]
  proposal?: AgentProposal
  warnings?: string[]
  errors?: string[]
}
