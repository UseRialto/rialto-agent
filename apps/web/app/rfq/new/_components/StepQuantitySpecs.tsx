'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MATERIAL_UNITS, CERTIFICATION_OPTIONS, type RFQFormData } from '@/lib/types/rfq'

const schema = z.object({
  quantity: z.string().min(1, 'Enter a quantity').refine((v) => !isNaN(Number(v)) && Number(v) > 0, 'Must be a positive number'),
  unit: z.string().min(1, 'Select a unit'),
  certifications_required: z.array(z.string()),
})

type Fields = Pick<RFQFormData, 'quantity' | 'unit' | 'certifications_required'>

interface Props {
  data: RFQFormData
  onNext: (data: Partial<RFQFormData>) => void
  onBack: () => void
}

export function StepQuantitySpecs({ data, onNext, onBack }: Props) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: {
      quantity: data.quantity,
      unit: data.unit,
      certifications_required: data.certifications_required,
    },
  })

  const selected = watch('certifications_required') ?? []

  function toggleCert(cert: string) {
    const next = selected.includes(cert) ? selected.filter((c) => c !== cert) : [...selected, cert]
    setValue('certifications_required', next)
  }

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Quantity <span className="text-red-500">*</span>
          </label>
          <input
            {...register('quantity')}
            type="number"
            min="0"
            step="any"
            placeholder="e.g. 1200"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
          {errors.quantity && (
            <p className="mt-1 text-xs text-red-600">{errors.quantity.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Unit <span className="text-red-500">*</span>
          </label>
          <select
            {...register('unit')}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          >
            {MATERIAL_UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Required Certifications</label>
        <p className="mt-0.5 text-xs text-gray-500">
          Only suppliers with matching certifications will be notified.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {CERTIFICATION_OPTIONS.map((cert) => (
            <button
              key={cert}
              type="button"
              onClick={() => toggleCert(cert)}
              className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
                selected.includes(cert)
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
              }`}
            >
              {cert}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Specification Documents</label>
        <div className="mt-1 flex items-center justify-center rounded-md border-2 border-dashed border-gray-300 px-6 py-8 text-center">
          <div>
            <p className="text-sm text-gray-500">Drag & drop spec sheets, drawings, or standards</p>
            <p className="mt-1 text-xs text-gray-400">PDF, DWG, DXF up to 25 MB each</p>
            <button type="button" className="mt-3 rounded bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200">
              Browse files
            </button>
            <p className="mt-2 text-xs text-gray-400">(File upload available in Phase 2)</p>
          </div>
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
