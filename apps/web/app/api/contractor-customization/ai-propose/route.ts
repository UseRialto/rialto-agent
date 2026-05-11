import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import {
  BUILT_IN_LINE_ITEM_FIELD_BANK,
  BUILT_IN_VENDOR_RESPONSE_FIELD_BANK,
  makeFieldDefinition,
  mergeFieldDefinitions,
  sanitizeLineItemFields,
  sanitizeVendorResponseFields,
  type CustomLineItemFieldDefinition,
} from '@/lib/contractor-customization'

const DEFAULT_MODEL = 'gemini-2.5-flash'

type Body = {
  message?: string
  trade?: string
  currentFields?: CustomLineItemFieldDefinition[]
  currentVendorResponseFields?: CustomLineItemFieldDefinition[]
  includeVendorResponseFields?: boolean
}

type FieldProposal = {
  fields: CustomLineItemFieldDefinition[]
  vendorResponseFields?: CustomLineItemFieldDefinition[]
  addedKeys: string[]
  removedKeys: string[]
  addedVendorResponseKeys?: string[]
  removedVendorResponseKeys?: string[]
  removeAll: boolean
  summary: string
}

const ACTION_PATTERN = '\\b(remove|delete|clear|hide|drop|strip|add|include|need|track|show|capture|insert|create|make|put)\\b'
const ADD_WORDS = new Set(['add', 'include', 'need', 'track', 'show', 'capture', 'insert', 'create', 'make', 'put'])
const REMOVE_WORDS = new Set(['remove', 'delete', 'clear', 'hide', 'drop', 'strip'])
const GENERIC_TOKENS = new Set([
  'a',
  'an',
  'and',
  'as',
  'by',
  'column',
  'columns',
  'field',
  'fields',
  'for',
  'from',
  'have',
  'item',
  'line',
  'material',
  'me',
  'need',
  'of',
  'on',
  'request',
  'rfq',
  'the',
  'to',
  'vendor',
  'vendors',
  'response',
  'supplier',
  'suppliers',
])
const FIELD_SYNONYMS: Record<string, string[]> = {
  alternates: ['alternate', 'alternates', 'substitution', 'substitutions', 'approved equal'],
  coating_or_treatment: ['coating', 'paint', 'galvanized', 'galvanization', 'treatment', 'treated'],
  compliance_docs: ['compliance', 'certs', 'certificates', 'certifications', 'documents', 'docs'],
  delivery_date: ['delivery date', 'ship date', 'arrival date'],
  delivery_window: ['delivery', 'delivery window', 'deliver by', 'needed by', 'ship window'],
  drawing_reference: ['drawing', 'drawings', 'spec section', 'spec reference', 'plan', 'plans', 'detail'],
  finish_or_color: ['finish', 'finishes', 'color', 'colour', 'paint color', 'material finish'],
  fire_rating: ['fire rating', 'fire rated', 'hour rating'],
  freight_cost: ['freight', 'freigh', 'freight cost', 'freigh cost', 'shipping cost', 'delivery cost', 'transportation cost'],
  grade_or_spec: ['grade', 'spec', 'specification', 'specifications', 'rating', 'class'],
  insulation_r_value: ['insulation', 'r value', 'r-value'],
  location: ['location', 'install location', 'room', 'area installed'],
  manufacturer: ['manufacturer', 'brand', 'make', 'mfr'],
  manufacturer_quoted: ['manufacturer', 'brand', 'make', 'mfr', 'manufacturer quoted', 'brand quoted'],
  material_family: ['material', 'material type', 'family'],
  minimum_order_quantity: ['moq', 'minimum order', 'minimum order quantity', 'min qty'],
  mix_design: ['mix', 'mix design', 'psi', 'slump', 'concrete strength'],
  model_or_part_number: ['model', 'part', 'part number', 'model number', 'sku', 'catalog number'],
  packaging: ['packaging', 'bundle', 'pallet', 'crate'],
  payment_terms: ['payment', 'payment terms', 'terms'],
  performance: ['performance', 'criteria', 'performance criteria'],
  phase_or_area: ['phase', 'area', 'level', 'floor', 'zone'],
  pressure_rating: ['pressure', 'schedule', 'pressure rating', 'schedule rating'],
  quote_expiration_date: ['expiration', 'expiry', 'quote expiration', 'valid until'],
  quote_notes: ['notes', 'quote notes', 'vendor notes'],
  shipping_method: ['shipping', 'shipping method', 'delivery method', 'carrier'],
  size_or_dimensions: ['size', 'sizes', 'dimension', 'dimensions', 'length', 'width', 'height', 'diameter'],
  standard: ['standard', 'code', 'astm', 'ul', 'ansi'],
  steel_shape: ['shape', 'profile', 'steel shape', 'beam size'],
  submittals: ['submittal', 'submittals', 'docs required', 'shop drawings', 'data sheet'],
  tax_included: ['tax', 'tax included', 'sales tax'],
  warranty: ['warranty', 'warranties'],
  warranty_included: ['warranty', 'warranty included'],
}

function isRemoveAllRequest(message: string) {
  return /\b(remove|delete|clear|hide|strip)\b[\s\S]{0,60}\b(everything|all|all fields|every field|optional fields|non[-\s]?required|non[-\s]?core)\b/i.test(message)
}

function isRemovalRequest(message: string) {
  return /\b(remove|delete|clear|hide|drop|strip)\b/i.test(message)
}

function isAdditionRequest(message: string) {
  return /\b(add|include|need|track|show|capture|insert|create)\b/i.test(message)
}

function isVendorResponseIntent(message: string) {
  return /\b(vendor|supplier|quote|bid|response|respond|return|provide back|fill out|fills out|their column|their field|pricing|price|lead time|freight|tax|delivery date|expiration|alternate|payment terms)\b/i.test(message)
}

function intentText(message: string, intent: 'add' | 'remove') {
  const actions = [...message.matchAll(/\b(remove|delete|clear|hide|drop|strip|add|include|need|track|show|capture|insert|create)\b/gi)]
    .map((match) => ({
      word: match[1].toLowerCase(),
      index: match.index ?? 0,
    }))
  const addWords = new Set(['add', 'include', 'need', 'track', 'show', 'capture', 'insert', 'create'])
  const removeWords = new Set(['remove', 'delete', 'clear', 'hide', 'drop', 'strip'])

  return actions
    .map((action, index) => {
      const isTargetIntent = intent === 'add' ? addWords.has(action.word) : removeWords.has(action.word)
      if (!isTargetIntent) return ''
      const nextAction = actions[index + 1]
      return message.slice(action.index, nextAction?.index ?? message.length)
    })
    .filter(Boolean)
    .join(' ')
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function titleCaseLabel(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase()
      if (['and', 'or', 'of', 'per'].includes(lower)) return lower
      if (lower === 'id') return 'ID'
      if (lower === 'sku') return 'SKU'
      if (lower === 'moq') return 'MOQ'
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(' ')
}

function tokenSet(value: string) {
  return new Set(normalizeText(value).split(' ').filter((token) => token.length > 1 && !GENERIC_TOKENS.has(token)))
}

function splitList(value: string) {
  const cleaned = cleanRequestedFieldPhrase(value)
    .replace(/\bthen\b/gi, ',')
    .replace(/\bplus\b/gi, ',')
    .replace(/\balso\b/gi, ',')
  return cleaned
    .split(/\s*,\s*|\s*&\s*|\s+and\s+/i)
    .map((part) => cleanRequestedFieldPhrase(part))
    .filter((part) => part.length > 1)
}

function entrySearchText(entry: { key: string; label: string; group?: string }) {
  return [
    entry.key.replace(/_/g, ' '),
    entry.label,
    entry.group ?? '',
    ...(FIELD_SYNONYMS[entry.key] ?? []),
  ].join(' ')
}

function bankScore(phrase: string, entry: { key: string; label: string; group?: string }) {
  const normalized = normalizeText(cleanRequestedFieldPhrase(phrase))
  if (!normalized) return 0
  const phraseTokens = tokenSet(normalized)
  const search = normalizeText(entrySearchText(entry))
  const searchTokens = tokenSet(search)
  const exactSynonym = (FIELD_SYNONYMS[entry.key] ?? []).some((synonym) => normalizeText(synonym) === normalized)
  const containsSynonym = (FIELD_SYNONYMS[entry.key] ?? []).some((synonym) => {
    const normalizedSynonym = normalizeText(synonym)
    return normalizedSynonym.length > 2 && (normalized.includes(normalizedSynonym) || normalizedSynonym.includes(normalized))
  })
  const entryKey = normalizeText(entry.key.replace(/_/g, ' '))
  const entryLabel = normalizeText(entry.label)
  const direct = normalized === entryKey || normalized === entryLabel || entryKey.includes(normalized) || entryLabel.includes(normalized)
  const overlap = [...phraseTokens].filter((token) => searchTokens.has(token)).length
  return (exactSynonym ? 100 : 0)
    + (direct ? 80 : 0)
    + (containsSynonym ? 60 : 0)
    + overlap * 12
    + (phraseTokens.size > 0 && overlap === phraseTokens.size ? 15 : 0)
}

function matchBankEntry(
  phrase: string,
  bank: typeof BUILT_IN_LINE_ITEM_FIELD_BANK,
) {
  const best = bank
    .map((entry) => ({ entry, score: bankScore(phrase, entry) }))
    .sort((a, b) => b.score - a.score)[0]
  return best && best.score >= 12 ? best.entry : undefined
}

function messageMentionsField(message: string, field: Pick<CustomLineItemFieldDefinition, 'key' | 'label'>) {
  const lower = normalizeText(message)
  const label = normalizeText(field.label)
  const key = normalizeText(field.key.replace(/_/g, ' '))
  if ((label && lower.includes(label)) || (key && lower.includes(key))) return true

  const synonyms = FIELD_SYNONYMS[field.key] ?? []
  if (synonyms.some((synonym) => {
    const normalizedSynonym = normalizeText(synonym)
    return normalizedSynonym.length > 2 && lower.includes(normalizedSynonym)
  })) return true

  const tokens = label.split(' ').filter((part) => part.length > 2 && !GENERIC_TOKENS.has(part))
  if (tokens.length > 1 && tokens.every((token) => lower.includes(token))) return true
  return tokens.some((token) => token.length > 4 && lower.includes(token))
}

function fieldBankEntryMatchesMessage(message: string, entry: { key: string; label: string; group?: string }) {
  return matchBankEntry(message, [entry] as typeof BUILT_IN_LINE_ITEM_FIELD_BANK)?.key === entry.key
}

function cleanRequestedFieldPhrase(value: string) {
  const cleaned = value
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/^(add|include|need|track|show|capture|insert|create|make|put)\s+/i, '')
    .replace(/^(a|an|the)\s+/i, '')
    .replace(/\s+(as|for|into|in)\s+(a\s+)?(vendor|supplier|quote|bid|pricing)\s*(response\s*)?(field|column)?s?.*$/i, '')
    .replace(/\s+(as|for|into|in)\s+(a\s+)?response\s*(field|column)?s?.*$/i, '')
    .replace(/\s+(vendor|supplier|quote|bid|pricing)\s+should\s+(fill|provide|answer|respond).*$/i, '')
    .replace(/\b(vendor|supplier|quote|bid)\s+(response\s+)?(field|column)s?\b/gi, '')
    .replace(/\b(response|field|column|columns|fields)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  return titleCaseLabel(cleaned)
}

function fieldFromBankOrCustom(
  rawLabel: string,
  order: number,
  bank: typeof BUILT_IN_LINE_ITEM_FIELD_BANK,
  group: string,
) {
  const cleaned = cleanRequestedFieldPhrase(rawLabel)
  if (!cleaned) return null
  const bankEntry = matchBankEntry(cleaned, bank)
  return makeFieldDefinition(bankEntry?.label ?? cleaned, order, 'ai', {
    key: bankEntry?.key,
    group: bankEntry?.group ?? group,
  })
}

function cleanIncomingFields(
  fields: Partial<CustomLineItemFieldDefinition>[] | undefined,
  bank: typeof BUILT_IN_LINE_ITEM_FIELD_BANK,
  group: string,
) {
  return (fields ?? [])
    .map((field, index) => {
      const rawLabel = field.label ?? field.key ?? ''
      const cleaned = cleanRequestedFieldPhrase(rawLabel)
      const bankEntry = matchBankEntry(cleaned || rawLabel, bank)
      const label = bankEntry?.label ?? (cleaned || rawLabel)
      const overrideLabel = bankEntry?.label ?? (cleaned || field.label)
      return makeFieldDefinition(label, field.order ?? index, field.source ?? 'ai', {
        ...field,
        key: bankEntry?.key,
        label: overrideLabel,
        group: bankEntry?.group ?? field.group ?? group,
      })
    })
}

function actionClauses(message: string) {
  const matches = [...message.matchAll(new RegExp(ACTION_PATTERN, 'gi'))]
    .map((match) => ({
      action: match[1].toLowerCase(),
      index: match.index ?? 0,
    }))
  return matches.map((match, index) => ({
    intent: ADD_WORDS.has(match.action) ? 'add' as const : REMOVE_WORDS.has(match.action) ? 'remove' as const : 'add' as const,
    text: message.slice(match.index, matches[index + 1]?.index ?? message.length),
  }))
}

function fieldKeysMentionedInText(text: string, fields: CustomLineItemFieldDefinition[]) {
  const parts = splitList(text)
  const source = parts.length ? parts : [text]
  return fields
    .filter((field) => source.some((part) => messageMentionsField(part, field)))
    .map((field) => field.key)
}

function makeAdditionsFromText(
  text: string,
  existingCount: number,
  bank: typeof BUILT_IN_LINE_ITEM_FIELD_BANK,
  group: string,
) {
  return splitList(text)
    .map((part, index) => fieldFromBankOrCustom(part, existingCount + index, bank, group))
    .filter((field): field is CustomLineItemFieldDefinition => Boolean(field))
}

function resolveRemovedKeys(keys: string[] | undefined, fields: CustomLineItemFieldDefinition[]) {
  return Array.from(new Set((keys ?? []).flatMap((rawKey) => {
    const normalizedRaw = normalizeText(rawKey)
    const normalizedFieldKey = rawKey.toLowerCase()
    const exact = fields.find((field) =>
      field.key.toLowerCase() === normalizedFieldKey ||
      field.label.toLowerCase() === normalizedFieldKey ||
      normalizeText(field.key.replace(/_/g, ' ')) === normalizedRaw ||
      normalizeText(field.label) === normalizedRaw)
    if (exact) return [exact.key]
    return fieldKeysMentionedInText(rawKey, fields)
  })))
}

function buildProposal(fields: CustomLineItemFieldDefinition[], currentFields: CustomLineItemFieldDefinition[], removeAll: boolean, summary: string): FieldProposal {
  const sanitized = sanitizeLineItemFields(fields)
  const addedKeys = sanitized.filter((field) => !currentFields.some((current) => current.key === field.key)).map((field) => field.key)
  const removedKeys = currentFields.filter((field) => !sanitized.some((next) => next.key === field.key)).map((field) => field.key)
  return { fields: sanitized, addedKeys, removedKeys, removeAll, summary }
}

function buildVendorResponseProposal(
  fields: CustomLineItemFieldDefinition[],
  currentFields: CustomLineItemFieldDefinition[],
): Pick<FieldProposal, 'vendorResponseFields' | 'addedVendorResponseKeys' | 'removedVendorResponseKeys'> {
  const sanitized = sanitizeVendorResponseFields(fields)
  return {
    vendorResponseFields: sanitized,
    addedVendorResponseKeys: sanitized.filter((field) => !currentFields.some((current) => current.key === field.key)).map((field) => field.key),
    removedVendorResponseKeys: currentFields.filter((field) => !sanitized.some((next) => next.key === field.key)).map((field) => field.key),
  }
}

function mergeProposalWithFallback(
  proposal: FieldProposal,
  fallback: FieldProposal,
  currentFields: CustomLineItemFieldDefinition[],
  currentVendorResponseFields: CustomLineItemFieldDefinition[],
): FieldProposal {
  const aiDeltaCount = proposal.addedKeys.length
    + proposal.removedKeys.length
    + (proposal.addedVendorResponseKeys?.length ?? 0)
    + (proposal.removedVendorResponseKeys?.length ?? 0)
  const fallbackDeltaCount = fallback.addedKeys.length
    + fallback.removedKeys.length
    + (fallback.addedVendorResponseKeys?.length ?? 0)
    + (fallback.removedVendorResponseKeys?.length ?? 0)
  if (aiDeltaCount > 0 || fallbackDeltaCount === 0) return proposal

  const mergedFields = mergeFieldDefinitions(
    proposal.fields.filter((field) => !fallback.removedKeys.includes(field.key)),
    fallback.fields.filter((field) => !currentFields.some((current) => current.key === field.key)),
  )
  const mergedVendorResponseFields = proposal.vendorResponseFields
    ? mergeFieldDefinitions(
      proposal.vendorResponseFields.filter((field) => !fallback.removedVendorResponseKeys?.includes(field.key)),
      (fallback.vendorResponseFields ?? []).filter((field) => !currentVendorResponseFields.some((current) => current.key === field.key)),
    )
    : fallback.vendorResponseFields

  return {
    ...buildProposal(mergedFields, currentFields, proposal.removeAll || fallback.removeAll, fallback.summary),
    ...(mergedVendorResponseFields
      ? buildVendorResponseProposal(mergedVendorResponseFields, currentVendorResponseFields)
      : {}),
  }
}

function deterministicProposal(
  message: string,
  currentFields: CustomLineItemFieldDefinition[],
  currentVendorResponseFields: CustomLineItemFieldDefinition[] = [],
  includeVendorResponseFields = false,
): FieldProposal {
  const removeAll = isRemoveAllRequest(message)
  const clauses = actionClauses(message)
  const fallbackClauses = clauses.length ? clauses : [{
    intent: isRemovalRequest(message) && !isAdditionRequest(message) ? 'remove' as const : 'add' as const,
    text: message,
  }]
  const removedKeys = removeAll
    ? currentFields.map((field) => field.key)
    : Array.from(new Set(fallbackClauses
      .filter((clause) => clause.intent === 'remove' && !isVendorResponseIntent(clause.text))
      .flatMap((clause) => fieldKeysMentionedInText(clause.text, currentFields))))
  const remainingFields = currentFields.filter((field) => !removedKeys.includes(field.key))

  const additions = fallbackClauses
    .filter((clause) => clause.intent === 'add' && !isVendorResponseIntent(clause.text))
    .flatMap((clause) => makeAdditionsFromText(clause.text, remainingFields.length, BUILT_IN_LINE_ITEM_FIELD_BANK, 'AI suggested'))

  const proposedFields = mergeFieldDefinitions(remainingFields, additions).filter((field) => field.visible)
  const removedVendorResponseKeys = includeVendorResponseFields
    ? Array.from(new Set(fallbackClauses
      .filter((clause) => clause.intent === 'remove' && isVendorResponseIntent(clause.text))
      .flatMap((clause) => fieldKeysMentionedInText(clause.text, currentVendorResponseFields))))
    : []
  const remainingVendorResponseFields = currentVendorResponseFields.filter((field) => !removedVendorResponseKeys.includes(field.key))
  const vendorResponseAdditions = includeVendorResponseFields
    ? fallbackClauses
      .filter((clause) => clause.intent === 'add' && isVendorResponseIntent(clause.text))
      .flatMap((clause) => makeAdditionsFromText(clause.text, remainingVendorResponseFields.length, BUILT_IN_VENDOR_RESPONSE_FIELD_BANK, 'Vendor response'))
    : []
  const vendorResponseProposal = includeVendorResponseFields
    ? buildVendorResponseProposal(mergeFieldDefinitions(remainingVendorResponseFields, vendorResponseAdditions), currentVendorResponseFields)
    : {}
  const addedCount = proposedFields.filter((field) => !currentFields.some((current) => current.key === field.key)).length
  const addedVendorResponseCount = vendorResponseProposal.addedVendorResponseKeys?.length ?? 0
  const removedVendorResponseCount = vendorResponseProposal.removedVendorResponseKeys?.length ?? 0
  const summary = removeAll && addedCount > 0
    ? `I will remove every optional line-item field, then add ${addedCount} field${addedCount === 1 ? '' : 's'}.`
    : removeAll
      ? 'I will remove every non-required line-item field and keep only Item Description or SKU, Quantity, and Units.'
    : removedKeys.length > 0 && addedCount > 0
      ? `I will remove ${removedKeys.length} field${removedKeys.length === 1 ? '' : 's'} and add ${addedCount} field${addedCount === 1 ? '' : 's'}.`
      : removedKeys.length > 0
        ? `I will remove ${removedKeys.length} field${removedKeys.length === 1 ? '' : 's'} from this RFQ.`
        : addedVendorResponseCount > 0 && removedVendorResponseCount > 0
          ? `I will update ${addedVendorResponseCount + removedVendorResponseCount} vendor response column${addedVendorResponseCount + removedVendorResponseCount === 1 ? '' : 's'}.`
          : addedVendorResponseCount > 0
            ? `I will add ${addedVendorResponseCount} vendor response column${addedVendorResponseCount === 1 ? '' : 's'}.`
            : removedVendorResponseCount > 0
              ? `I will remove ${removedVendorResponseCount} vendor response column${removedVendorResponseCount === 1 ? '' : 's'}.`
              : addedCount > 0
          ? `I found ${addedCount} matching field suggestion${addedCount === 1 ? '' : 's'} from the built-in field bank.`
          : 'I did not find a field change in that request. Try naming the field to add or remove.'

  return { ...buildProposal(proposedFields, currentFields, removeAll, summary), ...vendorResponseProposal }
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'contractor') {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  try {
    const body = await request.json() as Body
    const message = body.message?.trim()
    if (!message) return NextResponse.json({ error: 'Describe the fields you want.' }, { status: 400 })
    const currentFields = sanitizeLineItemFields(body.currentFields)
    const currentVendorResponseFields = sanitizeVendorResponseFields(body.currentVendorResponseFields)
    const includeVendorResponseFields = body.includeVendorResponseFields === true

    const proposal: FieldProposal = deterministicProposal(message, currentFields, currentVendorResponseFields, includeVendorResponseFields)

    return NextResponse.json(proposal)
  } catch (error) {
    console.error('AI customization proposal failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to propose field changes.' },
      { status: 500 },
    )
  }
}
