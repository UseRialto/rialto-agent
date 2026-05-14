import { describe, expect, it } from 'vitest'
import { comparisonSheetVersionSchemaStatements } from './comparison-sheet-version-schema'

describe('comparisonSheetVersionSchemaStatements', () => {
  it('bootstraps durable workbook history tables when a local database is behind migrations', () => {
    const statements = comparisonSheetVersionSchemaStatements().join('\n')

    expect(statements).toContain('CREATE TABLE IF NOT EXISTS "comparison_sheet_versions"')
    expect(statements).toContain('ALTER TABLE "comparison_sheet_views" ADD COLUMN IF NOT EXISTS "current_version_id" integer')
    expect(statements).toContain('CREATE INDEX IF NOT EXISTS "idx_comparison_sheet_versions_rfq_created"')
  })
})
