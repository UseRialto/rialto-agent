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

  test('adds another quote import to an existing comparison and renders the new vendor', async ({ page }) => {
    const initialResponse = await page.request.post('/api/external-quote-import', {
      multipart: {
        projectId: PROJECT_ID,
        rfqName: 'Playwright Add Quote Comparison',
        file: {
          name: 'initial-vendor.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from([
            'Line #,Part No,Material Name,Required Qty,UOM,Vendor,Quoted Unit Cost,Extended Cost,ETA,Clarifications',
            'A001,250CH-33,2 1/2 in 22ga CH Stud 10 ft,2420,LF,Initial Supply,1.10,2662,14 days,',
            'A002,250JR-33,2 1/2 in 20ga J Track 12 ft,458,LF,Initial Supply,1.17,535.86,14 days,',
          ].join('\n')),
        },
      },
    })
    expect(initialResponse.ok()).toBe(true)
    const initialBody = await initialResponse.json() as { rfqId: string; redirectTo: string }
    await page.goto(initialBody.redirectTo)

    const workspace = page.getByTestId('rfq-comparison-sheet-workspace')
    await expect(workspace).toBeVisible()
    await expect(workspace.getByRole('button', { name: 'Add Quote' })).toBeVisible()

    const appendResponse = await page.request.post(`/api/rfqs/${initialBody.rfqId}/external-quote-import`, {
      multipart: {
        file: {
          name: 'added-vendor.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from([
            'Line #,Part No,Material Name,Required Qty,UOM,Vendor,Quoted Unit Cost,Extended Cost,ETA,Clarifications',
            'A001,250CH-33,2 1/2 in 22ga CH Stud 10 ft,2420,LF,Added Supply,1.06,2565.20,9 days,',
            'A002,250JR-33,2 1/2 in 20ga J Track 12 ft,458,LF,Added Supply,1.13,517.54,9 days,',
          ].join('\n')),
        },
      },
    })
    expect(appendResponse.ok()).toBe(true)
    const appendBody = await appendResponse.json() as { redirectTo: string; addedVendorCount: number }
    expect(appendBody.addedVendorCount).toBe(1)

    await page.goto(appendBody.redirectTo)
    await expect(workspace).toBeVisible()
    await expect(page.getByText('Added Supply').first()).toBeVisible()
    await expect(page.getByText('$2,565').first()).toBeVisible()
  })
})
