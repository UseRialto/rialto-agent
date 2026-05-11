import { expect, test } from '@playwright/test'
import { authenticatePage, createAuthenticatedPage } from './helpers/auth'
import { PROJECT_ID, createRfQViaWizard, gotoProject, publishAndCaptureRfqId, submitVendorBid, uniqueTitle } from './helpers/procurement'

test.describe.serial('Procurement lifecycle', () => {
  test('runs RFQ creation, vendor bidding, PO award, acceptance, tracking, and follow-up persistence', async ({ page, browser }) => {
    await authenticatePage(page)

    const title = uniqueTitle('E2E Lifecycle RFQ')
    await createRfQViaWizard(page, {
      requestType: 'rfq',
      title,
      category: 'Concrete',
      publicVisibility: true,
    })
    const rfqId = await publishAndCaptureRfqId(page, 'rfq')

    const pacific = await createAuthenticatedPage(browser, 'vendorPacific')
    const consolidated = await createAuthenticatedPage(browser, 'vendorConsolidated')

    try {
      await submitVendorBid(pacific.page, rfqId, {
        unitPrice: '115',
        leadTimeDays: '14',
        paymentTerms: 'Net 30',
        depositTerms: '0% down',
        creditTerms: 'Open account',
        shippingTerms: 'Delivered',
        notes: 'Pacific test bid',
        quotedProductDetails: 'Pacific Ready Mix 4000 PSI mix, ASTM C94, gray finish',
      })

      await submitVendorBid(consolidated.page, rfqId, {
        unitPrice: '128',
        leadTimeDays: '7',
        paymentTerms: 'Net 20',
        depositTerms: '50% down / 50% on delivery',
        creditTerms: 'Credit app required',
        shippingTerms: 'FOB Destination',
        notes: 'Consolidated test bid',
        quotedProductDetails: 'Consolidated 4000 PSI mix, standard aggregate, delivered by mixer truck',
      })
    } finally {
      await pacific.context.close()
      await consolidated.context.close()
    }

    await page.goto(`/contractor/projects/${PROJECT_ID}/rfqs/${rfqId}`)
    await expect(page.getByText('Sortable Bid Summary')).toBeVisible()
    await expect(page.getByText('Net 30')).toBeVisible()
    await expect(page.getByText('FOB Destination')).toBeVisible()
    await expect(page.getByText('No specs').first()).toBeVisible()

    await page.getByRole('button', { name: 'Mark preferred' }).first().click()
    const rationale = `Lifecycle rationale ${Date.now()}`
    await page.getByLabel('Decision Rationale').first().fill(rationale)
    await page.getByRole('button', { name: 'Save rationale' }).first().click()
    await page.reload()
    await expect(page.getByText('preferred')).toBeVisible()
    await expect(page.getByLabel('Decision Rationale').first()).toHaveValue(rationale)

    await page.getByRole('button', { name: 'Award Preferred Vendor' }).click()
    await expect(page.getByText('Award Purchase Order')).toBeVisible()
    await page.getByRole('button', { name: 'Confirm Award' }).click()
    await expect(page.getByText('PO offered - awaiting vendor response')).toBeVisible()
    await expect(page.getByText('PO Offered')).toBeVisible()

    const vendorPacific = await createAuthenticatedPage(browser, 'vendorPacific')
    let orderId = ''
    try {
      await vendorPacific.page.goto('/vendor/bids')
      await expect(vendorPacific.page.getByText('Pending PO Offer')).toBeVisible()
      await vendorPacific.page.getByRole('button', { name: 'Accept PO' }).click()

      await page.goto('/contractor/orders')
      await expect(page.getByText(title)).toBeVisible()
      await expect(page.getByText('Received')).toBeVisible()

      await vendorPacific.page.goto('/vendor/orders')
      await expect(vendorPacific.page.getByText(title)).toBeVisible()
      await vendorPacific.page.getByRole('link', { name: new RegExp(title) }).first().click()
      await vendorPacific.page.waitForURL(/\/vendor\/orders\/[^/?]+/)
      const orderMatch = vendorPacific.page.url().match(/\/vendor\/orders\/([^/?]+)/)
      if (!orderMatch) throw new Error(`Unable to parse vendor order id from ${vendorPacific.page.url()}`)
      orderId = orderMatch[1]

      await expect(vendorPacific.page.getByText('Mark Items as Packaged →')).toBeVisible()
      await vendorPacific.page.getByRole('button', { name: 'Mark Items as Packaged →' }).click()
      await vendorPacific.page.getByRole('button', { name: 'Mark as Ready to Ship →' }).click()
      await vendorPacific.page.getByLabel('Carrier').fill('FedEx Freight')
      await vendorPacific.page.getByLabel('Tracking Number').fill(`TRACK-${Date.now()}`)
      await vendorPacific.page.getByRole('button', { name: 'Confirm Shipment →' }).click()
      await vendorPacific.page.getByRole('button', { name: 'Mark Out for Delivery →' }).click()
      await expect(vendorPacific.page.getByText(/Order fulfilled on/i)).toBeVisible()
    } finally {
      await vendorPacific.context.close()
    }

    await page.goto('/contractor/orders')
    await expect(page.getByText(title)).toBeVisible()
    await expect(page.getByText('Delivered')).toBeVisible()

    await page.goto(`/contractor/projects/${PROJECT_ID}?status=purchase_orders`)
    await expect(page.getByText(title)).toBeVisible()
    await page.getByRole('link', { name: 'View →' }).first().click()
    await page.waitForURL(new RegExp(`/contractor/orders/${orderId}`))

    await expect(page.getByText('Delivered')).toBeVisible()
    await expect(page.getByText('Shipping Info')).toBeVisible()
    await page.getByLabel('Next Follow-Up').fill('2026-06-01')
    await page.getByLabel('Follow-Up Notes').fill('Verified delivered lifecycle order during E2E testing.')
    await page.getByLabel('Follow-Up Status').selectOption('needs_follow_up')
    await page.getByRole('button', { name: 'Save Follow-Up' }).click()
    await page.reload()
    await expect(page.getByLabel('Next Follow-Up')).toHaveValue('2026-06-01')
    await expect(page.getByLabel('Follow-Up Notes')).toHaveValue('Verified delivered lifecycle order during E2E testing.')

    await gotoProject(page)
    await page.getByRole('link', { name: 'Purchase Orders' }).click()
    await expect(page.getByText(title)).toBeVisible()
  })
})
