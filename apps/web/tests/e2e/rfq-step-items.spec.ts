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
        attributes?: Array<{ key: string; label: string; value: string }>
        specs?: string
        certifications?: string[]
        contractor_budget?: number
        suggested_lead_time_days?: number
      }>
      metadata?: { parser?: string; importedColumns?: Array<{ key: string; label: string }> }
    }
    expect(body.metadata?.parser).toBe('deterministic-table')
    expect(body.items[0]).toMatchObject({
      description: 'Wide flange beams',
      quantity: 25,
      unit: 'tons',
    })
    expect(body.items[0].contractor_budget).toBeUndefined()
    expect(body.items[0].suggested_lead_time_days).toBeUndefined()
    expect(body.items[0].specs).toBe('')
    expect(body.items[0].certifications).toEqual([])
    expect(body.metadata?.importedColumns?.map((column) => column.label)).toEqual([
      'Grade',
      'Compliance',
      'Target Budget',
      'Lead Time',
      'Notes',
    ])
    expect(body.items[0].attributes).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Grade', value: 'ASTM A992 Grade 50' }),
      expect.objectContaining({ label: 'Compliance', value: 'ASTM A992; AISC Certified' }),
      expect.objectContaining({ label: 'Target Budget', value: '$2,600' }),
      expect.objectContaining({ label: 'Lead Time', value: '21 days' }),
      expect.objectContaining({ label: 'Notes', value: 'Include mill certs' }),
    ]))
    expect(body.items[1]).toMatchObject({
      description: 'Ready-mix concrete 4000 PSI',
      quantity: 85,
      unit: 'cy',
    })
  })

  test('imports sectioned excel rows with scope context and split units', async ({ page }) => {
    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Nevell Group, Inc. - Material Quote'],
      ['Project:', 'Providence Tarzana - D&T Expansion/Renovation'],
      [],
      ['Item Code', 'Item Description', '', 'Quantity', '', 'Variant', '', '', '', '', 'Per', '$'],
      ['05 40 00 - Cold-Formed Metal Framing'],
      ['400S162-54', 'C-Stud 4" - 1-5/8" Flange - 54mil (16ga)', '', '4,309 LF', '', '14\' 0"', '', '', '', '', '1,000 LF', ''],
      ['BC600', 'TSN BridgeClip - BC600 6"', '', '1,449 EA', '', '', '', '', '', '', '1 EA', ''],
      ['06 16 00 - Sheathing'],
      ['PLY34FT', '3/4" Fire Treated Plywood', '', '3,819 SF', '', '4\' 0" x 8\' 0"', '', '', '', '', '1,000 SF', ''],
      ['09 24 00 - Cement Plastering'],
      ['LATH', 'Self-furred metal lath', '', '1,328 SY', '', '', '', '', '', '', '16 SY', ''],
      ['Jeremy Mills', '', '', '', '1/1', '', '', '', 'October 13, 2025 12:40 PM'],
    ])
    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 11 } },
      { s: { r: 4, c: 0 }, e: { r: 4, c: 11 } },
      { s: { r: 7, c: 0 }, e: { r: 7, c: 11 } },
      { s: { r: 9, c: 0 }, e: { r: 9, c: 11 } },
    ]
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Material Review')
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    const response = await page.request.post('/api/import-line-items', {
      multipart: {
        file: {
          name: 'sectioned-material-review.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer,
        },
        requestType: 'rfq',
        category: 'Metal Framing',
        projectName: 'Providence Tarzana',
      },
    })

    expect(response.ok()).toBeTruthy()
    const body = await response.json() as {
      items: Array<{
        sku: string
        description: string
        quantity: number
        unit: string
        attributes?: Array<{ label: string; value: string }>
      }>
      metadata?: { importedColumns?: Array<{ label: string }>; columnRoles?: Array<{ label: string; role: string }> }
    }

    expect(body.items).toHaveLength(4)
    expect(body.items[0]).toMatchObject({
      sku: '',
      description: 'C-Stud 4" - 1-5/8" Flange - 54mil (16ga)',
      quantity: 4309,
      unit: 'lf',
    })
    expect(body.items[2]).toMatchObject({
      sku: '',
      description: '3/4" Fire Treated Plywood',
      quantity: 3819,
      unit: 'sf',
    })
    expect(body.items[3]).toMatchObject({
      sku: '',
      description: 'Self-furred metal lath',
      quantity: 1328,
      unit: 'sy',
    })
    expect(body.metadata?.importedColumns?.map((column) => column.label)).toEqual([
      'Scope',
      'Item Code',
      'Variant',
      'Per',
    ])
    expect(body.metadata?.columnRoles).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Scope', role: 'custom' }),
      expect.objectContaining({ label: 'Item Code', role: 'custom' }),
      expect.objectContaining({ label: 'Item Description', role: 'item' }),
      expect.objectContaining({ label: 'Quantity', role: 'quantity' }),
    ]))
    expect(body.items[0].attributes).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Scope', value: '05 40 00 - Cold-Formed Metal Framing' }),
      expect.objectContaining({ label: 'Item Code', value: '400S162-54' }),
      expect.objectContaining({ label: 'Variant', value: '14\' 0"' }),
      expect.objectContaining({ label: 'Per', value: '1,000 LF' }),
    ]))
    expect(body.items[2].attributes).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Scope', value: '06 16 00 - Sheathing' }),
    ]))
    expect(body.items[3].attributes).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Scope', value: '09 24 00 - Cement Plastering' }),
      expect.objectContaining({ label: 'Per', value: '16 SY' }),
    ]))
  })

  test('uses SKU as item and keeps description as an imported column when both are present', async ({ page }) => {
    const csv = [
      'SKU,Description,Qty,Unit,Specs,Manufacturer,Lead Time',
      'W14x82,Wide flange beams ASTM A992 Grade 50,25,tons,ASTM A992,Acme Steel,21 days',
      'RM-4000,Ready-mix concrete 4000 PSI pump mix,85,cy,ASTM C94,Bay Concrete,5 days',
    ].join('\n')

    const response = await page.request.post('/api/import-line-items', {
      multipart: {
        file: {
          name: 'schema-wins.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(csv),
        },
        requestType: 'rfq',
        category: 'Mixed Materials',
        projectName: 'Mission Bay Tower',
      },
    })

    expect(response.ok()).toBeTruthy()
    const body = await response.json() as {
      items: Array<{ sku: string; description: string; attributes?: Array<{ key: string; label: string; value: string }> }>
      metadata?: { importedColumns?: Array<{ key: string; label: string }>; columnRoles?: Array<{ label: string; role: string }> }
    }

    expect(body.items[0].sku).toBe('W14x82')
    expect(body.items[0].description).toBe('Wide flange beams ASTM A992 Grade 50')
    expect(body.metadata?.columnRoles).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'SKU', role: 'item' }),
      expect.objectContaining({ label: 'Description', role: 'custom' }),
      expect.objectContaining({ label: 'Qty', role: 'quantity' }),
      expect.objectContaining({ label: 'Unit', role: 'unit' }),
    ]))
    expect(body.metadata?.importedColumns?.map((column) => column.label)).toEqual([
      'Description',
      'Specs',
      'Manufacturer',
      'Lead Time',
    ])
    expect(body.items[0].attributes).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Description', value: 'Wide flange beams ASTM A992 Grade 50' }),
      expect.objectContaining({ label: 'Specs', value: 'ASTM A992' }),
      expect.objectContaining({ label: 'Manufacturer', value: 'Acme Steel' }),
      expect.objectContaining({ label: 'Lead Time', value: '21 days' }),
    ]))
  })

  test('keeps true product codes as the item while preserving source descriptions', async ({ page }) => {
    const csv = [
      'Product Code,Description,Quantity,Units,Manufacturer',
      'HSS-4X4,HSS 4x4x1/4 steel tube,18,lf,Acme Steel',
      'PL-38,3/8 inch steel plate,42,sf,Acme Steel',
    ].join('\n')

    const response = await page.request.post('/api/import-line-items', {
      multipart: {
        file: {
          name: 'product-code.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(csv),
        },
        requestType: 'rfq',
        category: 'Structural Steel',
        projectName: 'Mission Bay Tower',
      },
    })

    expect(response.ok()).toBeTruthy()
    const body = await response.json() as {
      items: Array<{ sku: string; description: string; attributes?: Array<{ label: string; value: string }> }>
      metadata?: { importedColumns?: Array<{ label: string }>; columnRoles?: Array<{ label: string; role: string }> }
    }

    expect(body.items[0]).toMatchObject({
      sku: 'HSS-4X4',
      description: 'HSS 4x4x1/4 steel tube',
    })
    expect(body.metadata?.columnRoles).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Product Code', role: 'item' }),
      expect.objectContaining({ label: 'Description', role: 'custom' }),
    ]))
    expect(body.metadata?.importedColumns?.map((column) => column.label)).toEqual([
      'Description',
      'Manufacturer',
    ])
    expect(body.items[0].attributes).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Description', value: 'HSS 4x4x1/4 steel tube' }),
      expect.objectContaining({ label: 'Manufacturer', value: 'Acme Steel' }),
    ]))
  })

  test('uses Section for inferred grouping when the file already has a Scope column', async ({ page }) => {
    const csv = [
      'Material,Quantity,Units,Scope,Notes',
      'Exterior framing',
      'Metal studs,120,lf,Level 2 north,Galvanized',
      'Interior sheathing',
      'Gypsum board,80,sf,Level 3 south,Moisture resistant',
    ].join('\n')

    const response = await page.request.post('/api/import-line-items', {
      multipart: {
        file: {
          name: 'existing-scope.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(csv),
        },
        requestType: 'rfq',
        category: 'Framing',
        projectName: 'Mission Bay Tower',
      },
    })

    expect(response.ok()).toBeTruthy()
    const body = await response.json() as {
      items: Array<{ description: string; attributes?: Array<{ label: string; value: string }> }>
      metadata?: { importedColumns?: Array<{ label: string }>; columnRoles?: Array<{ label: string; role: string }> }
    }

    expect(body.items).toHaveLength(2)
    expect(body.items[0].description).toBe('Metal studs')
    expect(body.metadata?.importedColumns?.map((column) => column.label)).toEqual([
      'Section',
      'Scope',
      'Notes',
    ])
    expect(body.items[0].attributes).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Section', value: 'Exterior framing' }),
      expect.objectContaining({ label: 'Scope', value: 'Level 2 north' }),
      expect.objectContaining({ label: 'Notes', value: 'Galvanized' }),
    ]))
    expect(body.items[1].attributes).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Section', value: 'Interior sheathing' }),
      expect.objectContaining({ label: 'Scope', value: 'Level 3 south' }),
    ]))
  })

  test('does not treat standard/code as the item identifier', async ({ page }) => {
    const csv = [
      'Standard/code,Item Description or SKU,Qty,Unit,specs,suggested_lead_time_days',
      'NEC 2023,EMT conduit 3/4 inch,120,lf,Galvanized steel conduit,14',
      'NFPA 70,Copper THHN #12,2500,lf,600V stranded copper,10',
    ].join('\n')

    const response = await page.request.post('/api/import-line-items', {
      multipart: {
        file: {
          name: 'standard-code.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(csv),
        },
        requestType: 'rfq',
        category: 'Electrical',
        projectName: 'Mission Bay Tower',
      },
    })

    expect(response.ok()).toBeTruthy()
    const body = await response.json() as {
      items: Array<{ sku: string; description: string; attributes?: Array<{ label: string; value: string }> }>
      metadata?: { importedColumns?: Array<{ label: string }>; columnRoles?: Array<{ label: string; role: string }> }
    }

    expect(body.items[0].sku).toBe('')
    expect(body.items[0].description).toBe('EMT conduit 3/4 inch')
    expect(body.metadata?.columnRoles).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Standard code', role: 'custom' }),
      expect.objectContaining({ label: 'Item Description or SKU', role: 'item' }),
    ]))
    expect(body.metadata?.importedColumns?.map((column) => column.label)).toEqual([
      'Standard code',
      'specs',
      'suggested lead time days',
    ])
    expect(body.items[0].attributes).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Standard code', value: 'NEC 2023' }),
      expect.objectContaining({ label: 'specs', value: 'Galvanized steel conduit' }),
      expect.objectContaining({ label: 'suggested lead time days', value: '14' }),
    ]))
  })
})

test.describe('RFQ item step', () => {
  test.beforeEach(async ({ page }) => {
    await authenticatePage(page)
  })

  test('uploads a csv and loads imported rows back into manual entry', async ({ page }) => {
    const fixturePath = path.join(process.cwd(), 'docs', 'sample-bom-concrete.csv')

    await page.goto('/contractor/projects/proj-s001/rfqs/new', { waitUntil: 'domcontentloaded' })

    await page.getByLabel('Import takeoff file').setInputFiles(fixturePath)

    await expect(page.getByText(/Imported \d+ items? from sample-bom-concrete\.csv/i)).toBeVisible()
    await expect(page.getByPlaceholder('Material description').first()).toHaveValue('Ready-mix concrete 4000 PSI')
    await expect(page.getByText('Item 8')).toBeVisible()
    await expect(page.getByText('sample-bom-concrete.csv')).toBeVisible()
  })

  test('supports spreadsheet arrow-key navigation in manual material entry', async ({ page }) => {
    await page.goto('/contractor/projects/proj-s001/rfqs/new')
    await page.getByRole('button', { name: 'Manual Entry' }).click()
    await page.getByRole('button', { name: 'Add another item' }).click()

    const firstItem = page.locator('[data-spreadsheet-cell="true"][data-row-index="0"][data-col-index="0"]')
    const firstQuantity = page.locator('[data-spreadsheet-cell="true"][data-row-index="0"][data-col-index="1"]')
    const firstUnit = page.locator('[data-spreadsheet-cell="true"][data-row-index="0"][data-col-index="2"]')
    const secondItem = page.locator('[data-spreadsheet-cell="true"][data-row-index="1"][data-col-index="0"]')

    await firstItem.focus()
    await firstItem.fill('Beam')
    await expect(firstItem).toBeFocused()

    await firstItem.evaluate((input) => {
      const el = input as HTMLInputElement
      el.setSelectionRange(2, 2)
    })
    await page.keyboard.press('ArrowRight')
    await expect(firstItem).toBeFocused()

    await firstItem.evaluate((input) => {
      const el = input as HTMLInputElement
      el.setSelectionRange(el.value.length, el.value.length)
    })
    await page.keyboard.press('ArrowRight')
    await expect(firstQuantity).toBeFocused()

    await page.keyboard.press('ArrowRight')
    await expect(firstUnit).toBeFocused()

    await page.keyboard.press('ArrowLeft')
    await expect(firstQuantity).toBeFocused()

    await page.keyboard.press('ArrowDown')
    await expect(page.locator('[data-spreadsheet-cell="true"][data-row-index="1"][data-col-index="1"]')).toBeFocused()

    await page.keyboard.press('ArrowLeft')
    await expect(secondItem).toBeFocused()

    await page.keyboard.press('ArrowUp')
    await expect(firstItem).toBeFocused()
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
