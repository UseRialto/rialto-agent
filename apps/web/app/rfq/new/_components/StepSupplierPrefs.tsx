'use client'

import { useForm } from 'react-hook-form'
import type { RFQFormData } from '@/lib/types/rfq'

type Fields = Pick<RFQFormData, 'budget_min' | 'budget_max' | 'accepts_international'>

interface Props {
  data: RFQFormData
  onNext: (data: Partial<RFQFormData>) => void
  onBack: () => void
}

export function StepSupplierPrefs({ data, onNext, onBack }: Props) {
  const { register, handleSubmit, watch } = useForm<Fields>({
    defaultValues: {
      budget_min: data.budget_min,
      budget_max: data.budget_max,
      accepts_international: data.accepts_international,
    },
  })

  const international = watch('accepts_international')

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-6">
      {/* Budget */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Budget Range{' '}
          <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <div className="mt-1 flex items-center gap-3">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-3 flex items-center text-sm text-gray-400">$</span>
            <input
              {...register('budget_min')}
              type="number"
              min="0"
              placeholder="Min"
              className="block w-full rounded-md border border-gray-300 pl-6 pr-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </div>
          <span className="text-gray-400">-</span>
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-3 flex items-center text-sm text-gray-400">$</span>
            <input
              {...register('budget_max')}
              type="number"
              min="0"
              placeholder="Max"
              className="block w-full rounded-md border border-gray-300 pl-6 pr-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </div>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Optional. Suppliers outside your budget can still submit quotes - this is informational only.
        </p>
      </div>

      {/* International toggle */}
      <div className="rounded-lg border border-gray-200 p-4">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <label htmlFor="accepts_international" className="text-sm font-medium text-gray-900">
              Accept International Suppliers
            </label>
            <p className="mt-1 text-sm text-gray-500">
              Enabling international suppliers gives you access to alternative supply routes when
              domestic chains are disrupted by tariffs, geopolitical events, or shortages. Rialto
              surfaces reliability scores and risk levels for all international quotes.
            </p>
            {international && (
              <div className="mt-2 flex items-center gap-1.5 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
                <span>⚡</span>
                <span>
                  International quotes are automatically scored for supply chain risk and tariff exposure.
                </span>
              </div>
            )}
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              {...register('accepts_international')}
              id="accepts_international"
              type="checkbox"
              className="sr-only peer"
            />
            <div className="h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-all after:content-[''] peer-checked:bg-gray-900 peer-checked:after:translate-x-full" />
          </label>
        </div>
      </div>

      <div className="flex justify-between">
        <button type="button" onClick={onBack} className="rounded-md border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          ← Back
        </button>
        <button type="submit" className="rounded-md bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-700">
          Next →
        </button>
      </div>
    </form>
  )
}
