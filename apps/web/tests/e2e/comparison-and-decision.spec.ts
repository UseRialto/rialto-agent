import { expect, test } from '@playwright/test'
import { authenticatePage } from './helpers/auth'

test.describe('Comparison dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await authenticatePage(page)
  })

  test('renders the quote comparison analytics workbook and assistant controls', async ({ page }) => {
    await page.goto('/demo/quote-comparison-analytics')

    await expect(page.getByRole('heading', { name: 'Building 14 Quote Comparison' })).toBeVisible()
    await expect(page.getByText('Building 14 Drywall Package Quote Comparison')).toBeVisible()
    await expect(page.getByText('L n W Supply - San Diego').first()).toBeVisible()
    await expect(page.getByText('Acme Drywall Supply').first()).toBeVisible()
    await expect(page.getByText('Lowest line total')).toBeVisible()
    await expect(page.getByText('Pricing mistake', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'AI Assistant' })).toBeVisible()
  })
})
