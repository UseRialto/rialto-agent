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

  test('opens and reopens the bottom-center AI assistant pill bar', async ({ page }) => {
    await page.goto(`/contractor/projects/${PROJECT_ID}`)

    const collapsedAssistant = page.getByRole('button', { name: 'AI Assistant' })
    await expect(collapsedAssistant).toBeVisible()

    await collapsedAssistant.click()
    const assistant = page.locator('section[aria-label="AI Assistant"]')
    await expect(assistant).toBeVisible()
    await expect(assistant.getByPlaceholder('Ask Rialto...')).toBeVisible()
    await expect(assistant.getByRole('button', { name: 'Attach file' })).toBeVisible()

    await assistant.getByRole('button', { name: 'Close assistant' }).click()
    await expect(collapsedAssistant).toBeVisible()

    await collapsedAssistant.click()
    await expect(page.locator('section[aria-label="AI Assistant"]')).toBeVisible()
  })
})
