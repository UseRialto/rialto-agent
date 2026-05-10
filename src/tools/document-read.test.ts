import { describe, expect, it } from 'vitest'
import { documentReadTool } from './document-read.js'
import type { ToolExecutionContext } from '../domain/types.js'

const context: ToolExecutionContext = {
  requestId: 'req-1',
  userContext: {
    generatedAt: new Date().toISOString(),
    user: {
      id: 'user-1',
      contractorOrganizationId: 'org-1',
      role: 'estimator',
      name: 'Estimator One',
      email: 'estimator@example.com',
    },
    pages: [],
    data: { projects: [], quoteRequests: [], comparisonSheets: [], vendorDirectory: [] },
    procurementMemory: { materialNamingPatterns: [], unitNormalizationHints: [], recentSelectedVendors: [] },
  },
}

describe('documentReadTool', () => {
  it('extracts CSV/text bytes', async () => {
    const output = await documentReadTool.execute({
      filename: 'takeoff.csv',
      bytesBase64: Buffer.from('Description,Qty,Unit\nDoor,10,EA').toString('base64'),
    }, context)
    expect(output.sourceKind).toBe('csv')
    expect(output.text).toContain('Door')
  })
})

