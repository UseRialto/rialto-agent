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

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  id: string
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
  currentPage?: {
    path: string
    title?: string
  }
}

export interface AgentTurnResponse {
  requestId: string
  reply: string
  plan?: string[]
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

