import { expect, test } from '@playwright/test'
import { authenticatePage } from './helpers/auth'
import { PROJECT_ID, SAMPLE_CSV_PATH, gotoProject, openDraftFromProject, publishAndCaptureRfqId, uniqueTitle } from './helpers/procurement'

test.describe('RFQ authoring flow', () => {
  test.beforeEach(async ({ page }) => {
    await authenticatePage(page)
  })

  test('supports CSV import, off-platform invites, draft reopen, and publish', async ({ page }) => {
    const title = uniqueTitle('E2E RFQ Authoring')

    await page.goto(`/contractor/projects/${PROJECT_ID}/rfqs/new`)
    await page.locator('input[type="text"]').first().fill(title)
    await page.getByPlaceholder('e.g. Structural Steel, Roofing, Glazing, HVAC Equipment').fill('Concrete')
    await page.getByLabel('Import takeoff file').setInputFiles(SAMPLE_CSV_PATH)
    await page.getByLabel('Reference files').setInputFiles(SAMPLE_CSV_PATH)

    await expect(page.getByText(/Imported \d+ items? from sample-bom-concrete\.csv/i)).toBeVisible()
    await expect(page.getByText('sample-bom-concrete.csv')).toBeVisible()
    await expect(page.getByPlaceholder('Material description').first()).toHaveValue('Ready-mix concrete 4000 PSI')

    await page.getByRole('button', { name: 'Next →' }).click()
    const vendorInput = page.getByPlaceholder('Vendor name or email…')
    await vendorInput.fill('qa-vendor@example.com')
    await vendorInput.press('Enter')
    await page.getByPlaceholder('First name').fill('Quinn')
    await page.getByPlaceholder('Last name').fill('Vendor')

    await page.getByRole('button', { name: 'Review RFQ →' }).click()
    await expect(page.getByText('Vendor Email Preview')).toBeVisible()
    await expect(page.getByText('Quinn Vendor · qa-vendor@example.com')).toBeVisible()
    await expect(page.getByLabel('Email body')).toContainText('Hello {{vendor_first_name}},')

    await page.getByRole('button', { name: 'Save Draft' }).click()
    await page.waitForURL(`/contractor/projects/${PROJECT_ID}`)

    await openDraftFromProject(page, title)
    await expect(page.getByRole('heading', { name: 'Edit RFQ Draft' })).toBeVisible()
    await expect(page.locator('input[type="text"]').first()).toHaveValue(title)

    await page.getByRole('button', { name: 'Next →' }).click()
    await page.getByRole('button', { name: 'Review RFQ →' }).click()
    const rfqId = await publishAndCaptureRfqId(page, 'rfq')

    await expect(page).toHaveURL(new RegExp(`/contractor/projects/${PROJECT_ID}/rfqs/${rfqId}`))
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
    await expect(page.getByText('Reference Files')).toBeVisible()
    await expect(page.getByText('sample-bom-concrete.csv')).toBeVisible()

    await gotoProject(page)
    await expect(page.getByRole('row').filter({ hasText: title })).toBeVisible()
  })
})
