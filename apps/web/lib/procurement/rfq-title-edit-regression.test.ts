import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = process.cwd()

describe('RFQ title edits', () => {
  it('use a targeted title update instead of resaving the full RFQ workbook graph', () => {
    const source = readFileSync(join(repoRoot, 'apps/web/app/api/rfqs/[rfqId]/title/route.ts'), 'utf8')

    expect(source).toContain('updateRFQTitle')
    expect(source).not.toContain('saveRFQ')
  })

  it('do not refresh the live workbook page after title-only edits', () => {
    const source = readFileSync(join(repoRoot, 'apps/web/app/contractor/projects/[projectId]/rfqs/[rfqId]/_components/EditableRFQTitle.tsx'), 'utf8')

    expect(source).not.toContain('router.refresh')
    expect(source).not.toContain('useRouter')
  })
})
