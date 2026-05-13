'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GripVertical, Plus, Settings, UploadCloud, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SKU_CATALOG, SKU_CATEGORIES, type SKUEntry } from '@/lib/fixtures/sku-catalog'
import type { ContractorRFQLineItem } from '@/lib/types/contractor'
import type { ProcurementRequirement, RequestType, RFPDetails } from '@/lib/types/procurement'
import {
  buildLineItemAttributes,
  composeLineItemSpecs,
  DEFAULT_LINE_ITEM_ATTRIBUTES,
  deriveMaterialAttributeProfile,
  extractAdditionalSpecNotes,
  getLineItemAttributeOptions,
  summarizeLineItemAttributes,
  UNIT_OPTION_GROUPS,
} from '@/lib/procurement-config'
import { fieldsToAttributes, type ContractorFieldBankEntry, type CustomLineItemFieldDefinition } from '@/lib/contractor-customization'

export type ItemRow = Omit<ContractorRFQLineItem, 'id'> & { _key: string }
export type RFQCreationFieldKey =
  | 'materialLookup'
  | 'description'
  | 'quantity'
  | 'unit'
  | 'specifications'
  | 'constraints'
  | 'notes'
  | 'targetBudget'
  | 'suggestedLeadTime'
  | 'certifications'
  | 'supplierRequirements'
  | 'specBuilder'

export type RFQCreationFieldVisibility = Record<RFQCreationFieldKey, boolean>

export const DEFAULT_RFQ_CREATION_FIELD_VISIBILITY: RFQCreationFieldVisibility = {
  materialLookup: true,
  description: true,
  quantity: true,
  unit: true,
  specifications: true,
  constraints: true,
  notes: true,
  targetBudget: true,
  suggestedLeadTime: true,
  certifications: true,
  supplierRequirements: true,
  specBuilder: true,
}

const CERT_OPTIONS = ['ASTM A992', 'ASTM A615', 'ASTM A706', 'ASTM A416', 'ASTM A500', 'ASTM A36', 'ASTM A653', 'ISO 9001', 'AISC Certified']
const SAMPLE_LINE_ITEM_CSV = [
  'sku,description,quantity,unit,specs,constraints,certifications,notes,target_budget,suggested_lead_time_days',
  'W14x82,W14x82 wide flange beams ASTM A992 Grade 50,42,tons,ASTM A992 Grade 50,Deliver to jobsite laydown yard,ASTM A992; AISC Certified,Include mill certs,2600,21',
  'Ready-Mix 4000 PSI,Ready-mix concrete 4000 PSI pump mix,85,cy,ASTM C94 4000 PSI,Saturday pour available,,Include environmental fees,185,5',
  'Porcelain Tile 12x24,Porcelain floor tile 12x24 slip resistant,3200,sf,DCOF 0.42 min and rectified edges,Allow attic stock and phased delivery,,Quote by square foot,7.25,14',
  'TPO 60mil,TPO roofing membrane 60mil white,18500,sf,60 mil TPO with R-30 insulation,Include tapered crickets and warranty,ISO 9001,Price membrane and insulation separately,8.5,18',
].join('\n')
const SECTION_HEADING_STYLE = { color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)', fontWeight: 700 } as const
const CORE_VENDOR_RESPONSE_COLUMNS = ['Unit Price', 'Lead Time']

function RemoveFieldButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute right-3 top-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors"
      style={{ background: '#f8d9ca', border: '1px solid #cf5f35', color: '#8f3d22' }}
      aria-label={`Remove ${label}`}
      title={`Remove ${label}`}
    >
      <X className="h-4 w-4" aria-hidden="true" />
    </button>
  )
}

function defaultUnitForCategory(category?: string) {
  const profile = deriveMaterialAttributeProfile(category)
  const normalized = (category ?? '').toLowerCase()
  if (/(tile|floor|carpet|stone|paver|ceiling)/.test(normalized)) return 'sf'
  if (/(brick|cmu|block|hardware|fastener|anchor|bolt|fixture|equipment)/.test(normalized)) return 'ea'
  if (/(pipe|conduit|duct|trim|molding|cable|wire)/.test(normalized)) return 'lf'
  if (/(plywood|osb|gypsum|drywall|sheet)/.test(normalized)) return 'sheets'
  switch (profile) {
    case 'steel':
      return 'tons'
    case 'concrete':
      return 'cy'
    case 'lumber':
      return 'bf'
    case 'glazing':
    case 'roofing':
    case 'cladding':
      return 'sf'
    case 'mep':
      return 'lf'
    default:
      return 'ea'
  }
}

function inferUnitForItem(row: Pick<ItemRow, 'sku' | 'description'>, category?: string) {
  const catalogMatch = SKU_CATALOG.find((item) => (
    item.sku.toLowerCase() === row.sku.toLowerCase() ||
    (row.sku && item.sku.toLowerCase().includes(row.sku.toLowerCase()))
  ))
  if (catalogMatch) return catalogMatch.unit

  const text = `${row.sku} ${row.description} ${category ?? ''}`.toLowerCase()
  if (!text.trim()) return defaultUnitForCategory(category)
  if (/(wide flange|w\d+x|hss|angle|channel|plate|rebar|beam|steel|steal)/.test(text) && !/(deck|roof deck|tile)/.test(text)) return 'tons'
  if (/(ready[- ]?mix|concrete|grout|shotcrete)/.test(text)) return 'cy'
  if (/(tile|flooring|carpet|stone|paver|roof|deck|membrane|insulation|glass|glazing|cladding|panel|ceiling)/.test(text)) return 'sf'
  if (/(pipe|conduit|duct|strand|cable|wire|trim|molding|stud track)/.test(text)) return 'lf'
  if (/(lumber|2x|board foot|glulam)/.test(text)) return 'bf'
  if (/(plywood|osb|drywall|gypsum|sheet)/.test(text)) return 'sheets'
  if (/(bolt|anchor|screw|hardware|fixture|door|window|unit|equipment|cmu|brick)/.test(text)) return 'ea'
  return defaultUnitForCategory(category)
}

function newRow(category?: string, fieldTemplate?: CustomLineItemFieldDefinition[]): ItemRow {
  return {
    _key: `li-${Math.random().toString(36).slice(2)}`,
    sku: '',
    description: '',
    quantity: 0,
    unit: defaultUnitForCategory(category),
    specs: '',
    constraints: '',
    attributes: fieldTemplate?.length ? fieldsToAttributes(fieldTemplate) : buildLineItemAttributes(category),
    certifications: [],
    notes: '',
    contractor_budget: undefined,
    suggested_lead_time_days: undefined,
  }
}

interface Props {
  projectName: string
  requestType: RequestType
  requestTypeLocked?: boolean
  title: string
  bidDeadline: string
  deliveryRequiredBy: string
  category: string
  attachmentUrls: string[]
  anonymousPublicListing: boolean
  rfpDetails: RFPDetails
  procurementRequirements: ProcurementRequirement[]
  fieldTemplate?: CustomLineItemFieldDefinition[]
  vendorResponseFields?: CustomLineItemFieldDefinition[]
  availableFieldBank?: ContractorFieldBankEntry[]
  fieldVisibility?: RFQCreationFieldVisibility
  isCustomizingFields?: boolean
  onToggleCustomizeFields?: () => void
  existingCategories: string[]
  items: ItemRow[]
  onRequestTypeChange: (v: RequestType) => void
  onTitleChange: (v: string) => void
  onBidDeadlineChange: (v: string) => void
  onDeliveryRequiredByChange: (v: string) => void
  onCategoryChange: (v: string) => void
  onAttachmentUrlsChange: (urls: string[]) => void
  onAnonymousPublicListingChange: (v: boolean) => void
  onRfpDetailsChange: (value: RFPDetails) => void
  onProcurementRequirementsChange: (items: ProcurementRequirement[]) => void
  onTemplateFieldAdd?: (key: string) => void
  onTemplateFieldRemove?: (key: string) => void
  onTemplateFieldMove?: (dragKey: string, targetKey: string, position?: 'before' | 'after') => void
  onTemplateReplace?: (fields: CustomLineItemFieldDefinition[]) => void
  onTemplateFieldRename?: (key: string, newLabel: string) => void
  onTemplateFieldAddCustom?: () => void
  onVendorResponseFieldAdd?: () => void
  onVendorResponseFieldRemove?: (key: string) => void
  onVendorResponseFieldRename?: (key: string, newLabel: string) => void
  onVendorResponseFieldToggleRequired?: (key: string) => void
  onFieldRemove?: (field: RFQCreationFieldKey) => void
  onFieldRestore?: (field: RFQCreationFieldKey) => void
  onItemsChange: (items: ItemRow[]) => void
}

export function StepItems({
  projectName,
  requestType,
  requestTypeLocked = false,
  title,
  bidDeadline,
  deliveryRequiredBy,
  category,
  attachmentUrls,
  rfpDetails,
  fieldTemplate = [],
  vendorResponseFields = [],
  availableFieldBank = [],
  fieldVisibility = DEFAULT_RFQ_CREATION_FIELD_VISIBILITY,
  isCustomizingFields = false,
  onToggleCustomizeFields,
  existingCategories,
  items,
  onRequestTypeChange,
  onTitleChange,
  onBidDeadlineChange,
  onDeliveryRequiredByChange,
  onCategoryChange,
  onAttachmentUrlsChange,
  onRfpDetailsChange,
  onTemplateFieldAdd,
  onTemplateFieldRemove,
  onTemplateFieldMove,
  onTemplateReplace,
  onTemplateFieldRename,
  onTemplateFieldAddCustom,
  onVendorResponseFieldAdd,
  onVendorResponseFieldRemove,
  onVendorResponseFieldRename,
  onVendorResponseFieldToggleRequired,
  onFieldRemove,
  onFieldRestore,
  onItemsChange,
}: Props) {
  const importInputId = useId()
  const [skuDropdowns, setSkuDropdowns] = useState<Record<string, SKUEntry[]>>({})
  const [skuCategoryFilters] = useState<Record<string, string | null>>({})
  const [importError, setImportError] = useState('')
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const [isDraggingImport, setIsDraggingImport] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [materialEntryMode, setMaterialEntryMode] = useState<'import' | 'manual'>('import')
  const [deliveryRequiredByShown, setDeliveryRequiredByShown] = useState(() => Boolean(deliveryRequiredBy))
  useEffect(() => {
    if (deliveryRequiredBy) setDeliveryRequiredByShown(true)
  }, [deliveryRequiredBy])
  const [draggedFieldKey, setDraggedFieldKey] = useState<string | null>(null)
  const [dragOverField, setDragOverField] = useState<{ key: string; position: 'before' | 'after' } | null>(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set())
  const [editingColKey, setEditingColKey] = useState<string | null>(null)
  const [editingColValue, setEditingColValue] = useState('')
  const spreadsheetViewportRef = useRef<HTMLDivElement>(null)
  const spreadsheetScrollbarRef = useRef<HTMLDivElement>(null)
  const [spreadsheetScrollWidth, setSpreadsheetScrollWidth] = useState(1)
  const [uploadFolder] = useState(() => `request-attachments/${crypto.randomUUID().slice(0, 8)}`)
  const requestLabel = requestType === 'rfp' ? 'RFP' : 'RFQ'
  const isVisible = (field: RFQCreationFieldKey) => fieldVisibility[field] !== false
  const removeField = (field: RFQCreationFieldKey) => onFieldRemove?.(field)
  const restoreField = (field: RFQCreationFieldKey) => onFieldRestore?.(field)

  function toTitleCase(s: string) {
    return s.trim().replace(/\b\w/g, (c) => c.toUpperCase())
  }
  function commitColRename(colKey: string) {
    const titled = toTitleCase(editingColValue)
    if (titled) {
      if (colKey.startsWith('vendor:')) {
        onVendorResponseFieldRename?.(colKey.slice(7), titled)
      } else {
        onTemplateFieldRename?.(colKey, titled)
      }
    }
    setEditingColKey(null)
    setEditingColValue('')
  }
  const hiddenMaterialFields = ([
    { key: 'specifications', label: 'Notes / Specifications' },
    { key: 'targetBudget', label: 'Target Budget' },
    { key: 'suggestedLeadTime', label: 'Suggested Lead Time' },
    { key: 'certifications', label: 'Certifications Required' },
  ] as const).filter((field) => !isVisible(field.key))

  useEffect(() => {
    setIsHydrated(true)

    const params = new URLSearchParams(window.location.search)
    if (params.get('importCsv') !== '1') return
    const raw = sessionStorage.getItem('rialto:pending-csv')
    if (!raw) return
    sessionStorage.removeItem('rialto:pending-csv')
    try {
      const { name, dataUrl } = JSON.parse(raw) as { name: string; dataUrl: string }
      const byteString = atob(dataUrl.split(',')[1])
      const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0]
      const ab = new ArrayBuffer(byteString.length)
      const ia = new Uint8Array(ab)
      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i)
      const file = new File([ab], name, { type: mimeString })
      setTimeout(() => importFile(file), 500)
    } catch {
      console.warn('Failed to process pending CSV import from assistant')
    }
  }, [])

  function inferCategoryForRow(row: ItemRow, explicitCategory?: string | null) {
    if (explicitCategory) return explicitCategory
    const entry = SKU_CATALOG.find((item) => item.sku === row.sku)
    if (entry) return entry.category
    return category || row.description || row.sku
  }

  function getAdditionalSpecNotes(row: ItemRow) {
    const attributeSummary = summarizeLineItemAttributes(row.attributes)
    const additional = extractAdditionalSpecNotes(row.specs)
    if (attributeSummary && additional === attributeSummary) return ''
    return additional
  }

  function syncRowSpecs(row: ItemRow, nextAttributes: ItemRow['attributes'], manualNotes = getAdditionalSpecNotes(row)) {
    return composeLineItemSpecs(nextAttributes, manualNotes)
  }

  function updateItem(key: string, field: keyof ItemRow, value: unknown) {
    onItemsChange(items.map((row) => {
      if (row._key !== key) return row
      const nextRow = { ...row, [field]: value } as ItemRow
      if (field === 'sku' || field === 'description') {
        const inferredCategory = inferCategoryForRow(nextRow, skuCategoryFilters[key] ?? null)
        nextRow.attributes = fieldTemplate.length
          ? fieldsToAttributes(fieldTemplate, nextRow.attributes)
          : buildLineItemAttributes(inferredCategory, nextRow.attributes)
        nextRow.unit = inferUnitForItem(nextRow, inferredCategory)
        if (requestType === 'rfp') {
          nextRow.specs = syncRowSpecs(nextRow, nextRow.attributes)
        }
      }
      return nextRow
    }))
  }

  function updateAttribute(key: string, attributeKey: string, value: string) {
    onItemsChange(items.map((row) => {
      if (row._key !== key) return row
      const existing = row.attributes ?? DEFAULT_LINE_ITEM_ATTRIBUTES
      const nextAttributes = existing.map((attribute) => (
        attribute.key === attributeKey ? { ...attribute, value } : attribute
      ))
      return {
        ...row,
        attributes: nextAttributes,
        specs: syncRowSpecs(row, nextAttributes),
      }
    }))
  }

  function updateAdditionalSpecNotes(key: string, value: string) {
    onItemsChange(items.map((row) => {
      if (row._key !== key) return row
      return {
        ...row,
        specs: composeLineItemSpecs(row.attributes, value),
      }
    }))
  }

  function handleSkuInput(key: string, value: string) {
    updateItem(key, 'sku', value)
    const catFilter = skuCategoryFilters[key] ?? null
    if (value.length > 0 || catFilter) {
      const q = value.toLowerCase()
      const matches = SKU_CATALOG.filter((entry) => {
        const matchesText = !q || entry.sku.toLowerCase().includes(q) || entry.description.toLowerCase().includes(q)
        const matchesCat = !catFilter || entry.category === catFilter
        return matchesText && matchesCat
      }).slice(0, 10)
      setSkuDropdowns((prev) => ({ ...prev, [key]: matches }))
    } else {
      setSkuDropdowns((prev) => ({ ...prev, [key]: [] }))
    }
  }

  function selectSku(key: string, entry: SKUEntry) {
    onItemsChange(items.map((row) => (
      row._key === key
        ? (() => {
            const nextAttributes = fieldTemplate.length
              ? fieldsToAttributes(fieldTemplate, row.attributes)
              : buildLineItemAttributes(entry.category, row.attributes)
            return {
              ...row,
              sku: entry.sku,
              description: entry.description,
              unit: entry.unit,
              attributes: nextAttributes,
              specs: requestType === 'rfp' ? syncRowSpecs(row, nextAttributes) : row.specs,
            }
          })()
        : row
    )))
    setSkuDropdowns((prev) => ({ ...prev, [key]: [] }))
  }

  async function uploadAttachment(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('folder', uploadFolder)
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    })
    const json = await response.json() as { url?: string; error?: string }
    if (!response.ok || !json.url) {
      throw new Error(json.error ?? 'Failed to upload file.')
    }
    return json.url
  }

  async function inferTemplateFromImport(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('trade', category)
    formData.append('preferUploadedColumns', 'true')
    const response = await fetch('/api/contractor-customization/infer-template', {
      method: 'POST',
      body: formData,
    })
    const json = await response.json() as {
      customization?: { lineItemFields?: CustomLineItemFieldDefinition[] }
      detectedHeaders?: string[]
      warnings?: string[]
      error?: string
    }
    if (!response.ok) {
      console.warn('Import template inference failed:', json.error)
      return { fields: [] as CustomLineItemFieldDefinition[], detectedHeaders: [] as string[], warnings: json.error ? [json.error] : [] }
    }
    return {
      fields: json.customization?.lineItemFields ?? [],
      detectedHeaders: json.detectedHeaders ?? [],
      warnings: json.warnings ?? [],
    }
  }

  async function importFile(file: File) {
    setImportError('')
    try {
      setUploadingFiles(true)
      const inferredTemplate = await inferTemplateFromImport(file)
      const importFields = inferredTemplate.fields.length
        ? inferredTemplate.fields
        : inferredTemplate.detectedHeaders.length === 0
          ? []
          : fieldTemplate
      if (inferredTemplate.fields.length) {
        onTemplateReplace?.(inferredTemplate.fields)
      } else if (inferredTemplate.detectedHeaders.length === 0) {
        onTemplateReplace?.([])
      }
      const formData = new FormData()
      formData.append('file', file)
      formData.append('requestType', requestType)
      formData.append('category', category)
      formData.append('projectName', projectName)
      const response = await fetch('/api/import-line-items', {
        method: 'POST',
        body: formData,
      })
      const json = await response.json() as {
        items?: Array<Omit<ItemRow, '_key'>>
        metadata?: {
          parser?: string
          confidence?: number
          warnings?: Array<{ row?: number; message: string }>
          skippedRows?: number
        }
        error?: string
      }
      if (!response.ok || !json.items) {
        throw new Error(json.error ?? 'Failed to import line items.')
      }
      const parsed: ItemRow[] = json.items.map((item) => {
        const visibleSku = item.sku || item.description || ''
        const rowForUnit = { sku: item.sku ?? '', description: item.description ?? '' }
        return {
          _key: `li-${Math.random().toString(36).slice(2)}`,
          sku: visibleSku,
          description: item.description ?? '',
          quantity: item.quantity ?? 0,
          unit: item.unit || inferUnitForItem(rowForUnit, category),
          specs: item.specs ?? '',
          constraints: item.constraints ?? '',
          attributes: importFields.length
            ? fieldsToAttributes(importFields, item.attributes)
            : buildLineItemAttributes(category, item.attributes),
          certifications: item.certifications ?? [],
          notes: item.notes ?? '',
          contractor_budget: item.contractor_budget,
          suggested_lead_time_days: item.suggested_lead_time_days,
        }
      }).filter((row) => row.sku || row.description)
      if (parsed.length === 0) throw new Error('No usable material line items were found in this file.')
      onItemsChange(parsed)
      setMaterialEntryMode('manual')

      try {
        const uploadedUrl = await uploadAttachment(file)
        onAttachmentUrlsChange([...attachmentUrls, uploadedUrl])
      } catch (uploadError) {
        console.warn('Import source attachment upload failed after import:', uploadError)
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Failed to import file.')
    } finally {
      setUploadingFiles(false)
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    await importFile(file)
    e.target.value = ''
  }

  async function handleImportDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setIsDraggingImport(false)
    if (uploadingFiles) return
    const file = event.dataTransfer.files?.[0]
    if (!file) return
    await importFile(file)
  }

  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
  const spreadsheetAttributes = items[0]?.attributes ?? (fieldTemplate.length ? fieldsToAttributes(fieldTemplate) : buildLineItemAttributes(category))
  const vendorResponseColumns = [...CORE_VENDOR_RESPONSE_COLUMNS, ...vendorResponseFields.map((field) => field.label)]
  const spreadsheetColumnWidths = [
    40,
    54,
    360,
    108,
    132,
    ...spreadsheetAttributes.map(() => 184),
    ...(isCustomizingFields ? [128] : []),
    ...(requestType === 'rfp' && isVisible('specifications') ? [240, 260] : []),
    ...(isVisible('targetBudget') ? [144] : []),
    ...(isVisible('suggestedLeadTime') ? [144] : []),
    ...(isVisible('specifications') ? [300] : []),
    ...(isVisible('certifications') ? [260] : []),
    ...vendorResponseColumns.map(() => 150),
    ...(isCustomizingFields ? [160] : []),
  ]
  const spreadsheetWidth = spreadsheetColumnWidths.reduce((sum, width) => sum + width, 0)
  const spreadsheetColumns = spreadsheetColumnWidths.map((width) => `${width}px`).join(' ')

  useEffect(() => {
    function updateSpreadsheetScrollWidth() {
      const content = spreadsheetViewportRef.current?.firstElementChild as HTMLElement | null
      setSpreadsheetScrollWidth(content?.scrollWidth || 1)
    }

    updateSpreadsheetScrollWidth()
    const frame = requestAnimationFrame(updateSpreadsheetScrollWidth)
    window.addEventListener('resize', updateSpreadsheetScrollWidth)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', updateSpreadsheetScrollWidth)
    }
  }, [spreadsheetColumns, spreadsheetAttributes.length, items.length, isCustomizingFields])

  function syncSpreadsheetScroll(source: 'viewport' | 'bar') {
    const from = source === 'viewport' ? spreadsheetViewportRef.current : spreadsheetScrollbarRef.current
    const to = source === 'viewport' ? spreadsheetScrollbarRef.current : spreadsheetViewportRef.current
    if (!from || !to || to.scrollLeft === from.scrollLeft) return
    to.scrollLeft = from.scrollLeft
  }

  return (
    <div className="space-y-7">
      {!requestTypeLocked && (
        <div className="rounded-2xl p-5" style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}>
          <p className="mb-3 text-sm font-semibold" style={SECTION_HEADING_STYLE}>Request Type</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(['rfq', 'rfp'] as const).map((value) => {
              const active = requestType === value
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  disabled={!isHydrated}
                  onClick={() => onRequestTypeChange(value)}
                  className="rounded-xl px-4 py-3 text-left transition-colors disabled:opacity-60"
                  style={active
                    ? { background: '#1e3a2f', borderColor: '#1e3a2f', border: '2px solid #1e3a2f', color: '#fff' }
                    : { background: '#ffffff', border: '2px solid #e2d9cf', color: '#4a6358' }
                  }
                >
                  <p className="text-sm font-semibold">{value.toUpperCase()}</p>
                  <p className="mt-1 text-xs" style={{ color: active ? 'rgba(255,255,255,0.7)' : '#8a9e96' }}>
                    {value === 'rfq'
                      ? 'You know the material and want exact pricing.'
                      : 'You need vendor guidance on what material, system, or spec to use.'}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="rounded-2xl p-6 shadow-sm" style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}>
        <div className="mb-4">
          <p className="text-sm font-semibold" style={SECTION_HEADING_STYLE}>Material Request Details</p>
          <p className="mt-1 text-xs" style={{ color: '#4a6358' }}>
            Name the package, set the due date, and tag the material category before adding quantities.
          </p>
        </div>
        {isCustomizingFields && !deliveryRequiredByShown && (
          <div className="mb-4 rounded-xl px-3 py-3" style={{ background: '#edf6ef', border: '1px solid #2f9e62' }}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-1 text-xs font-semibold uppercase tracking-wider" style={{ color: '#1f7a45' }}>Quick add</p>
              <button
                type="button"
                onClick={() => setDeliveryRequiredByShown(true)}
                className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1.5 text-xs font-semibold"
                style={{ border: '1px solid #2f9e62', color: '#1f7a45' }}
              >
                <Plus className="h-3.5 w-3.5" />
                Delivery Required By
              </button>
            </div>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: '#4a6358' }}>
              {requestLabel} Title <span style={{ color: '#fa6b04' }}>*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder={`${projectName} - ${requestLabel}`}
              className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
              style={{ background: '#f5f0eb', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: '#4a6358' }}>Quote Deadline</label>
            <input
              type="date"
              value={bidDeadline}
              min={tomorrow}
              onChange={(e) => onBidDeadlineChange(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
              style={{ background: '#f5f0eb', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
            />
          </div>
          {deliveryRequiredByShown && (
            <div className="md:col-span-2">
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-sm font-medium" style={{ color: '#4a6358' }}>Delivery Required By</label>
                {isCustomizingFields && (
                  <button
                    type="button"
                    onClick={() => { setDeliveryRequiredByShown(false); onDeliveryRequiredByChange('') }}
                    className="flex h-5 w-5 items-center justify-center rounded-full transition-colors hover:bg-[#a85c2a]/15"
                    style={{ color: '#a85c2a' }}
                    aria-label="Remove Delivery Required By"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <input
                type="date"
                value={deliveryRequiredBy}
                min={tomorrow}
                onChange={(e) => onDeliveryRequiredByChange(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
                style={{ background: '#f5f0eb', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
              />
            </div>
          )}
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium" style={{ color: '#4a6358' }}>Material Category</label>
            <input
              type="text"
              value={category}
              onChange={(e) => onCategoryChange(e.target.value)}
              list="rfq-category-options"
              placeholder="e.g. Structural Steel, Ready-Mix Concrete, Roofing"
              className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
              style={{ background: '#f5f0eb', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
            />
            <datalist id="rfq-category-options">
              {[...new Set([...existingCategories, ...SKU_CATEGORIES])].filter(Boolean).map((entry) => (
                <option key={entry} value={entry} />
              ))}
            </datalist>
          </div>
        </div>
      </div>

      {requestType === 'rfp' && (
        <div className="rounded-2xl p-5" style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}>
          <p className="mb-3 text-sm font-semibold" style={SECTION_HEADING_STYLE}>Materials RFP Brief</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {([
              { span: 'sm:col-span-2', label: 'Procurement Objective', key: 'procurement_objective', placeholder: 'What are you trying to buy or solve for on this package?' },
              { span: 'sm:col-span-2', label: 'Scope / Package Summary', key: 'scope_summary', placeholder: 'Summarize the material package, affected areas, and basis-of-design intent.' },
              { span: 'sm:col-span-2', label: 'Desired Outcome', key: 'desired_outcome', placeholder: 'Describe the result you need, not just a single product callout.' },
              { span: '', label: 'Performance / Spec Requirements', key: 'performance_requirements', placeholder: 'Codes, ASTM, PSI, U-value, fire rating, corrosion class, etc.' },
              { span: '', label: 'Approved Alternates Requested', key: 'approved_alternates', placeholder: 'List acceptable alternates, VE ideas, or substitutions you want priced.' },
              { span: '', label: 'Quantity / Budget Context', key: 'quantity_context', placeholder: 'Approximate quantities, allowances, or pricing targets.' },
            ] as const).map(({ span, label, key, placeholder }) => (
              <div key={key} className={span}>
                <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>{label}</label>
                <textarea
                  rows={2}
                  value={(rfpDetails[key as keyof typeof rfpDetails] as string) ?? ''}
                  onChange={(e) => onRfpDetailsChange({ ...rfpDetails, [key]: e.target.value })}
                  className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
                  style={{ background: '#ede8e2', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
                  placeholder={placeholder}
                />
              </div>
            ))}
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Delivery ZIP / Jobsite Area</label>
              <input
                type="text"
                value={rfpDetails.delivery_zip ?? ''}
                onChange={(e) => onRfpDetailsChange({ ...rfpDetails, delivery_zip: e.target.value })}
                className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
                style={{ background: '#ede8e2', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
                placeholder="ZIP code or delivery area for freight estimates"
              />
            </div>
            {([
              { span: 'sm:col-span-2', label: 'Site Conditions', key: 'site_conditions', placeholder: 'Access, crane limits, storage constraints, floor loading, weather exposure, etc.' },
              { span: 'sm:col-span-2', label: 'Delivery Logistics / Handling', key: 'delivery_logistics', placeholder: 'Laydown limits, call-ahead, off-hours, unloading responsibilities, protected access paths, etc.' },
              { span: '', label: 'Required Delivery Window', key: 'delivery_window', placeholder: 'Needed on site by, date ranges, or milestone windows.' },
              { span: '', label: 'Phased Delivery Needs', key: 'phased_delivery', placeholder: 'Break into levels, sequences, release packages, or truckloads if needed.' },
              { span: '', label: 'Submittals / Documentation Required', key: 'submittals_required', placeholder: 'Shop drawings, product data, mill certs, warranty docs, mockups, etc.' },
              { span: '', label: 'Lead-Time Sensitivity', key: 'lead_time_sensitivity', placeholder: 'Long-lead concern, release urgency, or quote validity expectations.' },
              { span: '', label: 'Known Exclusions / Unknowns', key: 'exclusions', placeholder: 'List what is excluded, unresolved, or still subject to clarification.' },
              { span: '', label: 'Vendor Questions Requested', key: 'vendor_questions_requested', placeholder: 'What do you want vendors to answer in their response?' },
              { span: '', label: 'Vendor Guidance Requested', key: 'vendor_guidance_requested', placeholder: 'Ask vendors to recommend systems, alternates, sequencing, or supply approaches.' },
              { span: 'sm:col-span-2', label: 'Attachments / Spec Reference Summary', key: 'attachments_summary', placeholder: 'Summarize drawing sheets, detail callouts, addenda, or basis-of-design references.' },
            ] as const).map(({ span, label, key, placeholder }) => (
              <div key={key} className={span}>
                <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>{label}</label>
                <textarea
                  rows={2}
                  value={(rfpDetails[key as keyof typeof rfpDetails] as string) ?? ''}
                  onChange={(e) => onRfpDetailsChange({ ...rfpDetails, [key]: e.target.value })}
                  className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
                  style={{ background: '#ede8e2', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
                  placeholder={placeholder}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl shadow-sm" style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}>
        <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-end sm:justify-between" style={{ borderBottom: '1px solid #e2d9cf' }}>
          <div>
            <p className="text-sm font-semibold" style={SECTION_HEADING_STYLE}>Add Materials</p>
            <p className="mt-1 text-xs" style={{ color: '#4a6358' }}>
              Import a takeoff file or add materials manually with SKU, quantity, unit, specs, constraints, notes, budget, and lead time.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onToggleCustomizeFields}
              className="flex h-8 w-8 items-center justify-center rounded-xl transition-colors"
              style={isCustomizingFields
                ? { background: '#a85c2a', color: '#ffffff', border: '1px solid #a85c2a' }
                : { background: '#f5f0eb', color: '#4a6358', border: '1px solid #e2d9cf' }
              }
              aria-label="Customize fields"
              title="Customize fields"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="flex rounded-xl p-1" style={{ background: '#ede8e2', border: '1px solid #e2d9cf' }}>
              {(['import', 'manual'] as const).map((mode) => {
                const active = materialEntryMode === mode
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setMaterialEntryMode(mode)}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                    style={active
                      ? { background: '#ffffff', color: '#1e3a2f', boxShadow: '0 1px 3px rgba(30,58,47,0.12)' }
                      : { color: '#4a6358' }
                    }
                  >
                    {mode === 'import' ? 'Import File' : 'Manual Entry'}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <input
          id={importInputId}
          aria-label="Import takeoff file"
          type="file"
          accept=".csv,.tsv,.txt,.pdf,.xlsx,.xls,text/csv,text/tab-separated-values,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={handleImportFile}
          disabled={uploadingFiles}
          className="sr-only"
        />
        {importError && <p className="px-5 pt-4 text-xs" style={{ color: '#a85c2a' }}>{importError}</p>}

        {materialEntryMode === 'import' && (
          <div className="space-y-4 p-5">
            <label
              htmlFor={importInputId}
              onDragEnter={(event) => {
                event.preventDefault()
                setIsDraggingImport(true)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                setIsDraggingImport(true)
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDraggingImport(false)
              }}
              onDrop={handleImportDrop}
              className={cn(
                'flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl px-6 py-10 text-center transition-colors',
                uploadingFiles && 'pointer-events-none opacity-60',
                isDraggingImport && 'shadow-lg',
              )}
              style={isDraggingImport
                ? { background: '#fff5eb', border: '2px dashed #fa6b04', color: '#4a6358' }
                : { background: '#f5f0eb', border: '2px dashed #d4c7bb', color: '#4a6358' }}
            >
              <span
                className="mb-4 flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
                style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#fa6b04' }}
              >
                <UploadCloud className="h-8 w-8" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold" style={{ color: '#1e3a2f' }}>
                  {uploadingFiles ? 'Importing file...' : isDraggingImport ? 'Drop the takeoff file here' : 'Drop or click to import a takeoff file'}
                </span>
                <span className="mt-2 block max-w-md text-xs" style={{ color: '#8a9e96' }}>
                  Upload a CSV, TSV, TXT, PDF, or Excel takeoff with SKU, description, quantity, unit, specs, constraints, notes, target budget, and lead time.
                </span>
                {uploadingFiles && (
                  <span
                    className="mt-5 block h-2 w-64 max-w-full overflow-hidden rounded-full"
                    style={{ background: '#e2d9cf' }}
                    aria-label="Import progress"
                  >
                    <span
                      className="block h-full w-full animate-[pulse_1.1s_ease-in-out_infinite] rounded-full"
                      style={{ background: '#fa6b04' }}
                    />
                  </span>
                )}
              </span>
            </label>
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_LINE_ITEM_CSV)}`}
              download="rialto-rfq-line-items-sample.csv"
              className="inline-flex rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
            >
              Sample CSV
            </a>
          </div>
        )}

      {materialEntryMode === 'manual' && (
      <div>
        <div className="mb-5 overflow-hidden" style={{ background: '#ffffff' }}>
          <div
            ref={spreadsheetViewportRef}
            onScroll={() => syncSpreadsheetScroll('viewport')}
            className="overflow-x-auto transition-[width] duration-300 ease-out [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ background: '#ffffff' }}
          >
            <div style={{ width: `${spreadsheetWidth}px`, minWidth: '100%' }}>
            <div
              className="sticky top-0 z-20 grid items-center gap-0 border-b text-[11px] font-semibold uppercase tracking-wide"
              style={{ gridTemplateColumns: spreadsheetColumns, background: '#f5f0eb', borderColor: '#e2d9cf', color: '#4a6358' }}
            >
              <div
                className="sticky left-0 z-30 flex items-center justify-center border-r px-2 py-3 shadow-[8px_0_14px_-16px_rgba(15,23,42,0.5)]"
                style={{ borderColor: '#e2d9cf', background: '#ede8e2', left: 0 }}
              >
                <input
                  type="checkbox"
                  checked={items.length > 0 && selectedRowKeys.size === items.length}
                  ref={(el) => { if (el) el.indeterminate = selectedRowKeys.size > 0 && selectedRowKeys.size < items.length }}
                  onChange={(e) => setSelectedRowKeys(e.target.checked ? new Set(items.map((r) => r._key)) : new Set())}
                  aria-label="Select all rows"
                  className="h-4 w-4 cursor-pointer rounded accent-[#1e3a2f]"
                />
              </div>
              {['#', 'Item Description or SKU', 'Qty', 'Units'].map((heading, index) => (
                <div
                  key={heading}
                  className={cn(
                    'truncate whitespace-nowrap border-r px-3 py-3',
                    index <= 1 && 'sticky z-30 shadow-[8px_0_14px_-16px_rgba(15,23,42,0.5)]',
                  )}
                  style={{ borderColor: '#e2d9cf', background: '#ede8e2', left: index === 0 ? 40 : index === 1 ? 94 : undefined }}
                >
                  {heading}
                </div>
              ))}
              {spreadsheetAttributes.map((attribute) => (
                <div
                  key={`heading-${attribute.key}`}
                  draggable={isCustomizingFields}
                  onDragStart={() => {
                    setDraggedFieldKey(attribute.key)
                    setDragOverField(null)
                  }}
                  onDragOver={(event) => {
                    if (!isCustomizingFields) return
                    event.preventDefault()
                    const rect = event.currentTarget.getBoundingClientRect()
                    const position = event.clientX > rect.left + rect.width / 2 ? 'after' : 'before'
                    setDragOverField({ key: attribute.key, position })
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    const position = dragOverField?.key === attribute.key ? dragOverField.position : 'before'
                    if (draggedFieldKey && draggedFieldKey !== attribute.key) onTemplateFieldMove?.(draggedFieldKey, attribute.key, position)
                    setDraggedFieldKey(null)
                    setDragOverField(null)
                  }}
                  onDragLeave={() => {
                    if (dragOverField?.key === attribute.key) setDragOverField(null)
                  }}
                  onDragEnd={() => {
                    setDraggedFieldKey(null)
                    setDragOverField(null)
                  }}
                  className={cn(
                    'relative flex min-w-0 items-center gap-1 border-r px-3 py-3 transition-all duration-150',
                    isCustomizingFields && 'cursor-grab select-none active:cursor-grabbing',
                    draggedFieldKey === attribute.key && 'scale-[0.98] opacity-45',
                    dragOverField?.key === attribute.key && draggedFieldKey !== attribute.key && 'bg-[#fff1e8]',
                  )}
                  style={{
                    borderColor: '#e2d9cf',
                    boxShadow: dragOverField?.key === attribute.key && draggedFieldKey !== attribute.key
                      ? dragOverField.position === 'before'
                        ? 'inset 4px 0 0 #fa6b04, 0 8px 18px rgba(168,92,42,0.12)'
                        : 'inset -4px 0 0 #fa6b04, 0 8px 18px rgba(168,92,42,0.12)'
                      : undefined,
                  }}
                  title={isCustomizingFields && editingColKey !== attribute.key ? `Drag to reorder; click label to rename ${attribute.label}` : attribute.label}
                >
                  {isCustomizingFields && <GripVertical className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                  {isCustomizingFields && editingColKey === attribute.key ? (
                    <input
                      type="text"
                      value={editingColValue}
                      autoFocus
                      onChange={(e) => setEditingColValue(e.target.value)}
                      onBlur={() => commitColRename(attribute.key)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commitColRename(attribute.key) }
                        if (e.key === 'Escape') { setEditingColKey(null); setEditingColValue('') }
                      }}
                      className="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-[11px] normal-case tracking-normal focus:outline-none"
                      style={{ background: '#ffffff', border: '1px solid #fa6b04', color: '#1e3a2f' }}
                    />
                  ) : (
                    <span
                      className={cn('min-w-0 flex-1 truncate whitespace-nowrap', isCustomizingFields && 'cursor-text hover:text-[#a85c2a]')}
                      onClick={isCustomizingFields ? () => { setEditingColKey(attribute.key); setEditingColValue(attribute.label) } : undefined}
                    >
                      {attribute.label}
                    </span>
                  )}
                  {isCustomizingFields && (
                    <button
                      type="button"
                      onClick={() => onTemplateFieldRemove?.(attribute.key)}
                      className="shrink-0 rounded-full p-0.5 transition-colors"
                      style={{ color: '#8f3d22' }}
                      title={`Remove ${attribute.label}`}
                      aria-label={`Remove ${attribute.label}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {isCustomizingFields && (
                <button
                  type="button"
                  onClick={() => onTemplateFieldAddCustom?.()}
                  className="flex items-center justify-center gap-1 border-r px-2 py-3 text-[11px] font-semibold uppercase tracking-wide transition-colors hover:bg-[#efe9e2]"
                  style={{ borderColor: '#e2d9cf', color: '#4a6358' }}
                  title="Add a custom column"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Column
                </button>
              )}
              {[
                ...(requestType === 'rfp' && isVisible('specifications') ? ['Spec Summary', 'Spec Notes'] : []),
                ...(isVisible('targetBudget') ? ['Budget'] : []),
                ...(isVisible('suggestedLeadTime') ? ['Lead Time'] : []),
                ...(isVisible('specifications') ? ['Notes / Specs'] : []),
                ...(isVisible('certifications') ? ['Certifications'] : []),
              ].map((heading, index) => (
                <div key={`${heading}-${index}`} className="truncate whitespace-nowrap border-r px-3 py-3" style={{ borderColor: '#e2d9cf' }}>{heading}</div>
              ))}
              {vendorResponseColumns.map((heading, vcIdx) => {
                const isCoreCol = vcIdx < CORE_VENDOR_RESPONSE_COLUMNS.length
                const vendorField = !isCoreCol ? vendorResponseFields[vcIdx - CORE_VENDOR_RESPONSE_COLUMNS.length] : null
                const isEditingVendor = vendorField != null && editingColKey === `vendor:${vendorField.key}`
                const isRequired = isCoreCol || vendorField?.required !== false
                return (
                  <div
                    key={`vendor-response-${heading}`}
                    className="relative flex min-w-0 items-center gap-1 border-r px-3 py-3"
                    style={{ borderColor: '#f2c99d', background: '#fff5eb', color: '#8a4615' }}
                  >
                    {isCustomizingFields && isEditingVendor ? (
                      <input
                        type="text"
                        value={editingColValue}
                        autoFocus
                        onChange={(e) => setEditingColValue(e.target.value)}
                        onBlur={() => commitColRename(`vendor:${vendorField!.key}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); commitColRename(`vendor:${vendorField!.key}`) }
                          if (e.key === 'Escape') { setEditingColKey(null); setEditingColValue('') }
                        }}
                        className="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-[11px] normal-case tracking-normal focus:outline-none"
                        style={{ background: '#fff5eb', border: '1px solid #fa6b04', color: '#8a4615' }}
                      />
                    ) : (
                      <span
                        className={cn('min-w-0 flex-1 truncate whitespace-nowrap', isCustomizingFields && !isCoreCol && 'cursor-text hover:text-[#a85c2a]')}
                        onClick={isCustomizingFields && vendorField ? () => { setEditingColKey(`vendor:${vendorField.key}`); setEditingColValue(heading) } : undefined}
                      >
                        {heading}
                      </span>
                    )}
                    {isCustomizingFields && isCoreCol && (
                      <span className="shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold normal-case tracking-normal" style={{ background: '#1e3a2f', color: '#fff' }}>Req</span>
                    )}
                    {isCustomizingFields && vendorField && (
                      <>
                        <button
                          type="button"
                          onClick={() => onVendorResponseFieldToggleRequired?.(vendorField.key)}
                          className="shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold normal-case tracking-normal transition-colors"
                          style={isRequired
                            ? { background: '#1e3a2f', color: '#fff', border: '1px solid #1e3a2f' }
                            : { background: '#f5f0eb', color: '#4a6358', border: '1px solid #c8bfb4' }
                          }
                          title={isRequired ? 'Required — click to make optional' : 'Optional — click to make required'}
                        >
                          {isRequired ? 'Req' : 'Opt'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onVendorResponseFieldRemove?.(vendorField.key)}
                          className="shrink-0 rounded-full p-0.5 transition-colors"
                          style={{ color: '#8f3d22' }}
                          title={`Remove ${heading}`}
                          aria-label={`Remove ${heading}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
              {isCustomizingFields && (
                <button
                  type="button"
                  onClick={() => onVendorResponseFieldAdd?.()}
                  className="flex items-center justify-center gap-1 px-2 py-3 text-[11px] font-semibold uppercase tracking-wide transition-colors hover:bg-[#fff0e0]"
                  style={{ color: '#8a4615' }}
                  title="Add a vendor response column"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Vendor Col
                </button>
              )}
            </div>

            {items.map((row, idx) => {
              const inferredCategory = inferCategoryForRow(row, skuCategoryFilters[row._key] ?? null)
              const visibleAttributes = row.attributes ?? (fieldTemplate.length ? fieldsToAttributes(fieldTemplate) : buildLineItemAttributes(inferredCategory))
              const additionalSpecNotes = getAdditionalSpecNotes(row)
              const specSummary = composeLineItemSpecs(visibleAttributes, additionalSpecNotes)
              return (
                <div
                  key={row._key}
                  className="grid items-stretch gap-0 border-b last:border-b-0"
                  style={{ gridTemplateColumns: spreadsheetColumns, borderColor: '#f0ebe6' }}
                >
                  <div
                    className="sticky left-0 z-10 flex h-full items-center justify-center border-r px-2 py-2 shadow-[8px_0_14px_-16px_rgba(15,23,42,0.5)]"
                    style={{ borderColor: '#e2d9cf', background: selectedRowKeys.has(row._key) ? '#fff5eb' : '#ffffff', left: 0 }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedRowKeys.has(row._key)}
                      onChange={(e) => {
                        setSelectedRowKeys((prev) => {
                          const next = new Set(prev)
                          if (e.target.checked) next.add(row._key)
                          else next.delete(row._key)
                          return next
                        })
                      }}
                      aria-label={`Select row ${idx + 1}`}
                      className="h-4 w-4 cursor-pointer rounded accent-[#1e3a2f]"
                    />
                  </div>
                  <div className="sticky z-10 flex h-full items-center border-r px-3 py-2 text-xs font-semibold shadow-[8px_0_14px_-16px_rgba(15,23,42,0.5)]" style={{ borderColor: '#e2d9cf', background: selectedRowKeys.has(row._key) ? '#fff5eb' : '#ffffff', color: '#1e3a2f', left: 40 }}>
                    {idx + 1}
                  </div>
                  <SkuCell
                    sku={row.sku}
                    entries={skuDropdowns[row._key] ?? []}
                    onChange={(value) => handleSkuInput(row._key, value)}
                    onSelect={(entry) => selectSku(row._key, entry)}
                    stickyLeft={94}
                  />
                  <div className="border-r p-1.5" style={{ borderColor: '#f0ebe6' }}>
                    <label className="sr-only">Quantity</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.quantity || ''}
                      onChange={(e) => updateItem(row._key, 'quantity', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full rounded-md px-2 py-1.5 text-sm focus:outline-none"
                      style={{ background: '#fbf8f5', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
                    />
                  </div>
                  <div className="border-r p-1.5" style={{ borderColor: '#f0ebe6' }}>
                    <label className="sr-only">Units</label>
                    <select
                      value={row.unit}
                      onChange={(e) => updateItem(row._key, 'unit', e.target.value)}
                      className="w-full truncate rounded-md px-2 py-1.5 text-sm focus:outline-none"
                      style={{ background: '#fbf8f5', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
                    >
                      {UNIT_OPTION_GROUPS.map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.options.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  {visibleAttributes.map((attribute) => {
                    const canUseSelect = attribute.inputType === 'select' && (attribute.options?.length ?? 0) > 0
                    const options = canUseSelect ? attribute.options! : []
                    return (
                      <div key={`${row._key}-custom-${attribute.key}`} className="border-r p-1.5" style={{ borderColor: '#f0ebe6' }}>
                        <label className="sr-only">{attribute.label}{attribute.required ? ' required' : ''}</label>
                        {attribute.inputType === 'boolean' ? (
                          <button
                            type="button"
                            aria-pressed={attribute.value === 'Yes'}
                            onClick={() => updateAttribute(row._key, attribute.key, attribute.value === 'Yes' ? '' : 'Yes')}
                            className="w-full truncate rounded-md px-2 py-1.5 text-sm font-semibold"
                            style={attribute.value === 'Yes'
                              ? { background: '#1e3a2f', color: '#fff' }
                              : { background: '#fbf8f5', border: '1px solid #e2d9cf', color: '#4a6358' }}
                          >
                            {attribute.value === 'Yes' ? 'Yes' : 'No'}
                          </button>
                        ) : canUseSelect ? (
                          <select
                            value={attribute.value}
                            onChange={(e) => updateAttribute(row._key, attribute.key, e.target.value)}
                            className="w-full truncate rounded-md px-2 py-1.5 text-sm focus:outline-none"
                            style={{ background: '#fbf8f5', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
                          >
                            <option value="">Select</option>
                            {options.map((option) => (
                              <option key={`${attribute.key}-${option}`} value={option}>{option}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={attribute.inputType === 'number' || attribute.inputType === 'date' ? attribute.inputType : 'text'}
                            value={attribute.value}
                            onChange={(e) => updateAttribute(row._key, attribute.key, e.target.value)}
                            className="w-full truncate rounded-md px-2 py-1.5 text-sm focus:outline-none"
                            style={{ background: '#fbf8f5', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
                          />
                        )}
                      </div>
                    )
                  })}

                  {isCustomizingFields && (
                    <div className="border-r" style={{ borderColor: '#e2d9cf', background: '#f9f6f2' }} />
                  )}

                  {requestType === 'rfp' && isVisible('specifications') && (
                    <>
                      <div className="border-r p-1.5" style={{ borderColor: '#f0ebe6' }}>
                        <label className="sr-only">Specifications Summary</label>
                        <input
                          type="text"
                          value={specSummary}
                          readOnly
                          placeholder="Auto summary"
                          className="w-full truncate rounded-md px-2 py-1.5 text-sm focus:outline-none"
                          style={{ background: '#f5f0eb', border: '1px solid #e2d9cf', color: '#4a6358' }}
                        />
                      </div>
                      <div className="border-r p-1.5" style={{ borderColor: '#f0ebe6' }}>
                        <label className="sr-only">Additional Spec Notes</label>
                        <input
                          type="text"
                          value={additionalSpecNotes}
                          onChange={(e) => updateAdditionalSpecNotes(row._key, e.target.value)}
                          placeholder="Spec notes"
                          className="w-full truncate rounded-md px-2 py-1.5 text-sm focus:outline-none"
                          style={{ background: '#fbf8f5', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
                        />
                      </div>
                    </>
                  )}

                  {isVisible('targetBudget') && (
                    <div className={cn('relative border-r p-1.5', isCustomizingFields && 'bg-[#fff1e8]')} style={{ borderColor: '#f0ebe6' }}>
                      {isCustomizingFields && <RemoveFieldButton label="Target Budget" onClick={() => removeField('targetBudget')} />}
                      <label className="sr-only">Target Budget</label>
                      <div className="relative">
                        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2 text-xs" style={{ color: '#8a9e96' }}>$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.contractor_budget ?? ''}
                          onChange={(e) => updateItem(row._key, 'contractor_budget', e.target.value ? parseFloat(e.target.value) : undefined)}
                          placeholder="0"
                          className="w-full rounded-md py-1.5 pl-5 pr-2 text-sm focus:outline-none"
                          style={{ background: '#fbf8f5', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
                        />
                      </div>
                    </div>
                  )}

                  {isVisible('suggestedLeadTime') && (
                    <div className={cn('relative border-r p-1.5', isCustomizingFields && 'bg-[#fff1e8]')} style={{ borderColor: '#f0ebe6' }}>
                      {isCustomizingFields && <RemoveFieldButton label="Suggested Lead Time" onClick={() => removeField('suggestedLeadTime')} />}
                      <label className="sr-only">Suggested Lead Time</label>
                      <input
                        type="number"
                        min="1"
                        value={row.suggested_lead_time_days ?? ''}
                        onChange={(e) => updateItem(row._key, 'suggested_lead_time_days', e.target.value ? parseInt(e.target.value, 10) : undefined)}
                        placeholder="Days"
                        className="w-full rounded-md px-2 py-1.5 text-sm focus:outline-none"
                        style={{ background: '#fbf8f5', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
                      />
                    </div>
                  )}

                  {isVisible('specifications') && (
                    <div className={cn('relative border-r p-1.5', isCustomizingFields && 'bg-[#fff1e8]')} style={{ borderColor: '#f0ebe6' }}>
                      {isCustomizingFields && <RemoveFieldButton label="Notes / Specifications" onClick={() => removeField('specifications')} />}
                      <label className="sr-only">Notes/Specifications</label>
                      <input
                        type="text"
                        value={row.specs ?? ''}
                        onChange={(e) => updateItem(row._key, 'specs', e.target.value)}
                        placeholder="Notes, specs, delivery"
                        className="w-full truncate rounded-md px-2 py-1.5 text-sm focus:outline-none"
                        style={{ background: '#fbf8f5', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
                      />
                    </div>
                  )}

                  {isVisible('certifications') && (
                    <div className={cn('relative border-r p-1.5', isCustomizingFields && 'bg-[#fff1e8]')} style={{ borderColor: '#f0ebe6' }}>
                      {isCustomizingFields && <RemoveFieldButton label="Certifications Required" onClick={() => removeField('certifications')} />}
                      <label className="sr-only">Certifications Required</label>
                      <input
                        type="text"
                        value={(row.certifications ?? []).join(', ')}
                        onChange={(e) => updateItem(row._key, 'certifications', e.target.value.split(',').map((entry) => entry.trim()).filter(Boolean))}
                        placeholder="ASTM, ISO..."
                        className="w-full truncate rounded-md px-2 py-1.5 text-sm focus:outline-none"
                        style={{ background: '#fbf8f5', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
                      />
                    </div>
                  )}

                  {vendorResponseColumns.map((heading, vendorIndex) => (
                    <div
                      key={`${row._key}-vendor-response-${heading}`}
                      className="border-r p-1.5"
                      style={{ borderColor: '#f2c99d', background: '#fffaf4' }}
                    >
                      <input
                        type="text"
                        value={vendorIndex === 0 ? '$ --' : vendorIndex === 1 ? '-- days' : ''}
                        readOnly
                        aria-label={`${heading} vendor response`}
                        className="w-full truncate rounded-md px-2 py-1.5 text-sm focus:outline-none"
                        style={{ background: '#fff5eb', border: '1px solid #f2c99d', color: '#9a5a12' }}
                      />
                    </div>
                  ))}
                  {isCustomizingFields && (
                    <>
                      <div className="border-r" style={{ borderColor: '#e2d9cf', background: '#f9f6f2' }} />
                      <div style={{ background: '#fffcf8' }} />
                    </>
                  )}

                  {isCustomizingFields && (
                    <div style={{ background: '#fffcf8' }} />
                  )}

                </div>
              )
            })}
            </div>
          </div>
          <div
            ref={spreadsheetScrollbarRef}
            onScroll={() => syncSpreadsheetScroll('bar')}
            className="mt-1 overflow-x-auto"
            style={{ height: '10px' }}
            aria-label="Scroll material columns"
          >
            <div style={{ width: spreadsheetScrollWidth, height: 1 }} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => onItemsChange([...items, newRow(category, fieldTemplate)])}
          className="mx-5 mb-5 w-[calc(100%-40px)] rounded-xl py-3 text-sm font-semibold transition-colors"
          style={{ border: '2px dashed #e2d9cf', background: '#ffffff', color: '#4a6358' }}
        >
          Add another item
        </button>
      </div>
        )}
      </div>

      {selectedRowKeys.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl px-5 py-3 shadow-2xl" style={{ background: '#1e3a2f', border: '1px solid #2f4a3a' }}>
          <span className="text-sm font-semibold" style={{ color: '#ffffff' }}>
            {selectedRowKeys.size} row{selectedRowKeys.size !== 1 ? 's' : ''} selected
          </span>
          <button
            type="button"
            onClick={() => {
              const filtered = items.filter((r) => !selectedRowKeys.has(r._key))
              onItemsChange(filtered.length > 0 ? filtered : [newRow(category, fieldTemplate)])
              setSelectedRowKeys(new Set())
            }}
            className="rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors"
            style={{ background: '#c0392b', color: '#ffffff' }}
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => setSelectedRowKeys(new Set())}
            className="rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#ffffff' }}
          >
            Clear
          </button>
        </div>
      )}

      <div className="rounded-2xl p-5" style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}>
        <div className="mb-3">
          <p className="text-sm font-semibold" style={SECTION_HEADING_STYLE}>Notes</p>
          <p className="mt-1 text-xs" style={{ color: '#4a6358' }}>
            Add any overall context vendors should know about this material request.
          </p>
        </div>
        <textarea
          rows={3}
          value={rfpDetails.unknowns_or_questions ?? ''}
          onChange={(event) => onRfpDetailsChange({ ...rfpDetails, unknowns_or_questions: event.target.value })}
          placeholder="Example: substitutions allowed, pricing assumptions, delivery preferences, or anything vendors should clarify."
          className="w-full resize-y rounded-xl px-3 py-2 text-sm focus:outline-none"
          style={{ background: '#f5f0eb', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
        />
      </div>
    </div>
  )
}

function SkuCell({
  sku,
  entries,
  onChange,
  onSelect,
  stickyLeft,
}: {
  sku: string
  entries: SKUEntry[]
  onChange: (value: string) => void
  onSelect: (entry: SKUEntry) => void
  stickyLeft?: number
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const open = entries.length > 0

  useLayoutEffect(() => {
    if (!open) return
    function update() {
      const el = wrapperRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const desiredWidth = 420
      const margin = 8
      const maxLeft = window.innerWidth - margin - desiredWidth
      const left = Math.max(margin, Math.min(rect.left, maxLeft))
      setPos({ top: rect.bottom + 4, left, width: desiredWidth })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  return (
    <div
      ref={wrapperRef}
      className={cn('relative border-r p-1.5', stickyLeft !== undefined && 'sticky z-10 shadow-[8px_0_14px_-16px_rgba(15,23,42,0.5)]')}
      style={{ borderColor: '#e2d9cf', background: '#ffffff', left: stickyLeft }}
    >
      <label className="sr-only">Item Description or SKU</label>
      <input
        type="text"
        value={sku}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Description or SKU"
        className="w-full truncate rounded-md px-2 py-1.5 text-sm focus:outline-none"
        style={{ background: '#fbf8f5', border: '1px solid #e2d9cf', color: '#1e3a2f', fontFamily: 'var(--font-dm-mono, monospace)' }}
      />
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-50 max-h-60 overflow-y-auto rounded-xl shadow-xl"
          style={{ top: pos.top, left: pos.left, width: pos.width, background: '#ffffff', border: '1px solid #e2d9cf' }}
        >
          {entries.map((entry) => (
            <button
              key={entry.sku}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(entry)}
              className="w-full px-3 py-2 text-left transition-colors"
              style={{ borderBottom: '1px solid #f0ebe6' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#ede8e2' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '' }}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium" style={{ color: '#1e3a2f', fontFamily: 'var(--font-dm-mono, monospace)' }}>{entry.sku}</p>
                <span className="rounded px-1.5 py-0.5 text-xs" style={{ background: '#ede8e2', color: '#8a9e96' }}>{entry.category}</span>
              </div>
              <p className="text-xs" style={{ color: '#4a6358' }}>{entry.description}</p>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
