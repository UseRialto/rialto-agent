import { expect, test } from '@playwright/test'
import { authenticatePage } from './helpers/auth'

test.describe('Comparison dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await authenticatePage(page)
  })

  test('renders sortable vendor summary columns for price, lead time, and terms', async ({ page }) => {
    await page.goto('/contractor/demo/quote-comparison')

    const summaryCard = page.locator('div').filter({ has: page.getByText('Sortable Bid Summary') }).first()
    await expect(summaryCard).toBeVisible()
    await expect(summaryCard.getByRole('button', { name: 'Payment' })).toBeVisible()
    await expect(summaryCard.getByRole('button', { name: 'Deposit' })).toBeVisible()
    await expect(summaryCard.getByRole('button', { name: 'Credit' })).toBeVisible()
    await expect(summaryCard.getByRole('button', { name: 'Shipping' })).toBeVisible()
    await expect(summaryCard.getByRole('button', { name: 'Spec Compliance' })).toBeVisible()

    const rows = summaryCard.locator('tbody tr')
    await expect(rows.first()).toContainText('Pacific Steel Supply')

    await summaryCard.getByRole('button', { name: /^Lead Time$/i }).click()
    await expect(rows.first()).toContainText('Consolidated Materials')

    await summaryCard.getByRole('button', { name: /^Payment$/i }).click()
    await expect(rows.first()).toContainText('Consolidated Materials')

    await expect(page.getByRole('button', { name: 'Demo Only' })).toBeVisible()
  })
})
