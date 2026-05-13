import path from 'path'
import fs from 'fs'
import { expect, test } from '@playwright/test'
import { authenticatePage } from './helpers/auth'
import { PROJECT_ID } from './helpers/procurement'

const BASE_COMPARISON_FIXTURE = path.join(
  process.cwd(),
  '..',
  '..',
  '..',
  'data',
  'test_files',
  '20-base-comparison-plus-vendor-tabs.xlsx',
)

test.describe('Quote comparison workspace', () => {
  test.beforeEach(async ({ page }) => {
    await authenticatePage(page)
  })

  test('lets the spreadsheet occupy the viewport after the overview scrolls away', async ({ page }) => {
    const response = await page.request.post('/api/external-quote-import', {
      multipart: {
        projectId: PROJECT_ID,
        file: {
          name: '20-base-comparison-plus-vendor-tabs.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: fs.readFileSync(BASE_COMPARISON_FIXTURE),
        },
      },
    })
    expect(response.ok()).toBe(true)
    const body = await response.json() as { redirectTo: string }
    await page.goto(body.redirectTo)

    const overview = page.getByTestId('rfq-comparison-overview')
    const workspace = page.getByTestId('rfq-comparison-sheet-workspace')
    await expect(overview).toBeVisible()
    await expect(workspace).toBeVisible()

    await page.evaluate(() => {
      const main = document.querySelector('main')
      const workspaceElement = document.querySelector('[data-testid="rfq-comparison-sheet-workspace"]') as HTMLElement | null
      if (main && workspaceElement) main.scrollTop = workspaceElement.offsetTop
    })

    const viewport = page.viewportSize()
    const workspaceBox = await workspace.boundingBox()
    const overviewBox = await overview.boundingBox()

    expect(viewport).not.toBeNull()
    expect(workspaceBox).not.toBeNull()
    expect(overviewBox).not.toBeNull()
    expect(workspaceBox!.height).toBeGreaterThan((viewport!.height - 64) * 0.85)
    expect(overviewBox!.y + overviewBox!.height).toBeLessThanOrEqual(80)
  })
})
