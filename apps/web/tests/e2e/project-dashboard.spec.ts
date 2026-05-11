import { expect, test } from '@playwright/test'
import { authenticatePage } from './helpers/auth'
import { PROJECT_ID } from './helpers/procurement'

test.describe('Contractor project dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await authenticatePage(page)
  })

  test('shows quote request tabs and creation CTAs', async ({ page }) => {
    await page.goto(`/contractor/projects/${PROJECT_ID}`)

    await expect(page.getByRole('heading', { name: /Riverton Commons Office Park/i })).toBeVisible()
    await expect(page.getByRole('link', { name: '+ Create RFQ' })).toBeVisible()

    for (const tab of ['All', 'Drafts', 'Active', 'Closed']) {
      await expect(page.getByRole('link', { name: tab })).toBeVisible()
    }
  })
})
