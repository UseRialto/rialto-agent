import fs from 'fs/promises'
import path from 'path'
import { test, expect, type TestInfo } from '@playwright/test'
import * as XLSX from 'xlsx'
import { authenticatePage } from './helpers/auth'

const SKU_PLACEHOLDER = 'Type to search SKUs…'

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

    await expect(page.getByText(/Imported \d+ items? from sample-bom-concrete\.csv/i)).toBeVisible()
    await expect(page.getByPlaceholder('Material description').first()).toHaveValue('Ready-mix concrete 4000 PSI')
    await expect(page.getByText('Item 8')).toBeVisible()
    await expect(page.getByText('sample-bom-concrete.csv')).toBeVisible()
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

    const concreteChip = page.getByRole('button', { name: 'Concrete' }).first()
    await expect(concreteChip).toBeEnabled()
    await concreteChip.click()

    await expect(concreteChip).toHaveAttribute('aria-pressed', 'true')

    const skuInput = page.getByPlaceholder(SKU_PLACEHOLDER).first()
    await skuInput.fill('Ready')

    await expect(page.getByRole('button', { name: /Ready-Mix 4000 PSI/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /HSS 4x4x1\/4/i })).toHaveCount(0)
  })

  test('surfaces a dedicated materials RFP route with the AI spec assistant', async ({ page }) => {
    await page.goto('/contractor/projects/proj-s001/rfps/new')

    await expect(page.getByRole('heading', { name: 'Create RFP' })).toBeVisible()
    await expect(page.getByText('Materials RFP Brief')).toBeVisible()
    await expect(page.getByPlaceholder('What are you trying to buy or solve for on this package?')).toBeVisible()
    await expect(page.getByPlaceholder('ZIP code or delivery area for freight estimates')).toBeVisible()
    await expect(page.getByPlaceholder('What do you want vendors to answer in their response?')).toBeVisible()
    await expect(page.getByText('Add Materials')).toBeVisible()
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
    await page.getByPlaceholder('Material description').first().fill('Ready-mix concrete 4000 PSI')
    await page.getByPlaceholder('0').first().fill('12')
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByText('Marketplace Visibility')).toBeVisible()

    await page.getByPlaceholder('Vendor name or email…').fill('buyer-test@example.com')
    await page.getByRole('button', { name: /Add buyer-test@example.com/i }).click()

    await page.getByRole('button', { name: 'Review RFQ →' }).click()

    await expect(page.getByText('Vendor Email Preview')).toBeVisible()
    await expect(page.getByText('buyer-test@example.com', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Email subject')).toHaveValue(/Request for Quote:/)
    await expect(page.getByLabel('Email body')).toContainText('Use the secure quote form linked in this email')

    await page.getByLabel('Email subject').fill('Custom RFQ subject')
    await page.getByLabel('Email body').fill('Custom body for this live send.')

    await expect(page.getByLabel('Email subject')).toHaveValue('Custom RFQ subject')
    await expect(page.getByLabel('Email body')).toHaveValue('Custom body for this live send.')
  })
})
