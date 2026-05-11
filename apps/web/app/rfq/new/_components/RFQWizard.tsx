'use client'

import { useReducer, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { RFQ_FORM_DEFAULTS, type RFQFormData } from '@/lib/types/rfq'
import { StepMaterialDetails } from './StepMaterialDetails'
import { StepQuantitySpecs } from './StepQuantitySpecs'
import { StepTimeline } from './StepTimeline'
import { StepSupplierPrefs } from './StepSupplierPrefs'
import { StepReview } from './StepReview'

const STEPS = [
  { number: 1, label: 'Material' },
  { number: 2, label: 'Quantity & Specs' },
  { number: 3, label: 'Timeline' },
  { number: 4, label: 'Preferences' },
  { number: 5, label: 'Review' },
]

type Step = 1 | 2 | 3 | 4 | 5

interface WizardState {
  step: Step
  data: RFQFormData
}

type WizardAction =
  | { type: 'NEXT'; data: Partial<RFQFormData> }
  | { type: 'BACK' }

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'NEXT':
      return {
        step: Math.min(5, state.step + 1) as Step,
        data: { ...state.data, ...action.data },
      }
    case 'BACK':
      return { ...state, step: Math.max(1, state.step - 1) as Step }
    default:
      return state
  }
}

export function RFQWizard() {
  const router = useRouter()
  const [state, dispatch] = useReducer(wizardReducer, {
    step: 1,
    data: RFQ_FORM_DEFAULTS,
  })

  const handleNext = useCallback(
    (data: Partial<RFQFormData>) => dispatch({ type: 'NEXT', data }),
    [],
  )
  const handleBack = useCallback(() => dispatch({ type: 'BACK' }), [])

  const handleSubmit = useCallback(
    (data: Partial<RFQFormData>) => {
      const final = { ...state.data, ...data }
      // MVP: navigate to intelligence report for the submitted category
      const category = final.category || 'steel'
      router.push(`/intelligence/${category}?rfqId=mock-rfq-123`)
    },
    [state.data, router],
  )

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Progress bar */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-0">
          {STEPS.map((s, i) => (
            <div key={s.number} className="flex items-center">
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                    state.step > s.number
                      ? 'bg-green-600 text-white'
                      : state.step === s.number
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-400',
                  )}
                >
                  {state.step > s.number ? '✓' : s.number}
                </span>
                <span
                  className={cn(
                    'text-xs font-medium',
                    state.step === s.number ? 'text-gray-900' : 'text-gray-400',
                  )}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    'mx-3 h-px w-8 flex-shrink-0',
                    state.step > s.number ? 'bg-green-400' : 'bg-gray-200',
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="p-6">
        {state.step === 1 && (
          <StepMaterialDetails data={state.data} onNext={handleNext} />
        )}
        {state.step === 2 && (
          <StepQuantitySpecs data={state.data} onNext={handleNext} onBack={handleBack} />
        )}
        {state.step === 3 && (
          <StepTimeline data={state.data} onNext={handleNext} onBack={handleBack} />
        )}
        {state.step === 4 && (
          <StepSupplierPrefs data={state.data} onNext={handleNext} onBack={handleBack} />
        )}
        {state.step === 5 && (
          <StepReview data={state.data} onSubmit={handleSubmit} onBack={handleBack} />
        )}
      </div>
    </div>
  )
}
