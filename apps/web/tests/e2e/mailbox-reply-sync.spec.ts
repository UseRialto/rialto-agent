import { expect, test } from '@playwright/test'
import { authenticatePage } from './helpers/auth'
import { PROJECT_ID } from './helpers/procurement'

test.describe('Mailbox reply sync', () => {
  test.beforeEach(async ({ page }) => {
    await authenticatePage(page)
  })

  test('exposes reply sync from the quote comparison page and mailbox panel from message center', async ({ page }) => {
    const response = await page.request.post('/api/external-quote-import', {
      multipart: {
        projectId: PROJECT_ID,
        rfqName: `Mailbox Reply Sync ${Date.now()}`,
        file: {
          name: 'mailbox-reply-sync.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from([
            'Line #,Part No,Material Name,Required Qty,UOM,Vendor,Quoted Unit Cost,Extended Cost,ETA,Clarifications',
            'A001,MAIL-1,Mailbox reply sync smoke item,10,EA,Mailbox Supply,5,50,2 days,',
          ].join('\n')),
        },
      },
    })
    const responseText = await response.text()
    expect(response.ok(), responseText).toBe(true)
    const body = JSON.parse(responseText) as { rfqId: string; redirectTo: string }

    await page.goto(body.redirectTo)
    await expect(page.getByTestId('rfq-comparison-sheet-workspace')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sync Replies' })).toHaveCount(0)

    await page.goto(`/contractor/projects/${PROJECT_ID}/rfqs/${body.rfqId}?section=message-center`)
    await expect(page.getByRole('heading', { name: 'Mailbox & Quote Sync' })).toBeVisible()
    await expect(page.getByText('Connected mailbox replies are ingested automatically.')).toBeVisible()
    await expect(page.getByText('Recent Email Activity')).toBeVisible()
  })
})
