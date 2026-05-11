'use client'

import { useState, useActionState } from 'react'
import { cn } from '@/lib/utils'
import { saveOnboardingAction, skipOnboardingAction } from '@/lib/actions/auth'

const MATERIAL_OPTIONS = [
  'Structural Steel',
  'Rebar / Reinforcing Steel',
  'Steel Connections & Hardware',
  'Steel Decking',
  'HSS / Tube Steel',
  'Ready-Mix Concrete',
  'Precast Concrete',
  'Lumber & Engineered Wood',
  'Mechanical / HVAC',
  'Electrical',
  'Plumbing',
  'Post-Tension',
  'Masonry',
  'Curtain Wall / Glazing',
]

export function OnboardingForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(saveOnboardingAction, undefined)
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([])

  function toggleMaterial(m: string) {
    setSelectedMaterials((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
    )
  }

  return (
    <form action={action} className="space-y-6">
      {/* Hidden materials fields */}
      {selectedMaterials.map((m) => (
        <input key={m} type="hidden" name="materials" value={m} />
      ))}

      {state?.message && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{state.message}</p>
        </div>
      )}

      {/* Company Info */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Company Information</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Company Name</label>
            <input
              name="company_name"
              type="text"
              placeholder="Pacific Coast Steel Inc."
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Phone</label>
            <input
              name="phone"
              type="tel"
              placeholder="(555) 000-0000"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">Headquarters Address</label>
            <input
              name="address"
              type="text"
              placeholder="123 Industrial Blvd, Los Angeles, CA 90001"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Years in Business</label>
            <input
              name="years_in_business"
              type="number"
              min={0}
              placeholder="e.g. 15"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Materials */}
      <div>
        <h3 className="mb-1 text-sm font-semibold text-gray-700">Materials You Supply</h3>
        <p className="mb-3 text-xs text-gray-400">Select all that apply - used to match you with relevant RFQs.</p>
        <div className="flex flex-wrap gap-2">
          {MATERIAL_OPTIONS.map((m) => {
            const selected = selectedMaterials.includes(m)
            return (
              <button
                key={m}
                type="button"
                onClick={() => toggleMaterial(m)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  selected
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400',
                )}
              >
                {m}
              </button>
            )
          })}
        </div>
      </div>

      {/* Certifications */}
      <div>
        <label className="mb-1 block text-sm font-semibold text-gray-700">Certifications</label>
        <p className="mb-2 text-xs text-gray-400">Comma-separated (e.g. ISO 9001, AISC Certified, AWS D1.1)</p>
        <input
          name="certifications"
          type="text"
          placeholder="ISO 9001, AISC Certified, ASTM A992"
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
        />
      </div>

      {/* Service Regions */}
      <div>
        <label className="mb-1 block text-sm font-semibold text-gray-700">Service Regions</label>
        <p className="mb-2 text-xs text-gray-400">Comma-separated (e.g. California, Pacific Northwest, Southwest US)</p>
        <input
          name="service_regions"
          type="text"
          placeholder="California, Nevada, Arizona"
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-gray-100 pt-4">
        <button
          type="submit"
          formAction={skipOnboardingAction}
          className="text-sm font-medium text-gray-400 hover:text-gray-600"
        >
          Skip for now →
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save & Continue'}
        </button>
      </div>
    </form>
  )
}
