import { expect, test } from '@playwright/test'
import { authenticatePage } from './helpers/auth'
import { PROJECT_ID, advanceWizard, createRfQViaWizard, openDraftFromProject, uniqueTitle } from './helpers/procurement'

test.describe('RFP authoring flow', () => {
  test.setTimeout(120_000)

  test.beforeEach(async ({ page }) => {
    await authenticatePage(page)
  })

  test('supports the dedicated RFP route, secure form preview, draft reopen, and detail rendering', async ({ page }) => {
    const title = uniqueTitle('E2E Materials RFP')

    await createRfQViaWizard(page, {
      requestType: 'rfp',
      title,
      category: 'Concrete',
      includeOffPlatformInvite: true,
    })

    await expect(page.getByText('RFP Brief')).toBeVisible()

    await page.getByRole('button', { name: 'Save Draft' }).click()
    await page.waitForURL(`/contractor/projects/${PROJECT_ID}`)

    await openDraftFromProject(page, title)
    await expect(page.getByRole('heading', { name: 'Edit RFP Draft' })).toBeVisible()
    await expect(page.locator('input[type="text"]').first()).toHaveValue(title)
    await expect(page.getByPlaceholder('What are you trying to buy or solve for on this package?')).toHaveValue(/Validate current construction materials RFP workflow/i)

    await advanceWizard(page, 'Next', page.getByRole('heading', { name: 'Invite vendors' }))
    await advanceWizard(page, 'Review RFP', page.getByText('Vendor Email Preview'))
    await Promise.all([
      page.waitForURL(`/contractor/projects/${PROJECT_ID}`),
      page.getByRole('button', { name: 'Publish RFP →' }).click(),
    ])

    const publishedRow = page.getByRole('row').filter({ hasText: title })
    await expect(publishedRow).toBeVisible()
    await expect(publishedRow).toContainText('Active')
    const publishedHref = await publishedRow.getByRole('link', { name: 'View' }).getAttribute('href')
    expect(publishedHref).toBeTruthy()
    await page.goto(publishedHref!)

    await expect(page).toHaveURL(new RegExp(`/contractor/projects/${PROJECT_ID}/rfqs/(?!new(?:[/?]|$))[^/?]+`))
    await expect(page.getByText(title).first()).toBeVisible()
    await expect(page.getByText('RFP published - waiting for quotes to come in…')).toBeVisible()
  })

  test('imports a vendor quote file in the secure form preview and applies matched cells', async ({ page }) => {
    await createRfQViaWizard(page, {
      requestType: 'rfp',
      title: uniqueTitle('E2E Magic Preview RFP'),
      category: 'Concrete',
      includeOffPlatformInvite: true,
    })

    await page.getByRole('button', { name: 'Preview secure quote form' }).click()
    await expect(page.getByText('Secure quote form preview')).toBeVisible()
    await page.locator('input[type="file"][accept*=".csv"]').first().setInputFiles({
      name: 'magic-form-concrete-quote.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from([
        'Supplier,Item,SKU,Description,Qty,Unit,Unit Price,Total Price,Lead Time,Notes',
        'Preview Supply,1,CONC-4000-01,Ready-mix concrete 4000 PSI,120,cy,101.25,12150.00,4 days,Exact',
        'Preview Supply,2,REBAR-5-60,#5 rebar Grade 60,18500,lbs,0.88,16280.00,6 days,Exact',
        'Preview Supply,3,FORM-PLY-34,Form plywood 3/4 in,240,sheets,23.50,5640.00,5 days,Exact',
        'Preview Supply,4,WWM-66-1010,Welded wire mesh 6x6 W1.4/W1.4,95,sheets,51.10,4854.50,7 days,Exact',
        'Preview Supply,5,PT-CABLE-12,Post-tension cable 1/2 in,3200,lf,1.42,4544.00,8 days,Exact',
        'Preview Supply,6,ANCHOR-58,Anchor bolts 5/8 in x 12 in,180,ea,4.75,855.00,3 days,Exact',
        'Preview Supply,7,VAPOR-15,Vapor barrier 15 mil,18500,sf,0.31,5735.00,5 days,Exact',
        'Preview Supply,8,EXP-JOINT-12,Expansion joint filler 1/2 in,640,lf,2.20,1408.00,4 days,Exact',
      ].join('\n')),
    })
    await expect(page.getByText('Applied 8 line items from magic-form-concrete-quote.csv.')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-magic-rfq-cell-row="0"][data-magic-rfq-cell-col="0"]')).toHaveValue('$101.25')
    await expect(page.locator('[data-magic-rfq-cell-row="0"][data-magic-rfq-cell-col="1"]')).toHaveValue('4')
    await expect(page.locator('[data-magic-rfq-cell-row="7"][data-magic-rfq-cell-col="0"]')).toHaveValue('$2.20')
    await expect(page.locator('[data-magic-rfq-cell-row="7"][data-magic-rfq-cell-col="1"]')).toHaveValue('4')
  })
})
