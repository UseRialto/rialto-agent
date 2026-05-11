import { expect, test } from '@playwright/test'
import { authenticatePage } from './helpers/auth'
import { PROJECT_ID, createRfQViaWizard, openDraftFromProject, publishAndCaptureRfqId, uniqueTitle } from './helpers/procurement'

test.describe('RFP authoring flow', () => {
  test.beforeEach(async ({ page }) => {
    await authenticatePage(page)
  })

  test('supports the dedicated RFP route, AI spec workflow, draft reopen, and detail rendering', async ({ page }) => {
    const title = uniqueTitle('E2E Materials RFP')

    await createRfQViaWizard(page, {
      requestType: 'rfp',
      title,
      category: 'Concrete',
      includeOffPlatformInvite: true,
      runRfpAssistant: true,
    })

    await expect(page.getByText('RFP Brief')).toBeVisible()
    await expect(page.getByText('AI Spec Summary')).toBeVisible()

    await page.getByRole('button', { name: /rialto\.app\/vendor\/magic-rfq\/preview-link/i }).click()
    await expect(page.getByText('Secure quote form preview')).toBeVisible()
    await expect(page.getByText('RFP Brief')).toBeVisible()
    await page.getByRole('button', { name: 'Close' }).click()

    await page.getByRole('button', { name: 'Save Draft' }).click()
    await page.waitForURL(`/contractor/projects/${PROJECT_ID}`)

    await openDraftFromProject(page, title)
    await expect(page.getByRole('heading', { name: 'Edit RFP Draft' })).toBeVisible()
    await expect(page.locator('input[type="text"]').first()).toHaveValue(title)
    await expect(page.getByPlaceholder('What are you trying to buy or solve for on this package?')).toHaveValue(/Validate current construction materials RFP workflow/i)

    await page.getByRole('button', { name: 'Next →' }).click()
    await page.getByRole('button', { name: 'Review RFP →' }).click()
    const rfqId = await publishAndCaptureRfqId(page, 'rfp')

    await expect(page).toHaveURL(new RegExp(`/contractor/projects/${PROJECT_ID}/rfqs/${rfqId}`))
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
    await expect(page.getByText('RFP Brief')).toBeVisible()
    await expect(page.getByText('AI Spec Assistant Summary')).toBeVisible()
    await expect(page.getByText('Reference Files')).toBeVisible()
  })
})
