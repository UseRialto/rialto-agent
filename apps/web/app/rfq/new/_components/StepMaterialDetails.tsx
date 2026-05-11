'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MATERIAL_CATEGORIES, type RFQFormData } from '@/lib/types/rfq'

const schema = z.object({
  material_name: z.string().min(2, 'Enter the material name'),
  category: z.string().min(1, 'Select a category'),
  specs: z.string().min(10, 'Describe the technical specifications (min 10 chars)'),
})

type Fields = Pick<RFQFormData, 'material_name' | 'category' | 'specs'>

interface Props {
  data: RFQFormData
  onNext: (data: Partial<RFQFormData>) => void
}

export function StepMaterialDetails({ data, onNext }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: { material_name: data.material_name, category: data.category, specs: data.specs },
  })

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Material Name <span className="text-red-500">*</span>
        </label>
        <input
          {...register('material_name')}
          placeholder="e.g. Ready-Mix Concrete 4000 PSI"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
        {errors.material_name && (
          <p className="mt-1 text-xs text-red-600">{errors.material_name.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Category <span className="text-red-500">*</span>
        </label>
        <select
          {...register('category')}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        >
          <option value="">Select a material category…</option>
          {MATERIAL_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        {errors.category && (
          <p className="mt-1 text-xs text-red-600">{errors.category.message}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">
          Category determines which suppliers receive notification and which intelligence report is generated.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Technical Specifications <span className="text-red-500">*</span>
        </label>
        <textarea
          {...register('specs')}
          rows={4}
          placeholder="Describe grade, mix design, performance requirements, applicable standards…"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
        {errors.specs && (
          <p className="mt-1 text-xs text-red-600">{errors.specs.message}</p>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          className="rounded-md bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none"
        >
          Next →
        </button>
      </div>
    </form>
  )
}
