import { expect, test } from '@playwright/test'
import { authenticatePage } from './helpers/auth'
import { PROJECT_ID } from './helpers/procurement'

test.describe('Contractor project dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await authenticatePage(page)
  })

  test('shows procurement tabs, creation CTAs, and purchase-order tab routing', async ({ page }) => {
    await page.goto(`/contractor/projects/${PROJECT_ID}`)

    await expect(page.getByRole('heading', { name: /Riverton Commons Office Park/i })).toBeVisible()
    await expect(page.getByRole('link', { name: '+ Create RFQ' })).toBeVisible()
    await expect(page.getByRole('link', { name: '+ Create RFP' })).toBeVisible()

    for (const tab of ['All', 'Drafts', 'Active', 'Closed', 'Purchase Orders']) {
      await expect(page.getByRole('link', { name: tab })).toBeVisible()
    }

    await expect(page.getByText('po_offered')).toHaveCount(0)

    await page.getByRole('link', { name: 'Purchase Orders' }).click()
    await expect(page).toHaveURL(new RegExp(`/contractor/projects/${PROJECT_ID}\\?status=purchase_orders`))
    await expect(
      page.getByText(/No purchase orders yet for this project|RFQ \/ Order|Open Track Orders/i),
    ).toBeVisible()
  })
})
