'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import { Bot, Check, Paperclip, Send } from 'lucide-react'
import {
  saveContractorOnboardingAction,
  skipContractorOnboardingAction,
  switchToVendorOnboardingAction,
} from '@/lib/actions/auth'
import {
  CONTRACTOR_CUSTOMIZATION_VERSION,
  DEFAULT_RFQ_CREATION_FIELD_VISIBILITY_SETTINGS,
  inferRFQCreationFieldVisibilityChanges,
  sanitizeLineItemFields,
  sanitizeVendorResponseFields,
  type ContractorCustomizationSettings,
  type CustomLineItemFieldDefinition,
} from '@/lib/contractor-customization'

const TRADE_OPTIONS = [
  'Structural Steel',
  'Concrete',
  'Roofing',
  'Glazing',
  'Mechanical / HVAC',
  'Plumbing',
  'Electrical',
  'Drywall',
  'Masonry',
  'Flooring / Tile',
  'Doors / Hardware',
  'General Materials',
]

type AccountType = 'subcontractor' | 'vendor'

const CORE_COLUMNS = ['Item Description or SKU', 'Quantity', 'Units']
const VENDOR_RESPONSE_COLUMNS = ['Unit Price', 'Lead Time']
const EXAMPLE_MATERIALS = [
  { description: 'Example material 1', quantity: '100', unit: 'ea' },
  { description: 'Example material 2', quantity: '240', unit: 'lf' },
  { description: 'Example material 3', quantity: '36', unit: 'box' },
  { description: 'Example material 4', quantity: '12', unit: 'set' },
]

function emptyTemplate(trade?: string): ContractorCustomizationSettings {
  return {
    trade: trade || undefined,
    templateVersion: CONTRACTOR_CUSTOMIZATION_VERSION,
    inferenceSource: 'default',
    updatedAt: new Date().toISOString(),
    lineItemFields: [],
    vendorResponseFields: [],
    rfqCreationFieldVisibility: DEFAULT_RFQ_CREATION_FIELD_VISIBILITY_SETTINGS,
  }
}

function exampleFieldValue(field: CustomLineItemFieldDefinition, rowIndex: number) {
  if (field.label.includes('Finish') || field.label.includes('Color')) return ['White', 'Black', 'Galvanized', 'Bronze'][rowIndex] ?? '...'
  if (field.label.includes('Grade') || field.label.includes('Spec')) return ['ASTM', 'Type X', 'Schedule 40', 'UL listed'][rowIndex] ?? '...'
  if (field.label.includes('Location') || field.label.includes('Area') || field.label.includes('Phase')) return ['Level 1', 'Area B', 'Roof', 'Lobby'][rowIndex] ?? '...'
  if (field.label.includes('Manufacturer') || field.label.includes('Brand')) return ['Basis of design', 'Approved equal', 'No preference', 'TBD'][rowIndex] ?? '...'
  return '...'
}

export function ContractorOnboardingForm({
  initialCompanyName,
  initialTrade,
}: {
  initialCompanyName: string
  initialTrade: string
}) {
  const [state, action, pending] = useActionState(saveContractorOnboardingAction, undefined)
  const initialTrades = initialTrade ? initialTrade.split(',').map((entry) => entry.trim()).filter(Boolean) : []
  const [step, setStep] = useState(0)
  const [accountType, setAccountType] = useState<AccountType>('subcontractor')
  const [selectedTrades, setSelectedTrades] = useState<string[]>(initialTrades)
  const [customTrade, setCustomTrade] = useState('')
  const [template, setTemplate] = useState<ContractorCustomizationSettings>(() => emptyTemplate(initialTrade))
  const [inferError, setInferError] = useState('')
  const [aiDraft, setAiDraft] = useState('')
  const [isAiThinking, setIsAiThinking] = useState(false)
  const [hasTemplateSource, setHasTemplateSource] = useState(false)

  const trade = useMemo(() => {
    const combined = [...selectedTrades, customTrade.trim()].filter(Boolean)
    return [...new Set(combined)].join(', ')
  }, [customTrade, selectedTrades])

  const visibleFields = hasTemplateSource ? template.lineItemFields.filter((field) => field.visible) : []
  const vendorResponseFields = template.vendorResponseFields?.filter((field) => field.visible) ?? []
  const vendorResponseColumns = [...VENDOR_RESPONSE_COLUMNS, ...vendorResponseFields.map((field) => field.label)]
  const spreadsheetWidth = 240 + 120 + 120 + (visibleFields.length * 180) + (vendorResponseColumns.length * 150)
  const spreadsheetColumns = `240px 120px 120px ${visibleFields.map(() => '180px').join(' ')} ${vendorResponseColumns.map(() => '150px').join(' ')}`
  const totalSteps = accountType === 'subcontractor' ? 2 : 1
  const progress = ((Math.min(step, totalSteps - 1) + 1) / totalSteps) * 100

  useEffect(() => {
    if (accountType === 'vendor' && step > 0) setStep(0)
  }, [accountType, step])

  function syncTemplateTrade(nextTrade: string) {
    setTemplate((current) => ({ ...current, trade: nextTrade || undefined, updatedAt: new Date().toISOString() }))
  }

  function toggleTrade(option: string) {
    setSelectedTrades((current) => {
      const next = current.includes(option) ? current.filter((entry) => entry !== option) : [...current, option]
      syncTemplateTrade([...next, customTrade.trim()].filter(Boolean).join(', '))
      return next
    })
  }

  function goNext() {
    if (accountType === 'subcontractor' && step === 0) setStep(1)
  }

  async function inferTemplate(file?: File) {
    if (!file) return
    setInferError('')
    try {
      const formData = new FormData()
      formData.append('trade', trade)
      formData.append('preferUploadedColumns', 'true')
      formData.append('file', file)
      const response = await fetch('/api/contractor-customization/infer-template', { method: 'POST', body: formData })
      const json = await response.json() as { customization?: ContractorCustomizationSettings; warnings?: string[]; error?: string }
      if (!response.ok || !json.customization) throw new Error(json.error ?? 'Could not infer fields.')
      setTemplate({
        ...json.customization,
        rfqCreationFieldVisibility: json.customization.rfqCreationFieldVisibility ?? DEFAULT_RFQ_CREATION_FIELD_VISIBILITY_SETTINGS,
      })
      setHasTemplateSource(true)
    } catch (error) {
      setInferError(error instanceof Error ? error.message : 'Could not infer fields.')
    }
  }

  async function askFieldAssistant() {
    const message = aiDraft.trim()
    if (!message || isAiThinking) return
    setIsAiThinking(true)
    setInferError('')
    try {
      const response = await fetch('/api/contractor-customization/ai-propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          trade,
          currentFields: template.lineItemFields,
          currentVendorResponseFields: template.vendorResponseFields ?? [],
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
      if (!response.ok || !json.fields) throw new Error(json.error ?? 'Could not propose fields.')
      const fields = sanitizeLineItemFields(json.fields)
      const nextVendorResponseFields = sanitizeVendorResponseFields(json.vendorResponseFields ?? template.vendorResponseFields)
      const currentVisibility = {
        ...DEFAULT_RFQ_CREATION_FIELD_VISIBILITY_SETTINGS,
        ...(template.rfqCreationFieldVisibility ?? {}),
      }
      const visibilityChanges = inferRFQCreationFieldVisibilityChanges(message, currentVisibility, json.removeAll === true)
      const nextVisibility = {
        ...currentVisibility,
        ...visibilityChanges,
      }
      const addedKeys = json.addedKeys ?? fields.filter((field) => !template.lineItemFields.some((current) => current.key === field.key)).map((field) => field.key)
      const removedKeys = json.removedKeys ?? template.lineItemFields.filter((field) => !fields.some((next) => next.key === field.key)).map((field) => field.key)
      const addedVendorResponseKeys = json.addedVendorResponseKeys ?? nextVendorResponseFields.filter((field) => !(template.vendorResponseFields ?? []).some((current) => current.key === field.key)).map((field) => field.key)
      const removedVendorResponseKeys = json.removedVendorResponseKeys ?? (template.vendorResponseFields ?? []).filter((field) => !nextVendorResponseFields.some((next) => next.key === field.key)).map((field) => field.key)
      const visibilityDeltaCount = Object.keys(visibilityChanges).length
      if (fields.length === 0 && addedKeys.length === 0 && removedKeys.length === 0 && addedVendorResponseKeys.length === 0 && removedVendorResponseKeys.length === 0 && visibilityDeltaCount === 0 && !json.removeAll) {
        throw new Error('Try naming columns like finish, grade, drawing reference, submittals, or warranty.')
      }
      setTemplate({
        trade,
        templateVersion: CONTRACTOR_CUSTOMIZATION_VERSION,
        inferenceSource: 'ai',
        updatedAt: new Date().toISOString(),
        lineItemFields: fields,
        vendorResponseFields: nextVendorResponseFields,
        rfqCreationFieldVisibility: nextVisibility,
      })
      setHasTemplateSource(true)
      setAiDraft('')
    } catch (error) {
      setInferError(error instanceof Error ? error.message : 'Could not propose fields.')
    } finally {
      setIsAiThinking(false)
    }
  }

  const activeTemplate = hasTemplateSource
    ? template
    : emptyTemplate(trade)

  function SetupHiddenFields() {
    return (
      <>
        <input type="hidden" name="company_name" value={initialCompanyName} />
        <input type="hidden" name="account_type" value={accountType} />
        <input type="hidden" name="trade" value={trade} />
        <input type="hidden" name="request_style" value={aiDraft} />
        <input type="hidden" name="template_json" value={JSON.stringify(activeTemplate)} />
      </>
    )
  }

  return (
    <div className="min-h-[560px] rounded-3xl border bg-white shadow-sm" style={{ borderColor: '#e2d9cf' }}>
      <div className="flex min-h-[500px] flex-col px-6 py-7 sm:px-10">
        {state?.message && (
          <div className="mb-4 rounded-xl border px-4 py-3" style={{ borderColor: '#f5c6c6', background: '#fdeaea' }}>
            <p className="text-sm" style={{ color: '#c0392b' }}>{state.message}</p>
          </div>
        )}

        <div className="flex-1">
          {step === 0 && (
            <section className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: '#8a9e96' }}>Question 1 of {totalSteps}</p>
              <h2 className="mt-3 text-3xl font-semibold" style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}>Tell us how you work.</h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm" style={{ color: '#4a6358' }}>
                Choose your company type, then pick the trade or trades you handle.
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {([
                  { value: 'subcontractor', label: 'Subcontractor', body: 'I send material requests to vendors.' },
                  { value: 'vendor', label: 'Vendor', body: 'I receive RFQs and submit quotes.' },
                ] as const).map((option) => {
                  const selected = accountType === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setAccountType(option.value)}
                      className="rounded-2xl p-5 text-left transition-all"
                      style={selected
                        ? { background: '#1e3a2f', border: '1px solid #1e3a2f', color: '#ffffff' }
                        : { background: '#fbf8f4', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-base font-semibold">{option.label}</span>
                        {selected && <Check className="h-4 w-4" />}
                      </span>
                      <span className="mt-2 block text-sm" style={{ color: selected ? 'rgba(255,255,255,0.72)' : '#4a6358' }}>{option.body}</span>
                    </button>
                  )
                })}
              </div>

              <div className="mt-8 flex justify-center">
                <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                  {TRADE_OPTIONS.map((option) => {
                    const selected = selectedTrades.includes(option)
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => toggleTrade(option)}
                        className="rounded-full px-3 py-2 text-xs font-semibold transition-all"
                        style={selected
                          ? { background: '#e8f4ee', border: '1px solid #2d6a4f', color: '#2d6a4f' }
                          : { background: '#ffffff', border: '1px solid #e2d9cf', color: '#4a6358' }}
                      >
                        {selected ? '✓ ' : ''}{option}
                      </button>
                    )
                  })}
                </div>
              </div>
              <input
                value={customTrade}
                onChange={(event) => {
                  const value = event.target.value
                  setCustomTrade(value)
                  syncTemplateTrade([...selectedTrades, value.trim()].filter(Boolean).join(', '))
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && accountType === 'subcontractor') {
                    event.preventDefault()
                    goNext()
                  }
                }}
                className="mx-auto mt-5 block w-full max-w-md rounded-xl px-3 py-2 text-sm outline-none"
                style={{ background: '#f5f0eb', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
                placeholder="Other trade, or multiple trades..."
              />
            </section>
          )}

          {step === 1 && accountType === 'subcontractor' && (
            <section className="mx-auto max-w-[82rem]">
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: '#8a9e96' }}>Question 2 of 2</p>
                <h2 className="mt-3 text-3xl font-semibold" style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}>Show us how you request materials.</h2>
                <p className="mx-auto mt-2 max-w-2xl text-sm" style={{ color: '#4a6358' }}>
                  Optional: upload an example of a previous material request you sent to a vendor. We’ll extract the column headers and use them as your RFQ defaults.
                </p>
              </div>

              <div className="mt-6 space-y-4">
                <div
                  className="mx-auto overflow-hidden rounded-2xl border bg-white shadow-sm transition-[width] duration-300 ease-out"
                  style={{ borderColor: '#e2d9cf', width: `min(100%, ${spreadsheetWidth}px)` }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ background: '#f5f0eb', borderColor: '#e2d9cf' }}>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: '#4a6358' }}>
                      {hasTemplateSource ? 'Detected default spreadsheet' : 'Starting spreadsheet'}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.12em]">
                      <span className="flex items-center gap-1.5" style={{ color: '#4a6358' }}>
                        <span className="h-2.5 w-2.5 rounded-full border" style={{ background: '#ffffff', borderColor: '#d9e1dc' }} />
                        You provide
                      </span>
                      <span className="flex items-center gap-1.5" style={{ color: '#9a5a12' }}>
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#f4a261' }} />
                        Vendor response
                      </span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <div className="grid" style={{ gridTemplateColumns: spreadsheetColumns, width: `${spreadsheetWidth}px` }}>
                      {[...CORE_COLUMNS, ...visibleFields.map((field) => field.label)].map((heading) => (
                        <div key={heading} className="border-r border-b px-3 py-2 text-xs font-semibold" style={{ borderColor: '#e2d9cf', background: '#ffffff', color: '#1e3a2f' }}>
                          {heading}
                        </div>
                      ))}
                      {vendorResponseColumns.map((heading) => (
                        <div key={heading} className="border-r border-b px-3 py-2 text-xs font-semibold" style={{ borderColor: '#f2c99d', background: '#fff5eb', color: '#8a4615' }}>
                          {heading}
                        </div>
                      ))}
                      {EXAMPLE_MATERIALS.flatMap((material, rowIndex) => [
                        material.description,
                        material.quantity,
                        material.unit,
                        ...visibleFields.map((field) => exampleFieldValue(field, rowIndex)),
                        '$ --',
                        '-- days',
                        ...vendorResponseFields.map((field) => exampleFieldValue(field, rowIndex)),
                      ].map((value, index) => (
                          <div
                            key={`${rowIndex}-${index}-${value}`}
                            className="border-r border-b px-3 py-2 text-xs"
                            style={{
                              borderColor: index >= CORE_COLUMNS.length + visibleFields.length ? '#f2c99d' : '#ede8e2',
                              background: index >= CORE_COLUMNS.length + visibleFields.length ? '#fffaf4' : '#ffffff',
                              color: index >= CORE_COLUMNS.length + visibleFields.length ? '#9a5a12' : '#4a6358',
                            }}
                          >
                            {value}
                          </div>
                        )))}
                    </div>
                  </div>
                </div>

                <div className="relative mx-auto flex max-w-5xl items-center">
                  <div className="absolute inset-y-0 left-[3.75rem] right-0 rounded-full border bg-white shadow-xl" style={{ borderColor: '#e2d9cf' }} />
                  <span className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white shadow-xl">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full text-white shadow-sm" style={{ background: '#fa6b04' }}>
                      <Bot className="h-4 w-4" />
                    </span>
                  </span>
                  <label
                    className="relative z-10 ml-5 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors"
                    style={{ background: '#f5f0eb', border: '1px solid #e2d9cf', color: '#4a6358' }}
                    title="Upload previous material request"
                    aria-label="Upload previous material request"
                  >
                    <Paperclip className="h-4 w-4" />
                    <input
                      type="file"
                      accept=".csv,.tsv,.txt,.pdf,.xlsx,.xls,text/csv,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                      onChange={(event) => inferTemplate(event.target.files?.[0])}
                      className="sr-only"
                    />
                  </label>
                  <input
                    value={aiDraft}
                    onChange={(event) => setAiDraft(event.target.value)}
                    className="relative z-10 min-w-0 flex-1 bg-transparent py-3 pl-3 pr-3 text-sm outline-none"
                    style={{ color: '#1e3a2f' }}
                    placeholder="Upload a previous request or say: add freight as a vendor response column..."
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void askFieldAssistant()
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={askFieldAssistant}
                    disabled={!aiDraft.trim() || isAiThinking}
                    className="relative z-10 mr-2 flex h-9 w-9 items-center justify-center rounded-full text-white transition-all disabled:opacity-60"
                    style={{ background: '#1e3a2f' }}
                    title="Send field instructions"
                    aria-label="Send field instructions"
                  >
                    {isAiThinking ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {inferError && (
                  <p className="text-xs" style={{ color: '#a85c2a' }}>{inferError}</p>
                )}
              </div>
            </section>
          )}
        </div>

        <div className="mt-8 border-t pt-5" style={{ borderColor: '#ede8e2' }}>
          <div className="mb-4 h-2 overflow-hidden rounded-full" style={{ background: '#ede8e2' }}>
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress}%`, background: '#fa6b04' }} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => step === 0 ? undefined : setStep((current) => current - 1)}
              disabled={step === 0}
              className="text-sm font-medium disabled:opacity-30"
              style={{ color: '#8a9e96' }}
            >
              Back
            </button>
            <div className="flex items-center gap-3">
              {step === 1 && accountType === 'subcontractor' && (
                <form action={skipContractorOnboardingAction}>
                  <button
                    type="submit"
                    className="text-sm font-medium"
                    style={{ color: '#8a9e96' }}
                  >
                    Skip
                  </button>
                </form>
              )}
              {accountType === 'subcontractor' && step === 0 ? (
                <button
                  type="button"
                  onClick={goNext}
                  className="rounded-xl px-6 py-2.5 text-sm font-semibold text-white"
                  style={{ background: '#1e3a2f' }}
                >
                  Next
                </button>
              ) : (
                <form action={accountType === 'vendor' ? switchToVendorOnboardingAction : action}>
                  <SetupHiddenFields />
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-xl px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                    style={{ background: '#1e3a2f' }}
                  >
                    {pending ? 'Saving...' : accountType === 'vendor' ? 'Continue as vendor' : 'Finish setup'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
