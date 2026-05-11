'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { RFQFormData } from '@/lib/types/rfq'

const schema = z.object({
  delivery_date: z.string().min(1, 'Select a required delivery date'),
  delivery_location: z.string().min(5, 'Enter the project site address'),
})

type Fields = Pick<RFQFormData, 'delivery_date' | 'delivery_location'>

interface Props {
  data: RFQFormData
  onNext: (data: Partial<RFQFormData>) => void
  onBack: () => void
}

export function StepTimeline({ data, onNext, onBack }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: {
      delivery_date: data.delivery_date,
      delivery_location: data.delivery_location,
    },
  })

  // Min date = tomorrow
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const minDate = tomorrow.toISOString().split('T')[0]

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Required Delivery Date <span className="text-red-500">*</span>
        </label>
        <input
          {...register('delivery_date')}
          type="date"
          min={minDate}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
        {errors.delivery_date && (
          <p className="mt-1 text-xs text-red-600">{errors.delivery_date.message}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">
          Suppliers filter by lead time against this date. Longer windows attract more quotes.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Delivery Location (Project Site) <span className="text-red-500">*</span>
        </label>
        <input
          {...register('delivery_location')}
          placeholder="e.g. 1200 Broadway, Denver, CO 80203"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
        {errors.delivery_location && (
          <p className="mt-1 text-xs text-red-600">{errors.delivery_location.message}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">
          Used to calculate freight costs and match suppliers by service region.
        </p>
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
