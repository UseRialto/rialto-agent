import type { ProcurementLineItemAttribute } from '@/lib/types/procurement'

export type CustomLineItemFieldInputType = 'text' | 'number' | 'select' | 'date' | 'boolean'
export type CustomLineItemFieldSource = 'system' | 'trade' | 'spreadsheet' | 'ai' | 'user'

export interface CustomLineItemFieldDefinition {
  key: string
  label: string
  inputType: CustomLineItemFieldInputType
  required: boolean
  visible: boolean
  options: string[]
  source: CustomLineItemFieldSource
  order: number
  helperText?: string
  group?: string
}

export interface ContractorCustomizationSettings {
  trade?: string
  templateVersion: number
  lineItemFields: CustomLineItemFieldDefinition[]
  vendorResponseFields?: CustomLineItemFieldDefinition[]
  rfqCreationFieldVisibility?: Record<string, boolean>
  inferenceSource?: 'default' | 'trade' | 'spreadsheet' | 'ai' | 'user' | 'skipped'
  updatedAt: string
}

export interface ContractorFieldBankEntry {
  key: string
  label: string
  group: string
  inputType?: CustomLineItemFieldInputType
  helperText?: string
  options?: string[]
  trades?: string[]
}

export const CONTRACTOR_CUSTOMIZATION_VERSION = 1
export type RFQCreationFieldVisibilitySettings = Record<string, boolean>
export const DEFAULT_RFQ_CREATION_FIELD_VISIBILITY_SETTINGS: RFQCreationFieldVisibilitySettings = {
  specifications: false,
  targetBudget: false,
  suggestedLeadTime: false,
  certifications: false,
  supplierRequirements: false,
  specBuilder: false,
}
export const STANDARD_RFQ_CREATION_FIELDS = [
  { key: 'specifications', label: 'Notes / Specs', aliases: ['notes', 'note', 'spec', 'specs', 'specifications', 'notes specs'] },
  { key: 'targetBudget', label: 'Budget', aliases: ['budget', 'target budget', 'cost target'] },
  { key: 'suggestedLeadTime', label: 'Lead Time', aliases: ['lead time', 'leadtime', 'days', 'delivery days'] },
  { key: 'certifications', label: 'Certifications', aliases: ['certification', 'certifications', 'certs', 'certificate'] },
] as const

export const CORE_LINE_ITEM_FIELD_KEYS = ['description', 'quantity', 'unit']
const CORE_LINE_ITEM_FIELD_KEY_ALIASES = new Set([
  'description',
  'desc',
  'item',
  'item_description',
  'item_description_or_sku',
  'material',
  'material_description',
  'product',
  'product_description',
  'product_type',
  'product_type_or_sku',
  'sku',
  'item_sku',
  'product_sku',
  'quantity',
  'qty',
  'unit',
  'units',
  'uom',
  'unit_of_measure',
  'unit_of_measurement',
])
const CORE_VENDOR_RESPONSE_FIELD_KEY_ALIASES = new Set([
  'unit_price',
  'price',
  'vendor_price',
  'lead_time',
  'lead_time_days',
])

export const BUILT_IN_LINE_ITEM_FIELD_BANK: ContractorFieldBankEntry[] = [
  { key: 'manufacturer', label: 'Manufacturer / Brand', group: 'Product identity', helperText: 'Preferred brand, acceptable brand, or no preference.' },
  { key: 'model_or_part_number', label: 'Model / Part Number', group: 'Product identity' },
  { key: 'size_or_dimensions', label: 'Size / Dimensions', group: 'Product identity' },
  { key: 'material_family', label: 'Material Family', group: 'Product identity' },
  { key: 'finish_or_color', label: 'Finish / Color', group: 'Finish and spec' },
  { key: 'grade_or_spec', label: 'Grade / Spec', group: 'Finish and spec' },
  { key: 'standard', label: 'Standard / Code', group: 'Finish and spec', options: ['ASTM', 'AAMA', 'UL listed', 'Buy America compliant'] },
  { key: 'coating_or_treatment', label: 'Coating / Treatment', group: 'Finish and spec' },
  { key: 'drawing_reference', label: 'Drawing / Spec Reference', group: 'Project context' },
  { key: 'phase_or_area', label: 'Phase / Area / Level', group: 'Project context' },
  { key: 'location', label: 'Install Location', group: 'Project context' },
  { key: 'submittals', label: 'Submittals / Docs Required', group: 'Vendor expectations' },
  { key: 'warranty', label: 'Warranty Requirement', group: 'Vendor expectations' },
  { key: 'packaging', label: 'Packaging / Bundle', group: 'Delivery' },
  { key: 'delivery_window', label: 'Delivery Window', group: 'Delivery', inputType: 'date' },
  { key: 'alternates', label: 'Alternates Allowed', group: 'Vendor expectations' },
  { key: 'compliance_docs', label: 'Compliance Docs', group: 'Vendor expectations' },
  { key: 'fire_rating', label: 'Fire Rating', group: 'Trade specific', trades: ['drywall', 'doors', 'glazing', 'mep'] },
  { key: 'performance', label: 'Performance Criteria', group: 'Trade specific', trades: ['glazing', 'mechanical', 'electrical'] },
  { key: 'pressure_rating', label: 'Pressure / Schedule Rating', group: 'Trade specific', trades: ['mep', 'plumbing', 'mechanical'] },
  { key: 'insulation_r_value', label: 'Insulation / R-Value', group: 'Trade specific', trades: ['roofing', 'mechanical', 'drywall'] },
  { key: 'glass_makeup', label: 'Glass Makeup', group: 'Trade specific', trades: ['glazing'] },
  { key: 'mix_design', label: 'Mix Design / PSI', group: 'Trade specific', trades: ['concrete'] },
  { key: 'steel_shape', label: 'Steel Shape / Profile', group: 'Trade specific', trades: ['steel'] },
]

export const BUILT_IN_VENDOR_RESPONSE_FIELD_BANK: ContractorFieldBankEntry[] = [
  { key: 'freight_cost', label: 'Freight Cost', group: 'Vendor response', inputType: 'number' },
  { key: 'finish_or_color', label: 'Finish / Color', group: 'Vendor response' },
  { key: 'grade_or_spec', label: 'Grade / Spec', group: 'Vendor response' },
  { key: 'manufacturer_quoted', label: 'Manufacturer Quoted', group: 'Vendor response' },
  { key: 'model_or_part_number', label: 'Model / Part Number', group: 'Vendor response' },
  { key: 'tax_included', label: 'Tax Included', group: 'Vendor response', inputType: 'boolean' },
  { key: 'delivery_date', label: 'Delivery Date', group: 'Vendor response', inputType: 'date' },
  { key: 'quote_expiration_date', label: 'Quote Expiration Date', group: 'Vendor response', inputType: 'date' },
  { key: 'alternate_offered', label: 'Alternate Offered', group: 'Vendor response' },
  { key: 'warranty_included', label: 'Warranty Included', group: 'Vendor response' },
  { key: 'minimum_order_quantity', label: 'Minimum Order Quantity', group: 'Vendor response', inputType: 'number' },
  { key: 'payment_terms', label: 'Payment Terms', group: 'Vendor response' },
  { key: 'shipping_method', label: 'Shipping Method', group: 'Vendor response' },
  { key: 'quote_notes', label: 'Quote Notes', group: 'Vendor response' },
]

const DEFAULT_FIELD_KEYS = [
  'manufacturer',
  'model_or_part_number',
  'size_or_dimensions',
  'finish_or_color',
  'grade_or_spec',
  'drawing_reference',
  'phase_or_area',
  'submittals',
]

const TRADE_DEFAULTS: Record<string, string[]> = {
  steel: ['steel_shape', 'grade_or_spec', 'coating_or_treatment', 'drawing_reference', 'phase_or_area', 'compliance_docs'],
  concrete: ['mix_design', 'standard', 'phase_or_area', 'delivery_window', 'submittals'],
  glazing: ['glass_makeup', 'finish_or_color', 'performance', 'drawing_reference', 'warranty'],
  roofing: ['finish_or_color', 'insulation_r_value', 'warranty', 'delivery_window', 'submittals'],
  mechanical: ['manufacturer', 'model_or_part_number', 'pressure_rating', 'insulation_r_value', 'submittals'],
  plumbing: ['manufacturer', 'model_or_part_number', 'pressure_rating', 'standard', 'submittals'],
  electrical: ['manufacturer', 'model_or_part_number', 'standard', 'drawing_reference', 'submittals'],
}

function normalizeTrade(value?: string) {
  return (value ?? '').trim().toLowerCase()
}

export function normalizeFieldKey(label: string) {
  return label
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || `field_${Math.random().toString(36).slice(2, 8)}`
}

export function isCoreLineItemFieldLike(labelOrKey: string) {
  const key = normalizeFieldKey(labelOrKey)
  return CORE_LINE_ITEM_FIELD_KEY_ALIASES.has(key)
}

export function isCoreVendorResponseFieldLike(labelOrKey: string) {
  const key = normalizeFieldKey(labelOrKey)
  return CORE_VENDOR_RESPONSE_FIELD_KEY_ALIASES.has(key)
}

export function normalizeFieldLabel(label: string) {
  return label.replace(/\s+/g, ' ').trim().slice(0, 60)
}

function bankEntryForKey(key: string) {
  return BUILT_IN_LINE_ITEM_FIELD_BANK.find((entry) => entry.key === key)
    ?? BUILT_IN_VENDOR_RESPONSE_FIELD_BANK.find((entry) => entry.key === key)
}

function fromBankEntry(entry: ContractorFieldBankEntry, order: number, source: CustomLineItemFieldSource): CustomLineItemFieldDefinition {
  return {
    key: normalizeFieldKey(entry.key),
    label: normalizeFieldLabel(entry.label),
    inputType: entry.inputType ?? 'text',
    required: false,
    visible: true,
    options: entry.options ?? [],
    source,
    order,
    helperText: entry.helperText,
    group: entry.group,
  }
}

export function makeFieldDefinition(
  labelOrKey: string,
  order: number,
  source: CustomLineItemFieldSource = 'user',
  overrides: Partial<CustomLineItemFieldDefinition> = {},
): CustomLineItemFieldDefinition {
  const normalizedKey = normalizeFieldKey(overrides.key ?? labelOrKey)
  const bank = bankEntryForKey(normalizedKey)
  return {
    key: normalizedKey,
    label: normalizeFieldLabel(overrides.label ?? bank?.label ?? labelOrKey),
    inputType: overrides.inputType ?? bank?.inputType ?? 'text',
    required: Boolean(overrides.required),
    visible: overrides.visible ?? true,
    options: (overrides.options ?? bank?.options ?? []).map(normalizeFieldLabel).filter(Boolean).slice(0, 20),
    source: overrides.source ?? source,
    order,
    helperText: overrides.helperText ?? bank?.helperText,
    group: overrides.group ?? bank?.group ?? 'Custom',
  }
}

export function defaultContractorCustomization(trade?: string, inferenceSource: ContractorCustomizationSettings['inferenceSource'] = 'default'): ContractorCustomizationSettings {
  const normalizedTrade = normalizeTrade(trade)
  const tradeKey = Object.keys(TRADE_DEFAULTS).find((key) => normalizedTrade.includes(key))
  const keys = tradeKey ? TRADE_DEFAULTS[tradeKey] : DEFAULT_FIELD_KEYS
  const fields = keys
    .map((key, index) => bankEntryForKey(key) ?? { key, label: key, group: 'Custom' })
    .map((entry, index) => fromBankEntry(entry, index, tradeKey ? 'trade' : 'system'))
  return {
    trade: trade?.trim() || undefined,
    templateVersion: CONTRACTOR_CUSTOMIZATION_VERSION,
    lineItemFields: fields,
    vendorResponseFields: [],
    rfqCreationFieldVisibility: DEFAULT_RFQ_CREATION_FIELD_VISIBILITY_SETTINGS,
    inferenceSource,
    updatedAt: new Date().toISOString(),
  }
}

export function sanitizeLineItemFields(fields?: Partial<CustomLineItemFieldDefinition>[]): CustomLineItemFieldDefinition[] {
  const seen = new Set<string>()
  return (fields ?? [])
    .map((field, index) => {
      const label = normalizeFieldLabel(field.label ?? field.key ?? '')
      if (!label) return null
      const key = normalizeFieldKey(field.key ?? label)
      if (isCoreLineItemFieldLike(key) || seen.has(key)) return null
      seen.add(key)
      return makeFieldDefinition(label, index, field.source ?? 'user', {
        ...field,
        key,
        label,
        visible: field.visible ?? true,
        order: index,
      })
    })
    .filter((field): field is CustomLineItemFieldDefinition => Boolean(field))
    .slice(0, 18)
}

export function sanitizeVendorResponseFields(fields?: Partial<CustomLineItemFieldDefinition>[]): CustomLineItemFieldDefinition[] {
  return sanitizeLineItemFields(fields).filter((field) => !isCoreVendorResponseFieldLike(field.key) && !isCoreVendorResponseFieldLike(field.label))
}

export function sanitizeContractorCustomization(value?: Partial<ContractorCustomizationSettings> | null): ContractorCustomizationSettings {
  const fallback = defaultContractorCustomization(value?.trade, value?.inferenceSource ?? 'default')
  const hasLineItemFields = Array.isArray(value?.lineItemFields)
  const fields = sanitizeLineItemFields(value?.lineItemFields)
  const vendorResponseFields = sanitizeVendorResponseFields(value?.vendorResponseFields)
  return {
    trade: value?.trade?.trim() || fallback.trade,
    templateVersion: CONTRACTOR_CUSTOMIZATION_VERSION,
    lineItemFields: hasLineItemFields ? fields : fallback.lineItemFields,
    vendorResponseFields,
    rfqCreationFieldVisibility: value?.rfqCreationFieldVisibility ?? fallback.rfqCreationFieldVisibility,
    inferenceSource: value?.inferenceSource ?? fallback.inferenceSource,
    updatedAt: value?.updatedAt ?? new Date().toISOString(),
  }
}

export function contractorCustomizationFromUser(user?: { company_info?: { contractor_customization?: Partial<ContractorCustomizationSettings> } } | null): ContractorCustomizationSettings {
  return sanitizeContractorCustomization(user?.company_info?.contractor_customization)
}

function normalizedInstructionText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function instructionMentionsStandardField(message: string, field: { label: string; aliases: readonly string[] }) {
  const normalized = normalizedInstructionText(message)
  return [field.label, ...field.aliases].some((alias) => {
    const normalizedAlias = normalizedInstructionText(alias)
    return normalizedAlias.length > 1 && normalized.includes(normalizedAlias)
  })
}

export function inferRFQCreationFieldVisibilityChanges(
  message: string,
  current: RFQCreationFieldVisibilitySettings = DEFAULT_RFQ_CREATION_FIELD_VISIBILITY_SETTINGS,
  removeAll = false,
): RFQCreationFieldVisibilitySettings {
  const next: RFQCreationFieldVisibilitySettings = {}
  if (removeAll) {
    STANDARD_RFQ_CREATION_FIELDS.forEach((field) => {
      next[field.key] = false
    })
    return next
  }
  const clauses = [...message.matchAll(/\b(remove|delete|clear|hide|drop|strip|add|include|need|track|show|capture|insert|create)\b/gi)]
    .map((match, index, matches) => ({
      action: match[1].toLowerCase(),
      text: message.slice(match.index ?? 0, matches[index + 1]?.index ?? message.length),
    }))
  const scopedClauses = clauses.length ? clauses : [{ action: 'add', text: message }]
  scopedClauses.forEach((clause) => {
    const shouldShow = !/^(remove|delete|clear|hide|drop|strip)$/i.test(clause.action)
    STANDARD_RFQ_CREATION_FIELDS.forEach((field) => {
      if (instructionMentionsStandardField(clause.text, field) && current[field.key] !== shouldShow) {
        next[field.key] = shouldShow
      }
    })
  })
  return next
}

export function fieldsToAttributes(
  fields: CustomLineItemFieldDefinition[],
  existing?: ProcurementLineItemAttribute[],
): ProcurementLineItemAttribute[] {
  const existingMap = new Map((existing ?? []).map((attribute) => [attribute.key, attribute.value ?? '']))
  const existingLabelMap = new Map((existing ?? []).map((attribute) => [normalizeFieldKey(attribute.label), attribute.value ?? '']))
  return sanitizeLineItemFields(fields)
    .filter((field) => field.visible)
    .sort((a, b) => a.order - b.order)
    .map((field) => ({
      key: field.key,
      label: field.label,
      value: existingMap.get(field.key) ?? existingLabelMap.get(normalizeFieldKey(field.label)) ?? '',
      group: field.group,
      helperText: field.helperText,
      inputType: field.inputType,
      required: field.required,
      visible: field.visible,
      options: field.options,
      source: field.source,
      order: field.order,
    }))
}

export function attributesToFieldDefinitions(attributes?: ProcurementLineItemAttribute[]): CustomLineItemFieldDefinition[] {
  return sanitizeLineItemFields((attributes ?? []).map((attribute, index) => ({
    key: attribute.key,
    label: attribute.label,
    inputType: attribute.inputType ?? 'text',
    required: attribute.required ?? false,
    visible: attribute.visible ?? true,
    options: attribute.options ?? [],
    source: attribute.source ?? 'user',
    order: attribute.order ?? index,
    helperText: attribute.helperText,
    group: attribute.group,
  })))
}

export function mergeFieldDefinitions(
  current: CustomLineItemFieldDefinition[],
  incoming: Partial<CustomLineItemFieldDefinition>[],
) {
  const byKey = new Map(sanitizeLineItemFields(current).map((field) => [field.key, field]))
  for (const field of sanitizeLineItemFields(incoming)) byKey.set(field.key, { ...byKey.get(field.key), ...field })
  return sanitizeLineItemFields([...byKey.values()].map((field, index) => ({ ...field, order: index })))
}
