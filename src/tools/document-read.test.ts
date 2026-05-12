import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
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

  it('extracts customer-style multi-supplier XLSX bytes uploaded through chat', async () => {
    const fixturePath = path.join('/Users/tomasz/Desktop/rialto/data/test_files', '04-multi-supplier-wide-comparison.xlsx')
    const output = await documentReadTool.execute({
      filename: path.basename(fixturePath),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      bytesBase64: fs.readFileSync(fixturePath).toString('base64'),
    }, context)

    expect(output.sourceKind).toBe('excel')
    expect(output.text).toContain('L n W Supply - San Diego Unit Price')
    expect(output.text).toContain('BuildCo Materials Total')
    expect(output.text).toContain('Metro Door Hardware Notes')
    expect(output.warnings).toEqual([])
  })

  it('extracts real customer-style CSV, workbook, and PDF fixtures uploaded through chat', async () => {
    const fixtures = [
      {
        filename: '01-multi-supplier-wide-comparison.csv',
        expectedKind: 'csv',
        expectedText: ['L n W Supply - San Diego Unit Price', 'BuildCo Materials Total', 'Metro Door Hardware Notes'],
      },
      {
        filename: '06-multi-supplier-grouped-sheets.xlsx',
        expectedKind: 'excel',
        expectedText: ['Sheet: L n W Supply - San Diego', 'Sheet: Acme Drywall Supply', 'GWB-12MR'],
      },
      {
        filename: '18-multi-supplier-pdf-matrix.pdf',
        expectedKind: 'pdf',
        expectedText: ['Multi-supplier quote matrix', '250CH-33', 'Acoustical Sealant'],
      },
    ] as const

    for (const fixture of fixtures) {
      const fixturePath = path.join('/Users/tomasz/Desktop/rialto/data/test_files', fixture.filename)
      const output = await documentReadTool.execute({
        filename: fixture.filename,
        bytesBase64: fs.readFileSync(fixturePath).toString('base64'),
      }, context)

      expect(output.sourceKind).toBe(fixture.expectedKind)
      for (const expectedText of fixture.expectedText) {
        expect(output.text).toContain(expectedText)
      }
      expect(output.warnings).toEqual([])
    }
  })
})
