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

function quoteImportFormData(fields: Record<string, string>, files: Array<{ name: string; mimeType: string; buffer: Buffer }>) {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  for (const file of files) {
    form.append('files', new File([file.buffer], file.name, { type: file.mimeType }))
  }
  return form
}

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

  test('imports multiple quote files and appends multiple files into the existing comparison', async ({ page }) => {
    const initialResponse = await page.request.post('/api/external-quote-import', {
      multipart: quoteImportFormData(
        {
          projectId: PROJECT_ID,
          rfqName: 'Playwright Multi File Quote Comparison',
        },
        [
          {
            name: 'multi-initial-alpha.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from([
              'Line #,Part No,Material Name,Required Qty,UOM,Vendor,Quoted Unit Cost,Extended Cost,ETA,Clarifications',
              'M001,MF-001,Multi file gypsum board,100,EA,Multi Alpha Supply,10.00,1000.00,7 days,',
              'M002,MF-002,Multi file metal stud,250,LF,Multi Alpha Supply,2.00,500.00,7 days,',
            ].join('\n')),
          },
          {
            name: 'multi-initial-beta.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from([
              'Line #,Part No,Material Name,Required Qty,UOM,Vendor,Quoted Unit Cost,Extended Cost,ETA,Clarifications',
              'M001,MF-001,Multi file gypsum board,100,EA,Multi Beta Supply,9.50,950.00,9 days,',
              'M002,MF-002,Multi file metal stud,250,LF,Multi Beta Supply,2.10,525.00,9 days,',
            ].join('\n')),
          },
        ],
      ),
    })
    expect(initialResponse.ok()).toBe(true)
    const initialBody = await initialResponse.json() as { rfqId: string; redirectTo: string; vendorCount: number; lineItemCount: number }
    expect(initialBody.vendorCount).toBe(2)
    expect(initialBody.lineItemCount).toBe(2)

    await page.goto(initialBody.redirectTo)
    await expect(page.getByTestId('rfq-comparison-sheet-workspace')).toBeVisible()
    await expect(page.getByText('Multi Alpha Supply').first()).toBeVisible()
    await expect(page.getByText('Multi Beta Supply').first()).toBeVisible()

    const appendResponse = await page.request.post(`/api/rfqs/${initialBody.rfqId}/external-quote-import`, {
      multipart: quoteImportFormData(
        {},
        [
          {
            name: 'multi-append-gamma.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from([
              'Line #,Part No,Material Name,Required Qty,UOM,Vendor,Quoted Unit Cost,Extended Cost,ETA,Clarifications',
              'M001,MF-001,Multi file gypsum board,100,EA,Multi Gamma Supply,9.25,925.00,5 days,',
              'M002,MF-002,Multi file metal stud,250,LF,Multi Gamma Supply,1.95,487.50,5 days,',
              'M003,MF-003,Multi file access panel,12,EA,Multi Gamma Supply,120.00,1440.00,5 days,',
            ].join('\n')),
          },
          {
            name: 'multi-append-delta.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from([
              'Line #,Part No,Material Name,Required Qty,UOM,Vendor,Quoted Unit Cost,Extended Cost,ETA,Clarifications',
              'M001,MF-001,Multi file gypsum board,100,EA,Multi Delta Supply,9.75,975.00,6 days,',
              'M002,MF-002,Multi file metal stud,250,LF,Multi Delta Supply,2.05,512.50,6 days,',
              'M003,MF-003,Multi file access panel,12,EA,Multi Delta Supply,118.00,1416.00,6 days,',
            ].join('\n')),
          },
        ],
      ),
    })
    expect(appendResponse.ok()).toBe(true)
    const appendBody = await appendResponse.json() as { redirectTo: string; addedVendorCount: number; addedLineItemCount: number; vendorCount: number; lineItemCount: number }
    expect(appendBody.addedVendorCount).toBe(2)
    expect(appendBody.addedLineItemCount).toBe(1)
    expect(appendBody.vendorCount).toBe(4)
    expect(appendBody.lineItemCount).toBe(3)

    await page.goto(appendBody.redirectTo)
    const workspace = page.getByTestId('rfq-comparison-sheet-workspace')
    await expect(workspace).toBeVisible()
    await expect(page.getByText('Multi Gamma Supply').first()).toBeVisible()
    await expect(page.getByText('Multi Delta Supply').first()).toBeVisible()
    await expect(page.getByText('Multi file access panel').first()).toBeVisible()
    await expect(page.getByText('$1,440').first()).toBeVisible()
    await expect(page.getByText('$1,416').first()).toBeVisible()
  })

  test('copies and pastes a selected cell range in the comparison grid', async ({ page }) => {
    const response = await page.request.post('/api/external-quote-import', {
      multipart: {
        projectId: PROJECT_ID,
        rfqName: 'Playwright Copy Paste Comparison',
        file: {
          name: 'copy-paste-vendor.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from([
            'Line #,Part No,Material Name,Required Qty,UOM,Vendor,Quoted Unit Cost,Extended Cost,ETA,Clarifications',
            'A001,250CH-33,Original first description,2420,LF,Copy Supply,1.10,2662,14 days,',
            'A002,250JR-33,Original second description,458,LF,Copy Supply,1.17,535.86,14 days,',
            'A003,250JS-33,Target first description,1094,LF,Copy Supply,1.25,1367.50,14 days,',
            'A004,362S125-30,Target second description,606,LF,Copy Supply,1.31,793.86,14 days,',
          ].join('\n')),
        },
      },
    })
    expect(response.ok()).toBe(true)
    const body = await response.json() as { redirectTo: string }
    await page.goto(body.redirectTo)

    const workspace = page.getByTestId('rfq-comparison-sheet-workspace')
    await expect(workspace).toBeVisible()
    const sourceTop = page.locator('[data-testid="comparison-grid-cell"][data-row-index="3"][data-col-index="1"]')
    const sourceBottom = page.locator('[data-testid="comparison-grid-cell"][data-row-index="4"][data-col-index="1"]')
    const targetTop = page.locator('[data-testid="comparison-grid-cell"][data-row-index="5"][data-col-index="1"]')
    await expect(sourceTop).toContainText('Original first description')
    await expect(sourceBottom).toContainText('Original second description')

    await sourceTop.click()
    await sourceBottom.click({ modifiers: ['Shift'] })
    await expect(workspace).toContainText('2x1 selected')
    const copied = await page.evaluate(() => {
      const grid = document.querySelector('[data-testid="comparison-grid-container"]')
      if (!grid) throw new Error('Comparison grid not found')
      const clipboardData = new DataTransfer()
      const event = new Event('copy', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', { value: clipboardData })
      grid.dispatchEvent(event)
      return clipboardData.getData('text/plain')
    })
    expect(copied).toBe(['Original first description', 'Original second description'].join('\n'))
    await targetTop.click()
    await page.evaluate((text) => {
      const grid = document.querySelector('[data-testid="comparison-grid-container"]')
      if (!grid) throw new Error('Comparison grid not found')
      const clipboardData = new DataTransfer()
      clipboardData.setData('text/plain', text)
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', { value: clipboardData })
      grid.dispatchEvent(event)
    }, copied)

    await expect(page.locator('[data-testid="comparison-grid-cell"][data-row-index="5"][data-col-index="1"]')).toContainText('Original first description')
    await expect(page.locator('[data-testid="comparison-grid-cell"][data-row-index="6"][data-col-index="1"]')).toContainText('Original second description')
  })
})
