import { expect, test } from '@playwright/test'
import { authenticatePage } from './helpers/auth'
import { PROJECT_ID, SAMPLE_CSV_PATH, advanceWizard, gotoProject, openDraftFromProject, uniqueTitle } from './helpers/procurement'

test.describe('RFQ authoring flow', () => {
  test.setTimeout(120_000)

  test.beforeEach(async ({ page }) => {
    await authenticatePage(page)
  })

  test('supports CSV import, off-platform invites, draft reopen, and publish', async ({ page }) => {
    const title = uniqueTitle('E2E RFQ Authoring')

    await page.goto(`/contractor/projects/${PROJECT_ID}/rfqs/new`)
    await page.locator('input[type="text"]').first().fill(title)
    await page.getByPlaceholder('e.g. Structural Steel, Ready-Mix Concrete, Roofing').fill('Concrete')
    await page.getByLabel('Import takeoff file').setInputFiles(SAMPLE_CSV_PATH)

    await expect(page.getByRole('textbox', { name: 'Description or SKU' }).first()).toHaveValue('CONC-4000-01')
    await expect(page.locator('input[type="number"]').first()).toHaveValue('120')
    await expect(page.locator('select').first()).toHaveValue('cy')

    await page.getByRole('button', { name: 'Next', exact: true }).click()
    const vendorInput = page.getByPlaceholder('Vendor name or email…')
    await vendorInput.fill('qa-vendor@example.com')
    await vendorInput.press('Enter')
    await page.getByPlaceholder('First name').fill('Quinn')
    await page.getByPlaceholder('Last name').fill('Vendor')
    await page.locator('label[title="Attach files"] input[type="file"]').setInputFiles(SAMPLE_CSV_PATH)
    await expect(page.getByText('sample-bom-concrete.csv')).toBeVisible()

    await page.getByRole('button', { name: 'Review RFQ' }).click()
    await expect(page.getByText('Vendor Email Preview')).toBeVisible()
    await expect(page.getByText('Quinn Vendor · qa-vendor@example.com')).toBeVisible()
    await expect(page.getByText('Email Draft')).toBeVisible()
    await expect(page.getByText('First Name')).toBeVisible()

    await page.getByRole('button', { name: 'Save Draft' }).click()
    await page.waitForURL(`/contractor/projects/${PROJECT_ID}`)

    await openDraftFromProject(page, title)
    await expect(page.getByRole('heading', { name: 'Edit RFQ Draft' })).toBeVisible()
    await expect(page.locator('input[type="text"]').first()).toHaveValue(title)

    await advanceWizard(page, 'Next', page.getByRole('heading', { name: 'Invite vendors' }))
    await advanceWizard(page, 'Review RFQ', page.getByText('Vendor Email Preview'))
    await Promise.all([
      page.waitForURL(`/contractor/projects/${PROJECT_ID}`),
      page.getByRole('button', { name: 'Publish RFQ →' }).click(),
    ])

    const publishedRow = page.getByRole('row').filter({ hasText: title })
    await expect(publishedRow).toBeVisible()
    await expect(publishedRow).toContainText('Active')
    const publishedHref = await publishedRow.getByRole('link', { name: 'View' }).getAttribute('href')
    expect(publishedHref).toBeTruthy()
    await page.goto(publishedHref!)

    await expect(page).toHaveURL(new RegExp(`/contractor/projects/${PROJECT_ID}/rfqs/(?!new(?:[/?]|$))[^/?]+`))
    await expect(page.getByText(title).first()).toBeVisible()
    await expect(page.getByText('RFQ published - waiting for quotes to come in…')).toBeVisible()

    await gotoProject(page)
    await expect(page.getByRole('row').filter({ hasText: title })).toBeVisible()
  })
})
