'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Save, Settings, X } from 'lucide-react'
import { buildRFQEmailDraft } from '@/lib/mail/rfq-email-draft'
import {
  DEFAULT_RFQ_CREATION_FIELD_VISIBILITY,
  StepItems,
  type ItemRow,
  type RFQCreationFieldKey,
  type RFQCreationFieldVisibility,
} from './StepItems'
import { StepInviteVendors, type VendorInvite } from './StepInviteVendors'
import { StepReview } from './StepReview'
import { saveContractorCustomizationAction, saveRFQDraftAction, publishRFQAction } from '@/lib/actions/contractor'
import type { ContractorRFQ } from '@/lib/types/contractor'
import type { CommodityWatch, ProcurementRequirement, RequestType } from '@/lib/types/procurement'
import { deriveCommodityWatch } from '@/lib/procurement-config'
import { cn } from '@/lib/utils'
import {
  BUILT_IN_LINE_ITEM_FIELD_BANK,
  defaultContractorCustomization,
  fieldsToAttributes,
  inferRFQCreationFieldVisibilityChanges,
  mergeFieldDefinitions,
  sanitizeLineItemFields,
  sanitizeVendorResponseFields,
  STANDARD_RFQ_CREATION_FIELDS,
  type ContractorFieldBankEntry,
  type ContractorCustomizationSettings,
  type CustomLineItemFieldDefinition,
} from '@/lib/contractor-customization'

interface Props {
  projectId: string
  projectName: string
  projectLocation: string
  contractorName: string
  contractorUserName: string
  existingCategories: string[]
  initialEmailSubject: string
  initialEmailBody: string
  initialRFQ?: ContractorRFQ
  contractorCustomization?: ContractorCustomizationSettings
  forcedRequestType?: RequestType
  requestTypeLocked?: boolean
  initialStep?: number
}

const STEPS = [
  { label: 'Items' },
  { label: 'Invite Vendors' },
  { label: 'Review' },
]

function sanitizeFieldVisibility(saved?: Partial<RFQCreationFieldVisibility>): RFQCreationFieldVisibility {
  return {
    ...DEFAULT_RFQ_CREATION_FIELD_VISIBILITY,
    ...saved,
    materialLookup: true,
    description: true,
    quantity: true,
    unit: true,
  }
}

function makeRowFromTemplate(fields: CustomLineItemFieldDefinition[], existing?: Partial<ItemRow>): ItemRow {
  return {
    _key: existing?._key ?? Math.random().toString(36).slice(2),
    sku: existing?.sku ?? '',
    description: existing?.description ?? '',
    quantity: existing?.quantity ?? 0,
    unit: existing?.unit ?? 'tons',
    specs: existing?.specs ?? '',
    constraints: existing?.constraints ?? '',
    attributes: fieldsToAttributes(fields, existing?.attributes),
    certifications: existing?.certifications ?? [],
    notes: existing?.notes ?? '',
    contractor_budget: existing?.contractor_budget,
    suggested_lead_time_days: existing?.suggested_lead_time_days,
  }
}

function getDefaultTitle(projectName: string, requestType: RequestType) {
  const now = new Date()
  const month = now.toLocaleString('en-US', { month: 'long' })
  return requestType === 'rfp'
    ? `${projectName} - ${month} ${now.getFullYear()} Materials RFP`
    : `${projectName} - ${month} ${now.getFullYear()}`
}

function fieldTemplateSignature(fields: CustomLineItemFieldDefinition[]) {
  return JSON.stringify(sanitizeLineItemFields(fields).map((field) => ({
    key: field.key,
    label: field.label,
    inputType: field.inputType,
    required: field.required,
    visible: field.visible,
    options: field.options,
    order: field.order,
  })))
}

function vendorResponseTemplateSignature(fields: CustomLineItemFieldDefinition[]) {
  return fieldTemplateSignature(sanitizeVendorResponseFields(fields))
}

function fieldVisibilitySignature(visibility: RFQCreationFieldVisibility) {
  const sanitized = sanitizeFieldVisibility(visibility)
  return JSON.stringify({
    specifications: sanitized.specifications,
    targetBudget: sanitized.targetBudget,
    suggestedLeadTime: sanitized.suggestedLeadTime,
    certifications: sanitized.certifications,
    supplierRequirements: sanitized.supplierRequirements,
    specBuilder: sanitized.specBuilder,
  })
}

function standardFieldChanges(current: RFQCreationFieldVisibility, changes: Partial<RFQCreationFieldVisibility>) {
  const added: Array<{ key: RFQCreationFieldKey; label: string }> = []
  const removed: Array<{ key: RFQCreationFieldKey; label: string }> = []
  STANDARD_RFQ_CREATION_FIELDS.forEach((field) => {
    const key = field.key as RFQCreationFieldKey
    if (changes[key] === undefined || changes[key] === current[key]) return
    if (changes[key]) added.push({ key, label: field.label })
    else removed.push(field)
  })
  return { added, removed }
}

export function RFQWizard({
  projectId,
  projectName,
  projectLocation,
  contractorName,
  contractorUserName,
  existingCategories,
  initialEmailSubject,
  initialEmailBody,
  initialRFQ,
  contractorCustomization = defaultContractorCustomization(),
  forcedRequestType,
  requestTypeLocked = false,
  initialStep = 0,
}: Props) {
  const router = useRouter()
  const initialRequestType = initialRFQ?.request_type ?? forcedRequestType ?? 'rfq'
  const initialTemplateFields = sanitizeLineItemFields(
    initialRFQ?.line_items.flatMap((item) => item.attributes ?? []).length
      ? initialRFQ.line_items.flatMap((item) => item.attributes ?? [])
      : contractorCustomization.lineItemFields,
  )
  const [step, setStep] = useState(Math.max(0, Math.min(initialStep, STEPS.length - 1)))
  const [fieldTemplate, setFieldTemplate] = useState<CustomLineItemFieldDefinition[]>(initialTemplateFields)
  const [vendorResponseTemplate, setVendorResponseTemplate] = useState<CustomLineItemFieldDefinition[]>(
    sanitizeVendorResponseFields(contractorCustomization.vendorResponseFields),
  )
  const [defaultFieldTemplate, setDefaultFieldTemplate] = useState<CustomLineItemFieldDefinition[]>(
    sanitizeLineItemFields(contractorCustomization.lineItemFields),
  )
  const [defaultVendorResponseTemplate, setDefaultVendorResponseTemplate] = useState<CustomLineItemFieldDefinition[]>(
    sanitizeVendorResponseFields(contractorCustomization.vendorResponseFields),
  )
  const initialFieldVisibility = sanitizeFieldVisibility(contractorCustomization.rfqCreationFieldVisibility as Partial<RFQCreationFieldVisibility> | undefined)
  const [defaultFieldVisibility, setDefaultFieldVisibility] = useState<RFQCreationFieldVisibility>(initialFieldVisibility)
  const [saveDefaultState, setSaveDefaultState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [rfqId, setRfqId] = useState<string | undefined>(initialRFQ?.id)
  const [requestType, setRequestType] = useState<RequestType>(initialRequestType)
  const [title, setTitle] = useState(initialRFQ?.title ?? getDefaultTitle(projectName, initialRequestType))
  const [bidDeadline, setBidDeadline] = useState(initialRFQ?.bid_deadline ?? '')
  const [deliveryRequiredBy, setDeliveryRequiredBy] = useState('')
  const [category, setCategory] = useState(initialRFQ?.category ?? '')
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>(initialRFQ?.attachment_urls ?? [])
  const [items, setItems] = useState<ItemRow[]>(
    initialRFQ?.line_items.map((item) => makeRowFromTemplate(initialTemplateFields, { _key: item.id, ...item })) ?? [makeRowFromTemplate(initialTemplateFields)],
  )
  const [invites, setInvites] = useState<VendorInvite[]>(
    initialRFQ?.invites?.map((invite) => ({
      id: invite.vendor_id,
      name: invite.vendor_name,
      email: invite.vendor_email,
      firstName: invite.vendor_first_name,
      lastName: invite.vendor_last_name,
      onPlatform: invite.on_platform,
    })) ??
    [
      ...(initialRFQ?.invited_vendor_ids.map((id) => ({ id, name: id, email: '', onPlatform: true })) ?? []),
      ...(initialRFQ?.invited_vendor_emails.map((email) => ({ name: email, email, firstName: '', lastName: '', onPlatform: false })) ?? []),
    ],
  )
  const [visibility, setVisibility] = useState<'public' | 'invited_only'>(initialRFQ?.visibility ?? 'public')
  const [anonymousPublicListing, setAnonymousPublicListing] = useState(initialRFQ?.anonymous_public_listing ?? true)
  const [rfpDetails, setRfpDetails] = useState(initialRFQ?.rfp_details ?? {})
  const [procurementRequirements, setProcurementRequirements] = useState<ProcurementRequirement[]>(initialRFQ?.procurement_requirements ?? [])
  const [commodityWatch, setCommodityWatch] = useState<CommodityWatch[]>(initialRFQ?.commodity_watch ?? deriveCommodityWatch(initialRFQ?.category))
  const [emailSubject, setEmailSubject] = useState(initialRFQ?.email_subject ?? initialEmailSubject)
  const [emailBody, setEmailBody] = useState(initialRFQ?.email_body ?? initialEmailBody)
  const [emailSubjectCustomized, setEmailSubjectCustomized] = useState(Boolean(initialRFQ?.email_subject))
  const [emailBodyCustomized, setEmailBodyCustomized] = useState(Boolean(initialRFQ?.email_body))
  const [fieldSettingsOpen, setFieldSettingsOpen] = useState(false)
  const [fieldSettingsToggleCount, setFieldSettingsToggleCount] = useState(0)
  const [fieldSettingsStuck, setFieldSettingsStuck] = useState(false)
  const [fieldSettingsFixedRight, setFieldSettingsFixedRight] = useState(0)
  const [fieldVisibility, setFieldVisibility] = useState<RFQCreationFieldVisibility>(initialFieldVisibility)
  const [customizeAssistantRendered, setCustomizeAssistantRendered] = useState(false)
  const [customizeAssistantClosing, setCustomizeAssistantClosing] = useState(false)
  const [error, setError] = useState('')
  const fieldSettingsAnchorRef = useRef<HTMLDivElement>(null)
  const saveDefaultResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const customizeAssistantCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestLabel = requestType === 'rfp' ? 'RFP' : 'RFQ'
  const matchesDefaultTemplate = fieldTemplateSignature(fieldTemplate) === fieldTemplateSignature(defaultFieldTemplate)
    && vendorResponseTemplateSignature(vendorResponseTemplate) === vendorResponseTemplateSignature(defaultVendorResponseTemplate)
    && fieldVisibilitySignature(fieldVisibility) === fieldVisibilitySignature(defaultFieldVisibility)
  const customizeAssistantActive = step === 0 && fieldSettingsOpen

  useEffect(() => {
    return () => {
      if (saveDefaultResetRef.current) clearTimeout(saveDefaultResetRef.current)
      if (customizeAssistantCloseRef.current) clearTimeout(customizeAssistantCloseRef.current)
      window.dispatchEvent(new CustomEvent('rialto:rfq-customize-assistant', { detail: { open: false } }))
    }
  }, [])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('rialto:rfq-customize-assistant', {
      detail: { open: customizeAssistantActive },
    }))
  }, [customizeAssistantActive])

  useEffect(() => {
    if (customizeAssistantCloseRef.current) clearTimeout(customizeAssistantCloseRef.current)
    if (customizeAssistantActive) {
      setCustomizeAssistantRendered(true)
      setCustomizeAssistantClosing(false)
      return
    }
    if (!customizeAssistantRendered) return
    setCustomizeAssistantClosing(true)
    customizeAssistantCloseRef.current = setTimeout(() => {
      setCustomizeAssistantRendered(false)
      setCustomizeAssistantClosing(false)
    }, 280)
  }, [customizeAssistantActive, customizeAssistantRendered])

  useEffect(() => {
    setFieldVisibility(sanitizeFieldVisibility(fieldVisibility))
  }, [])

  useEffect(() => {
    if (!fieldSettingsOpen) {
      setFieldSettingsStuck(false)
      return
    }

    function updateCustomizeButtonPosition() {
      const anchor = fieldSettingsAnchorRef.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      setFieldSettingsFixedRight(Math.max(16, window.innerWidth - rect.right))
    }

    function handleCustomizeScroll() {
      updateCustomizeButtonPosition()
      setFieldSettingsStuck(true)
    }

    updateCustomizeButtonPosition()
    window.addEventListener('scroll', handleCustomizeScroll, { passive: true, capture: true })
    document.addEventListener('scroll', handleCustomizeScroll, { passive: true, capture: true })
    window.addEventListener('resize', updateCustomizeButtonPosition)
    return () => {
      window.removeEventListener('scroll', handleCustomizeScroll, { capture: true })
      document.removeEventListener('scroll', handleCustomizeScroll, { capture: true })
      window.removeEventListener('resize', updateCustomizeButtonPosition)
    }
  }, [fieldSettingsOpen])

  useEffect(() => {
    const draft = buildRFQEmailDraft({
      contractorName,
      senderName: contractorUserName,
      projectName,
      rfqTitle: title,
      requestType,
      bidDeadline: bidDeadline || undefined,
    })
    if (!emailSubjectCustomized) setEmailSubject(draft.subject)
    if (!emailBodyCustomized) setEmailBody(draft.body)
  }, [bidDeadline, contractorName, contractorUserName, emailBodyCustomized, emailSubjectCustomized, projectName, title])

  function validateStep1() {
    if (!title.trim()) return `${requestLabel} title is required.`
    if (items.every((i) => !i.sku && !i.description)) return 'Add at least one item.'
    return ''
  }

  function handleNext() {
    setError('')
    if (step === 0) {
      const err = validateStep1()
      if (err) { setError(err); return }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  function setFieldVisible(key: RFQCreationFieldKey, visible: boolean) {
    setFieldVisibility((current) => ({ ...current, [key]: visible }))
  }

  function syncRowsToTemplate(nextFields: CustomLineItemFieldDefinition[]) {
    const sanitized = sanitizeLineItemFields(nextFields).map((field, index) => ({ ...field, order: index }))
    setFieldTemplate(sanitized)
    setItems((current) => current.map((item) => ({ ...item, attributes: fieldsToAttributes(sanitized, item.attributes) })))
  }

  function removeTemplateField(key: string) {
    syncRowsToTemplate(fieldTemplate.filter((field) => field.key !== key))
  }

  function addTemplateField(entryKey: string) {
    const entry = BUILT_IN_LINE_ITEM_FIELD_BANK.find((field) => field.key === entryKey)
    if (!entry) return
    syncRowsToTemplate(mergeFieldDefinitions(fieldTemplate, [{
      key: entry.key,
      label: entry.label,
      inputType: entry.inputType ?? 'text',
      required: false,
      visible: true,
      options: entry.options ?? [],
      source: 'user',
      group: entry.group,
      order: fieldTemplate.length,
    }]))
  }

  function moveTemplateField(dragKey: string, targetKey: string, position: 'before' | 'after' = 'before') {
    if (dragKey === targetKey) return
    const index = fieldTemplate.findIndex((field) => field.key === dragKey)
    const target = fieldTemplate.findIndex((field) => field.key === targetKey)
    if (index < 0 || target < 0) return
    const next = [...fieldTemplate]
    const [field] = next.splice(index, 1)
    const rawTarget = position === 'after' ? target + 1 : target
    const adjustedTarget = index < rawTarget ? rawTarget - 1 : rawTarget
    next.splice(adjustedTarget, 0, field)
    syncRowsToTemplate(next)
  }

  async function saveCurrentTemplateAsDefault() {
    if (matchesDefaultTemplate || saveDefaultState === 'saving') return
    if (saveDefaultResetRef.current) clearTimeout(saveDefaultResetRef.current)
    setSaveDefaultState('saving')
    const result = await saveContractorCustomizationAction({
      ...contractorCustomization,
      lineItemFields: fieldTemplate,
      vendorResponseFields: vendorResponseTemplate,
      rfqCreationFieldVisibility: fieldVisibility,
      inferenceSource: 'user',
    })
    if (result.success) {
      setDefaultFieldTemplate(sanitizeLineItemFields(result.customization?.lineItemFields ?? fieldTemplate))
      setDefaultVendorResponseTemplate(sanitizeVendorResponseFields(result.customization?.vendorResponseFields ?? vendorResponseTemplate))
      setDefaultFieldVisibility(sanitizeFieldVisibility(result.customization?.rfqCreationFieldVisibility as Partial<RFQCreationFieldVisibility> | undefined ?? fieldVisibility))
      setSaveDefaultState('saved')
      router.refresh()
    } else {
      setSaveDefaultState('error')
    }
    saveDefaultResetRef.current = setTimeout(() => {
      setSaveDefaultState('idle')
    }, 1200)
  }

  const availableFieldBank: ContractorFieldBankEntry[] = useMemo(() => {
    const activeKeys = new Set(fieldTemplate.map((field) => field.key))
    return BUILT_IN_LINE_ITEM_FIELD_BANK
      .filter((entry) => !activeKeys.has(entry.key))
      .slice(0, 6)
  }, [fieldTemplate])

  function buildRFQData() {
    return {
      rfqId,
      title,
      requestType,
      emailSubject,
      emailBody,
      bidDeadline: bidDeadline || undefined,
      category: category || undefined,
      attachmentUrls,
      anonymousPublicListing: visibility === 'public' ? true : anonymousPublicListing,
      rfpDetails,
      procurementRequirements,
      aiSpecAssistant: undefined,
      commodityWatch,
      vendorResponseFields: vendorResponseTemplate,
      line_items: items
        .filter((i) => i.sku || i.description)
        .map((i) => ({
          id: i._key.startsWith('li-') ? i._key : `li-${crypto.randomUUID().slice(0, 8)}`,
          sku: i.sku,
          description: i.description,
          quantity: i.quantity,
          unit: i.unit,
          specs: i.specs,
          constraints: i.constraints,
          attributes: i.attributes,
          certifications: i.certifications,
          notes: i.notes,
          contractor_budget: i.contractor_budget,
          suggested_lead_time_days: i.suggested_lead_time_days,
        })),
      invites: invites
        .filter((invite) => invite.id || invite.email)
        .map((invite) => ({
          vendor_id: invite.id,
          vendor_email: invite.email,
          vendor_name: invite.name || invite.email || invite.id || '',
          vendor_first_name: invite.firstName?.trim() || undefined,
          vendor_last_name: invite.lastName?.trim() || undefined,
          on_platform: invite.onPlatform,
        })),
      invited_vendor_ids: invites.filter((i) => i.onPlatform && i.id).map((i) => i.id!),
      invited_vendor_emails: invites.filter((i) => !i.onPlatform).map((i) => i.email),
      visibility,
    }
  }

  async function handleSaveDraft() {
    setError('')
    try {
      const data = buildRFQData()
      const result = await saveRFQDraftAction(projectId, data)
      setRfqId(result.rfqId)
      router.push(`/contractor/projects/${projectId}`)
      router.refresh()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : `Failed to save ${requestLabel} draft.`
      setError(message)
    }
  }

  async function handlePublish() {
    setError('')
    try {
      const data = buildRFQData()
      const result = await publishRFQAction(projectId, data)
      if (!result.success) {
        setError(result.error ?? `Failed to publish ${requestLabel}.`)
        return
      }
      router.push(result.redirectTo ?? `/contractor/projects/${projectId}`)
      router.refresh()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : `Failed to publish ${requestLabel}.`
      setError(message)
    }
  }

  return (
    <div>
      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Step indicator */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-0">
            {STEPS.map((s, i) => (
              <div key={s.label} className="flex items-center">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all"
                    style={
                      i < step
                        ? { background: '#fa6b04', color: '#fff' }
                        : i === step
                        ? { background: '#1e3a2f', color: '#fff', outline: '2px solid #1e3a2f', outlineOffset: '2px' }
                        : { background: '#ede8e2', color: '#8a9e96' }
                    }
                  >
                    {i < step ? (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </div>
                  <p className="text-sm font-semibold" style={{ color: i === step ? '#1e3a2f' : i < step ? '#fa6b04' : '#8a9e96' }}>
                    {s.label}
                  </p>
                </div>
                {i < STEPS.length - 1 && (
              <div className="mx-4 h-px w-12 shrink-0 transition-all"
                    style={{ background: i < step ? '#fa6b04' : '#e2d9cf' }} />
                )}
              </div>
            ))}
          </div>
          {step === 0 && (
            <div ref={fieldSettingsAnchorRef} className="flex min-h-10 flex-wrap items-start gap-2">
              <div
                className={fieldSettingsOpen && fieldSettingsStuck
                  ? 'fixed top-24 z-50 flex flex-col items-stretch gap-2'
                  : 'flex flex-col items-stretch gap-2'
                }
                style={fieldSettingsOpen && fieldSettingsStuck ? { right: `${fieldSettingsFixedRight}px` } : undefined}
              >
              <button
                type="button"
	                onClick={() => {
	                  setFieldSettingsStuck(false)
	                  setFieldSettingsOpen((open) => !open)
	                  setFieldSettingsToggleCount((count) => count + 1)
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold shadow-lg transition-colors"
                style={fieldSettingsOpen
                  ? {
                      border: '1px solid #a85c2a',
                      background: '#a85c2a',
                      color: '#ffffff',
                    }
                  : { border: '1px solid #e2d9cf', background: '#ffffff', color: '#4a6358' }
                }
                aria-expanded={fieldSettingsOpen}
              >
                <Settings
                  key={fieldSettingsToggleCount}
                  className="h-4 w-4 animate-[rfq-gear-turn_350ms_ease-out_1]"
                  aria-hidden="true"
                />
                Customize fields
              </button>
              {fieldSettingsOpen && (
                <button
                  type="button"
                  disabled={matchesDefaultTemplate || saveDefaultState !== 'idle'}
                  onClick={saveCurrentTemplateAsDefault}
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold shadow-lg transition-all disabled:cursor-not-allowed"
                  style={saveDefaultState === 'saved'
                    ? { background: '#2d6a4f', color: '#ffffff', transform: 'scale(1.02)' }
                    : saveDefaultState === 'error'
                      ? { background: '#a85c2a', color: '#ffffff' }
                      : matchesDefaultTemplate
                        ? { background: '#e6e0d8', color: '#8a9e96', boxShadow: 'none' }
                        : { background: '#1e3a2f', color: '#ffffff' }
                  }
                >
                  {saveDefaultState === 'saved' ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                  {saveDefaultState === 'saving'
                    ? 'Saving...'
                    : saveDefaultState === 'saved'
                      ? 'Saved'
                      : saveDefaultState === 'error'
                        ? 'Try again'
                        : 'Save as my default'}
                </button>
              )}
              </div>
            </div>
          )}
        </div>
        <style jsx global>{`
          @keyframes rfq-gear-turn {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(180deg);
            }
          }
          @keyframes rfq-ai-pop {
            0% {
              opacity: 0;
              bottom: 0.75rem;
            }
            100% {
              opacity: 1;
              bottom: 1.25rem;
            }
          }
          @keyframes rfq-ai-content-fade {
            0% { opacity: 0; }
            60% { opacity: 0; }
            100% { opacity: 1; }
          }
          @keyframes rfq-ai-content-hide {
            0% { opacity: 1; }
            100% { opacity: 0; }
          }
          @keyframes rfq-ai-preview-pop {
            0% {
              opacity: 0;
              transform: translateY(14px) scale(0.98);
            }
            100% {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
          @keyframes rfq-ai-preview-apply {
            0% {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
            100% {
              opacity: 0;
              transform: translateY(10px) scale(0.985);
            }
          }
          @keyframes rfq-ai-pill-emerge {
            0% { opacity: 0; }
            100% { opacity: 1; }
          }
          @keyframes rfq-ai-pill-collapse {
            0% { opacity: 1; }
            100% { opacity: 0; }
          }
        `}</style>

        {/* Step content */}
        {step === 0 && (
          <StepItems
            projectName={projectName}
            requestType={requestType}
            requestTypeLocked={requestTypeLocked}
            title={title}
            bidDeadline={bidDeadline}
            deliveryRequiredBy={deliveryRequiredBy}
            category={category}
            attachmentUrls={attachmentUrls}
            anonymousPublicListing={anonymousPublicListing}
            rfpDetails={rfpDetails}
            procurementRequirements={procurementRequirements}
            fieldTemplate={fieldTemplate}
            vendorResponseFields={vendorResponseTemplate}
            availableFieldBank={availableFieldBank}
            fieldVisibility={fieldVisibility}
            isCustomizingFields={fieldSettingsOpen}
            existingCategories={existingCategories}
            items={items}
            onRequestTypeChange={setRequestType}
            onTitleChange={setTitle}
            onBidDeadlineChange={setBidDeadline}
            onDeliveryRequiredByChange={setDeliveryRequiredBy}
            onCategoryChange={setCategory}
            onAttachmentUrlsChange={setAttachmentUrls}
            onAnonymousPublicListingChange={setAnonymousPublicListing}
            onRfpDetailsChange={setRfpDetails}
            onProcurementRequirementsChange={setProcurementRequirements}
            onTemplateFieldAdd={addTemplateField}
            onTemplateFieldRemove={removeTemplateField}
            onTemplateFieldMove={moveTemplateField}
            onTemplateReplace={syncRowsToTemplate}
            onFieldRemove={(field) => setFieldVisible(field, false)}
            onFieldRestore={(field) => setFieldVisible(field, true)}
            onItemsChange={setItems}
          />
        )}

        {customizeAssistantRendered && (
          <FieldCustomizationAssistant
            isClosing={customizeAssistantClosing}
            trade={contractorCustomization.trade ?? category}
            fields={fieldTemplate}
            vendorResponseFields={vendorResponseTemplate}
            fieldVisibility={fieldVisibility}
            onApply={syncRowsToTemplate}
            onApplyVendorResponse={(fields) => setVendorResponseTemplate(sanitizeVendorResponseFields(fields))}
            onApplyFieldVisibility={(visibility) => {
              setFieldVisibility((current) => sanitizeFieldVisibility({ ...current, ...visibility }))
            }}
          />
        )}

        {step === 1 && (
          <StepInviteVendors
            invites={invites}
            onInvitesChange={setInvites}
            items={items}
            rfqTitle={title}
            projectName={projectName}
            projectLocation={projectLocation}
            senderName={contractorUserName}
            bidDeadline={bidDeadline || undefined}
            emailBody={emailBody}
            onEmailBodyChange={(value) => {
              setEmailBody(value)
              setEmailBodyCustomized(true)
            }}
          />
        )}

        {step === 2 && (
          <StepReview
            contractorName={contractorName}
            projectName={projectName}
            projectLocation={projectLocation}
            requestType={requestType}
            title={title}
            bidDeadline={bidDeadline}
            category={category}
            attachmentUrls={attachmentUrls}
            anonymousPublicListing={anonymousPublicListing}
            procurementRequirements={procurementRequirements}
            commodityWatch={commodityWatch}
            rfpDetails={rfpDetails}
            items={items}
            invites={invites}
            emailSubject={emailSubject}
            emailBody={emailBody}
            projectId={projectId}
            rfqId={rfqId}
            onEditItems={() => setStep(0)}
            onSaveDraft={handleSaveDraft}
            onPublish={handlePublish}
          />
        )}

        {error && (
          <div className="mt-4 rounded-xl px-4 py-3" style={{ border: '1px solid #e8c4a0', background: '#fdf0e8' }}>
            <p className="text-sm" style={{ color: '#a85c2a' }}>{error}</p>
          </div>
        )}

        {/* Navigation footer */}
        <div className="mt-8 flex items-center justify-between pt-5" style={{ borderTop: '1px solid #e2d9cf' }}>
          <button
            type="button"
            onClick={() => step === 0 ? (window.location.href = `/contractor/projects/${projectId}`) : setStep(step - 1)}
            className="text-sm font-semibold transition-colors"
            style={{ color: '#8a9e96' }}
          >
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          {step < 2 && (
            <div className="flex items-center gap-3">
              {step === 1 && (
                <button
                  type="button"
                  onClick={handleNext}
                  className="text-sm font-medium transition-colors"
                  style={{ color: '#8a9e96' }}
                >
                  Skip
                </button>
              )}
              <button
                type="button"
                onClick={handleNext}
                className="rounded-2xl px-6 py-2.5 text-sm font-bold transition-all"
                style={{ background: '#1e3a2f', color: '#fff' }}
              >
                {step === 1 ? `Review ${requestLabel}` : 'Next'}
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}

function FieldCustomizationAssistant({
  isClosing,
  trade,
  fields,
  vendorResponseFields,
  fieldVisibility,
  onApply,
  onApplyVendorResponse,
  onApplyFieldVisibility,
}: {
  isClosing?: boolean
  trade?: string
  fields: CustomLineItemFieldDefinition[]
  vendorResponseFields: CustomLineItemFieldDefinition[]
  fieldVisibility: RFQCreationFieldVisibility
  onApply: (fields: CustomLineItemFieldDefinition[]) => void
  onApplyVendorResponse: (fields: CustomLineItemFieldDefinition[]) => void
  onApplyFieldVisibility?: (visibility: Partial<RFQCreationFieldVisibility>) => void
}) {
  const [draft, setDraft] = useState('')
  const [summary, setSummary] = useState('')
  const [proposal, setProposal] = useState<{
    fields: CustomLineItemFieldDefinition[]
    vendorResponseFields?: CustomLineItemFieldDefinition[]
    addedKeys: string[]
    removedKeys: string[]
    addedVendorResponseKeys?: string[]
    removedVendorResponseKeys?: string[]
    removeAll?: boolean
    fieldVisibility?: Partial<RFQCreationFieldVisibility>
  } | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [error, setError] = useState('')
  const applyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const proposedFields = proposal?.fields ?? null
  const addedFields = proposal
    ? proposal.fields.filter((field) => proposal.addedKeys.includes(field.key) || !fields.some((current) => current.key === field.key))
    : []
  const removedFields = proposal
    ? fields.filter((field) => proposal.removedKeys.includes(field.key) || !proposal.fields.some((next) => next.key === field.key))
    : []
  const proposedVendorResponseFields = proposal?.vendorResponseFields ?? vendorResponseFields
  const addedVendorResponseFields = proposal?.vendorResponseFields
    ? proposal.vendorResponseFields.filter((field) => proposal.addedVendorResponseKeys?.includes(field.key) || !vendorResponseFields.some((current) => current.key === field.key))
    : []
  const removedVendorResponseFields = proposal?.vendorResponseFields
    ? vendorResponseFields.filter((field) => proposal.removedVendorResponseKeys?.includes(field.key) || !proposal.vendorResponseFields?.some((next) => next.key === field.key))
    : []
  const standardChanges = proposal?.fieldVisibility ? standardFieldChanges(fieldVisibility, proposal.fieldVisibility) : { added: [], removed: [] }

  function dismissAddedField(key: string) {
    if (!proposal) return
    setProposal({
      ...proposal,
      fields: proposal.fields.filter((f) => f.key !== key),
      addedKeys: proposal.addedKeys.filter((k) => k !== key),
    })
  }

  function dismissRemovedField(key: string) {
    if (!proposal) return
    const restoredField = fields.find((f) => f.key === key)
    setProposal({
      ...proposal,
      fields: restoredField ? [...proposal.fields, restoredField] : proposal.fields,
      removedKeys: proposal.removedKeys.filter((k) => k !== key),
    })
  }

  function dismissAddedVendorResponseField(key: string) {
    if (!proposal || !proposal.vendorResponseFields) return
    setProposal({
      ...proposal,
      vendorResponseFields: proposal.vendorResponseFields.filter((f) => f.key !== key),
      addedVendorResponseKeys: (proposal.addedVendorResponseKeys ?? []).filter((k) => k !== key),
    })
  }

  function dismissRemovedVendorResponseField(key: string) {
    if (!proposal || !proposal.vendorResponseFields) return
    const restoredField = vendorResponseFields.find((f) => f.key === key)
    setProposal({
      ...proposal,
      vendorResponseFields: restoredField ? [...proposal.vendorResponseFields, restoredField] : proposal.vendorResponseFields,
      removedVendorResponseKeys: (proposal.removedVendorResponseKeys ?? []).filter((k) => k !== key),
    })
  }

  function dismissStandardChange(key: string) {
    if (!proposal?.fieldVisibility) return
    const updated = { ...proposal.fieldVisibility }
    delete (updated as Record<string, unknown>)[key]
    setProposal({ ...proposal, fieldVisibility: updated })
  }

  useEffect(() => {
    return () => {
      if (applyTimerRef.current) clearTimeout(applyTimerRef.current)
    }
  }, [])

  async function askAssistant() {
    const message = draft.trim()
    if (!message || isSending) return
    setIsSending(true)
    setError('')
    setSummary('')
    setProposal(null)
    try {
      const response = await fetch('/api/contractor-customization/ai-propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          trade,
          currentFields: fields,
          currentVendorResponseFields: vendorResponseFields,
          includeVendorResponseFields: true,
        }),
      })
      const json = await response.json() as {
        summary?: string
        fields?: CustomLineItemFieldDefinition[]
        vendorResponseFields?: CustomLineItemFieldDefinition[]
        addedKeys?: string[]
        removedKeys?: string[]
        addedVendorResponseKeys?: string[]
        removedVendorResponseKeys?: string[]
        removeAll?: boolean
        error?: string
      }
      if (!response.ok || !json.fields) throw new Error(json.error ?? 'Could not propose field changes.')
      const proposedVisibility = inferRFQCreationFieldVisibilityChanges(message, fieldVisibility, json.removeAll === true) as Partial<RFQCreationFieldVisibility>
      setSummary(json.summary ?? 'Review the proposed field changes.')
      setProposal({
        fields: json.fields,
        vendorResponseFields: json.vendorResponseFields,
        addedKeys: json.addedKeys ?? json.fields.filter((field) => !fields.some((current) => current.key === field.key)).map((field) => field.key),
        removedKeys: json.removedKeys ?? fields.filter((field) => !json.fields?.some((next) => next.key === field.key)).map((field) => field.key),
        addedVendorResponseKeys: json.addedVendorResponseKeys ?? json.vendorResponseFields?.filter((field) => !vendorResponseFields.some((current) => current.key === field.key)).map((field) => field.key),
        removedVendorResponseKeys: json.removedVendorResponseKeys ?? vendorResponseFields.filter((field) => !json.vendorResponseFields?.some((next) => next.key === field.key)).map((field) => field.key),
        removeAll: json.removeAll,
        fieldVisibility: proposedVisibility,
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not propose field changes.')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <section
      className={cn(
        'fixed bottom-12 left-1/2 z-40 w-[min(820px,calc(100vw-2rem))] -translate-x-1/2',
        isClosing && 'pointer-events-none',
      )}
      style={{ borderColor: '#e2d9cf' }}
      aria-label="Field customization assistant"
    >
      {proposal && proposedFields && (
        <div
          className={cn(
            'absolute bottom-[calc(100%+0.75rem)] left-0 right-0 rounded-2xl bg-white p-3 shadow-2xl',
            isApplying
              ? 'pointer-events-none animate-[rfq-ai-preview-apply_180ms_ease-in_forwards]'
              : 'animate-[rfq-ai-preview-pop_220ms_ease-out_1]',
          )}
          style={{ border: '1px solid #e2d9cf', transformOrigin: 'bottom center' }}
        >
          {addedFields.length === 0 && removedFields.length === 0 && addedVendorResponseFields.length === 0 && removedVendorResponseFields.length === 0 && standardChanges.added.length === 0 && standardChanges.removed.length === 0 ? (
            <p className="mt-2 text-xs" style={{ color: '#8a9e96' }}>
              No field changes found yet. Try naming the field to add or remove.
            </p>
          ) : (
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#2d6a4f' }}>Adds</p>
                <div className="flex flex-wrap gap-2">
                  {addedFields.length > 0 ? addedFields.map((field) => (
                    <span key={field.key} className="inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1.5 text-xs font-semibold" style={{ background: '#e8f4ee', border: '1px solid #a8d5ba', color: '#2d6a4f' }}>
                      {field.label}
                      <button type="button" onClick={() => dismissAddedField(field.key)} className="flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-[#2d6a4f]/15" aria-label={`Remove ${field.label}`}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )) : addedVendorResponseFields.length === 0 && standardChanges.added.length === 0 ? (
                    <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: '#f5f0eb', border: '1px solid #e2d9cf', color: '#8a9e96' }}>
                      No additions
                    </span>
                  ) : null}
                  {addedVendorResponseFields.map((field) => (
                    <span key={`vendor-add-${field.key}`} className="inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1.5 text-xs font-semibold" style={{ background: '#fff5eb', border: '1px solid #f2c99d', color: '#9a5a12' }}>
                      {field.label}
                      <button type="button" onClick={() => dismissAddedVendorResponseField(field.key)} className="flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-[#9a5a12]/15" aria-label={`Remove ${field.label}`}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  {standardChanges.added.map((field) => (
                    <span key={`standard-add-${field.key}`} className="inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1.5 text-xs font-semibold" style={{ background: '#e8f4ee', border: '1px solid #a8d5ba', color: '#2d6a4f' }}>
                      {field.label}
                      <button type="button" onClick={() => dismissStandardChange(field.key)} className="flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-[#2d6a4f]/15" aria-label={`Remove ${field.label}`}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#a85c2a' }}>Removes</p>
                <div className="flex flex-wrap gap-2">
                  {removedFields.length > 0 ? removedFields.map((field) => (
                    <span key={field.key} className="inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1.5 text-xs font-semibold" style={{ background: '#fff1e8', border: '1px solid #f2b38f', color: '#a85c2a' }}>
                      {field.label}
                      <button type="button" onClick={() => dismissRemovedField(field.key)} className="flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-[#a85c2a]/15" aria-label={`Undo remove ${field.label}`}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )) : removedVendorResponseFields.length === 0 && standardChanges.removed.length === 0 ? (
                    <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: '#f5f0eb', border: '1px solid #e2d9cf', color: '#8a9e96' }}>
                      No removals
                    </span>
                  ) : null}
                  {removedVendorResponseFields.map((field) => (
                    <span key={`vendor-remove-${field.key}`} className="inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1.5 text-xs font-semibold" style={{ background: '#fff1e8', border: '1px solid #f2b38f', color: '#a85c2a' }}>
                      {field.label}
                      <button type="button" onClick={() => dismissRemovedVendorResponseField(field.key)} className="flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-[#a85c2a]/15" aria-label={`Undo remove ${field.label}`}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  {standardChanges.removed.map((field) => (
                    <span key={`standard-remove-${field.key}`} className="inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1.5 text-xs font-semibold" style={{ background: '#fff1e8', border: '1px solid #f2b38f', color: '#a85c2a' }}>
                      {field.label}
                      <button type="button" onClick={() => dismissStandardChange(field.key)} className="flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-[#a85c2a]/15" aria-label={`Undo remove ${field.label}`}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              if (isApplying) return
              setIsApplying(true)
              applyTimerRef.current = setTimeout(() => {
                onApply(proposedFields)
                onApplyVendorResponse(proposedVendorResponseFields)
                if (proposal.removeAll) {
                  onApplyFieldVisibility?.({
                    specifications: false,
                    targetBudget: false,
                    suggestedLeadTime: false,
                    certifications: false,
                    supplierRequirements: false,
                    specBuilder: false,
                  })
                } else if (proposal.fieldVisibility) {
                  onApplyFieldVisibility?.(proposal.fieldVisibility)
                }
                setProposal(null)
                setDraft('')
                setSummary('')
                setIsApplying(false)
              }, 180)
            }}
            disabled={isApplying}
            className="mt-3 rounded-xl px-4 py-2 text-xs font-semibold text-white transition-all disabled:scale-95 disabled:opacity-80"
            style={{ background: '#fa6b04' }}
          >
            {isApplying ? 'Applying...' : 'Apply preview'}
          </button>
        </div>
      )}
      <div className="relative flex h-12 items-center">
        <div
          className={cn(
            'absolute inset-y-0 left-[3.5rem] right-0 rounded-full bg-white shadow-2xl',
            isClosing
              ? 'animate-[rfq-ai-pill-collapse_240ms_ease-out_forwards]'
              : 'animate-[rfq-ai-pill-emerge_300ms_ease-out_650ms_both]',
          )}
          style={{ border: '1.5px solid #fa6b04', transformOrigin: 'left center' }}
          aria-hidden="true"
        />
        <span aria-hidden="true" className="h-12 w-12 shrink-0" />
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className={cn(
            'relative z-10 ml-3 min-w-0 flex-1 bg-transparent py-3.5 pl-4 pr-3 text-sm outline-none',
            isClosing
              ? 'animate-[rfq-ai-content-hide_160ms_ease-in_forwards]'
              : 'animate-[rfq-ai-content-fade_260ms_ease-out_800ms_both]',
          )}
          style={{ color: '#1e3a2f' }}
          placeholder="Tell AI what fields to add or remove..."
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void askAssistant()
            }
          }}
        />
        <button
          type="button"
          onClick={askAssistant}
          disabled={!draft.trim() || isSending}
          className={cn(
            'relative z-10 mr-2 shrink-0 rounded-full px-5 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-60',
            isClosing
              ? 'animate-[rfq-ai-content-hide_160ms_ease-in_forwards]'
              : 'animate-[rfq-ai-content-fade_360ms_ease-out_760ms_both]',
          )}
          style={{ background: '#1e3a2f' }}
        >
          {isSending ? 'Thinking...' : 'Preview'}
        </button>
      </div>
      {error && <p className="mt-2 rounded-full bg-white px-4 py-2 text-xs shadow" style={{ color: '#a85c2a' }}>{error}</p>}
      {summary && !proposal && <p className="mt-2 rounded-full bg-white px-4 py-2 text-xs shadow" style={{ color: '#4a6358' }}>{summary}</p>}
    </section>
  )
}
