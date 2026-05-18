import fs from 'fs/promises'
import path from 'path'
import { test, expect, type TestInfo } from '@playwright/test'
import * as XLSX from 'xlsx'
import { authenticatePage } from './helpers/auth'

test.describe('line item import API', () => {
  test('imports excel rows with combined quantity and unit cells', async ({ page }) => {
    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Material', 'Takeoff', 'Grade', 'Compliance', 'Target Budget', 'Lead Time', 'Notes'],
      ['Wide flange beams', '25 tons', 'ASTM A992 Grade 50', 'ASTM A992; AISC Certified', '$2,600', '21 days', 'Include mill certs'],
      ['Ready-mix concrete 4000 PSI', '85 CY', 'ASTM C94', '', '$185', '5 days', 'Saturday pour available'],
    ])
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Takeoff')
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    const response = await page.request.post('/api/import-line-items', {
      multipart: {
        file: {
          name: 'messy-takeoff.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer,
        },
        requestType: 'rfq',
        category: 'Structural Steel',
        projectName: 'Mission Bay Tower',
      },
    })

    expect(response.ok()).toBeTruthy()
    const body = await response.json() as {
      items: Array<{
        description: string
        quantity: number
        unit: string
        specs?: string
        certifications?: string[]
        contractor_budget?: number
        suggested_lead_time_days?: number
      }>
      metadata?: { parser?: string }
    }
    expect(body.metadata?.parser).toBe('deterministic-table')
    expect(body.items[0]).toMatchObject({
      description: 'Wide flange beams',
      quantity: 25,
      unit: 'tons',
      contractor_budget: 2600,
      suggested_lead_time_days: 21,
    })
    expect(body.items[0].specs).toContain('ASTM A992 Grade 50')
    expect(body.items[0].certifications).toContain('ASTM A992')
    expect(body.items[0].certifications).toContain('AISC Certified')
    expect(body.items[1]).toMatchObject({
      description: 'Ready-mix concrete 4000 PSI',
      quantity: 85,
      unit: 'cy',
      contractor_budget: 185,
      suggested_lead_time_days: 5,
    })
  })
})

test.describe('RFQ item step', () => {
  test.beforeEach(async ({ page }) => {
    await authenticatePage(page)
  })

  test('uploads a csv and loads imported rows back into manual entry', async ({ page }) => {
    const fixturePath = path.join(process.cwd(), 'docs', 'sample-bom-concrete.csv')

    await page.goto('/contractor/projects/proj-s001/rfqs/new')

    await page.getByLabel('Import takeoff file').setInputFiles(fixturePath)

    await expect(page.getByRole('textbox', { name: 'Description or SKU' }).first()).toHaveValue('CONC-4000-01')
    await expect(page.locator('input[type="number"]').first()).toHaveValue('120')
    await expect(page.locator('select').first()).toHaveValue('cy')
    await expect(page.getByRole('textbox', { name: 'Description or SKU' }).nth(7)).toHaveValue('EXP-JOINT-12')
  })

  test('shows a clear error for unsupported upload input', async ({ page }, testInfo: TestInfo) => {
    const invalidPath = testInfo.outputPath('invalid-upload.bin')
    await fs.writeFile(invalidPath, Buffer.from([0, 1, 2, 3, 4]))

    await page.goto('/contractor/projects/proj-s001/rfqs/new')
    await page.getByLabel('Import takeoff file').setInputFiles(invalidPath)

    await expect(page.getByText('Only CSV, TSV, TXT, PDF, Excel, or other text-like files are supported for this import.')).toBeVisible()
  })

  test('makes category selection obvious and filters sku results', async ({ page }) => {
    await page.goto('/contractor/projects/proj-s001/rfqs/new')

    await page.getByPlaceholder('e.g. Structural Steel, Ready-Mix Concrete, Roofing').fill('Concrete')
    await page.getByRole('button', { name: 'Manual Entry' }).click()

    const skuInput = page.getByRole('textbox', { name: 'Description or SKU' }).first()
    await skuInput.fill('Ready')

    await expect(page.getByRole('button', { name: /Ready-Mix 4000 PSI/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /HSS 4x4x1\/4/i })).toHaveCount(0)
  })

  test('surfaces a dedicated materials RFP route with materials brief fields', async ({ page }) => {
    await page.goto('/contractor/projects/proj-s001/rfps/new')

    await expect(page.getByRole('heading', { name: 'Create an RFP' })).toBeVisible()
    await expect(page.getByText('Materials RFP Brief')).toBeVisible()
    await expect(page.getByPlaceholder('What are you trying to buy or solve for on this package?')).toBeVisible()
    await expect(page.getByPlaceholder('ZIP code or delivery area for freight estimates')).toBeVisible()
    await expect(page.getByPlaceholder('What do you want vendors to answer in their response?')).toBeVisible()
    await expect(page.getByText('Add Materials', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Import takeoff file')).toBeAttached()
  })
})

test.describe('RFQ review step', () => {
  test.beforeEach(async ({ page }) => {
    await authenticatePage(page)
  })

  test('shows an editable vendor email draft for off-platform recipients', async ({ page }) => {
    await page.goto('/contractor/projects/proj-s001/rfqs/new')

    await page.locator('input[type="text"]').first().fill(`Review Step QA ${Date.now()}`)
    await page.getByRole('button', { name: 'Manual Entry' }).click()
    await page.getByRole('textbox', { name: 'Description or SKU' }).first().fill('Ready-mix concrete 4000 PSI')
    await page.locator('input[type="number"]').first().fill('12')
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Invite vendors' })).toBeVisible()

    await page.getByPlaceholder('Vendor name or email…').fill('buyer-test@example.com')
    await page.getByRole('button', { name: /Add buyer-test@example.com/i }).click()

    await page.getByRole('button', { name: 'Review RFQ' }).click()

    await expect(page.getByText('Vendor Email Preview')).toBeVisible()
    await expect(page.getByText('buyer-test@example.com').first()).toBeVisible()
    await expect(page.getByLabel('Subject')).toHaveValue(/Request for Quote:/)
    await expect(page.getByText('secure quote form linked in this email')).toBeVisible()

    await page.getByLabel('Subject').fill('Custom RFQ subject')
    await expect(page.getByLabel('Subject')).toHaveValue('Custom RFQ subject')
  })
})
