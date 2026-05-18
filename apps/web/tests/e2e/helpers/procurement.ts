import path from 'path'
import type { Browser, Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { createAuthenticatedPage } from './auth'

export const PROJECT_ID = 'proj-s001'
export const SAMPLE_CSV_PATH = path.join(process.cwd(), 'docs', 'sample-bom-concrete.csv')

export function uniqueTitle(prefix: string) {
  return `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export async function gotoProject(page: Page) {
  await page.goto(`/contractor/projects/${PROJECT_ID}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /Riverton Plaza/i })).toBeVisible()
}

export async function fillBasicManualItem(page: Page, description: string, quantity = '12') {
  await page.getByPlaceholder('Material description').first().fill(description)
  await page.getByPlaceholder('0').first().fill(quantity)
}

export async function uploadCsv(page: Page) {
  await page.getByLabel('Import takeoff file').setInputFiles(SAMPLE_CSV_PATH)
}

export async function createRfQViaWizard(page: Page, options?: {
  title?: string
  requestType?: 'rfq' | 'rfp'
  category?: string
  publicVisibility?: boolean
  includeOffPlatformInvite?: boolean
  runRfpAssistant?: boolean
}) {
  const requestType = options?.requestType ?? 'rfq'
  const title = options?.title ?? uniqueTitle(requestType === 'rfp' ? 'E2E RFP' : 'E2E RFQ')
  const route = requestType === 'rfp'
    ? `/contractor/projects/${PROJECT_ID}/rfps/new`
    : `/contractor/projects/${PROJECT_ID}/rfqs/new`

  await page.goto(route)
  await page.locator('input[type="text"]').first().fill(title)

  if (options?.category) {
    await page.getByPlaceholder(/Structural Steel|Ready-Mix Concrete|Roofing/).fill(options.category)
  }

  if (requestType === 'rfp') {
    await uploadCsv(page)
    await expect(page.getByRole('textbox', { name: 'Description or SKU' }).first()).toHaveValue('CONC-4000-01')
    await page.getByPlaceholder('What are you trying to buy or solve for on this package?').fill('Validate current construction materials RFP workflow.')
    await page.getByPlaceholder('Summarize the material package, affected areas, and basis-of-design intent.').fill('Concrete and reinforcing procurement package for end-to-end QA.')
    await page.getByPlaceholder('Describe the result you need, not just a single product callout.').fill('Get practical vendor guidance with clear delivery expectations.')
    await page.getByPlaceholder('Codes, ASTM, PSI, U-value, fire rating, corrosion class, etc.').fill('ASTM and structural compliance required.')
    if (options?.runRfpAssistant) {
      const specSelect = page.locator('select').first()
      await expect(specSelect).toBeVisible()
      await specSelect.selectOption({ index: 1 })
      await page.getByPlaceholder('e.g. What alternates or system options should we ask vendors to price for this package?').fill('What should we clarify with vendors before pricing this package?')
      await page.getByRole('button', { name: 'Run Assistant' }).click()
      await expect(page.getByText(/AI Spec Assistant/i)).toBeVisible()
      await expect(page.getByText(/Answer/i)).toBeVisible()
    }
  } else {
    await fillBasicManualItem(page, 'Ready-mix concrete QA package')
  }

  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Invite vendors' })).toBeVisible()

  if (options?.publicVisibility === false) {
    const invitedOnly = page.locator('input[type="radio"][value="invited_only"]')
    if (await invitedOnly.count()) await invitedOnly.check()
  } else {
    const publicVisibility = page.locator('input[type="radio"][value="public"]')
    if (await publicVisibility.count()) await publicVisibility.check()
  }

  if (options?.includeOffPlatformInvite) {
    const inviteInput = page.getByPlaceholder('Vendor name or email…')
    await inviteInput.fill('qa-vendor@example.com')
    await inviteInput.press('Enter')
    await page.getByPlaceholder('First name').fill('Quinn')
    await page.getByPlaceholder('Last name').fill('Vendor')
  }

  await page.getByRole('button', { name: requestType === 'rfp' ? 'Review RFP' : 'Review RFQ' }).click()
  await expect(page.getByText('Vendor Email Preview')).toBeVisible()

  return { title, requestType }
}

export async function saveDraftAndCaptureId(page: Page) {
  await page.getByRole('button', { name: 'Save Draft' }).click()
  await page.waitForURL(`/contractor/projects/${PROJECT_ID}`)
}

export async function publishAndCaptureRfqId(page: Page, requestType: 'rfq' | 'rfp') {
  await page.getByRole('button', { name: requestType === 'rfp' ? 'Publish RFP →' : 'Publish RFQ →' }).click()
  await page.waitForURL(new RegExp(`/contractor/projects/${PROJECT_ID}/rfqs/(?!new(?:[/?]|$))[^/?]+`))
  const match = page.url().match(/\/rfqs\/([^/?]+)/)
  if (!match) {
    throw new Error(`Unable to parse RFQ id from ${page.url()}`)
  }
  return match[1]
}

export async function openDraftFromProject(page: Page, title: string) {
  await gotoProject(page)
  const row = page.getByRole('row').filter({ hasText: title })
  await expect(row).toBeVisible()
  const href = await row.getByRole('link', { name: 'Edit Draft' }).getAttribute('href')
  if (!href) throw new Error(`Unable to find draft edit href for ${title}`)
  await page.goto(href, { waitUntil: 'domcontentloaded' })
}

export async function advanceWizard(page: Page, buttonName: string, target: Locator) {
  for (let attempt = 0; attempt < 3 && await target.count() === 0; attempt += 1) {
    await page.getByRole('button', { name: buttonName, exact: true }).click()
    await page.waitForTimeout(500)
  }
  await expect(target).toBeVisible()
}

export async function submitVendorBid(page: Page, rfqId: string, options: {
  unitPrice: string
  leadTimeDays: string
  paymentTerms?: string
  depositTerms?: string
  creditTerms?: string
  shippingTerms?: string
  notes?: string
  quotedProductDetails?: string
  unavailable?: boolean
}) {
  await page.goto(`/vendor/rfqs/${rfqId}`)
  await expect(page.getByRole('heading', { name: /Your Quote/i })).toBeVisible()

  if (options.unavailable) {
    await page.getByRole('button', { name: 'Unavailable' }).first().click()
  } else {
    await page.getByLabel('Unit Price (USD)').first().fill(options.unitPrice)
    await page.getByLabel('Lead Time (days)').first().fill(options.leadTimeDays)
    if (options.quotedProductDetails) {
      await page.getByLabel('Quoted Product Details').first().fill(options.quotedProductDetails)
    }
  }

  if (options.paymentTerms) await page.getByPlaceholder(/Payment terms/i).fill(options.paymentTerms)
  if (options.depositTerms) await page.getByPlaceholder(/Deposit terms/i).fill(options.depositTerms)
  if (options.creditTerms) await page.getByPlaceholder(/Credit \/ first-time vendor terms/i).fill(options.creditTerms)
  if (options.shippingTerms) await page.getByPlaceholder(/Shipping terms/i).fill(options.shippingTerms)
  if (options.notes) await page.getByLabel(/General Notes/i).fill(options.notes)

  await page.getByRole('button', { name: 'Submit Bid →' }).click()
  await expect(page.getByText('Bid submitted successfully!')).toBeVisible()
}

export async function createAuthenticatedVendorPages(browser: Browser) {
  const pacific = await createAuthenticatedPage(browser, 'vendorPacific')
  const consolidated = await createAuthenticatedPage(browser, 'vendorConsolidated')
  return { pacific, consolidated }
}
