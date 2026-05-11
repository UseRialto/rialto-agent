'use client'

import { useState } from 'react'
import { MATERIAL_CATEGORIES, MATERIAL_UNITS, type RFQFormData } from '@/lib/types/rfq'
import { formatCurrency } from '@/lib/utils'

interface Props {
  data: RFQFormData
  onSubmit: (data: Partial<RFQFormData>) => void
  onBack: () => void
}

interface RowProps {
  label: string
  value: React.ReactNode
}

function Row({ label, value }: RowProps) {
  return (
    <div className="grid grid-cols-3 gap-4 py-2.5">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="col-span-2 text-sm text-gray-900">{value}</dd>
    </div>
  )
}

export function StepReview({ data, onSubmit, onBack }: Props) {
  const [loading, setLoading] = useState(false)

  const categoryLabel =
    MATERIAL_CATEGORIES.find((c) => c.value === data.category)?.label ?? data.category
  const unitLabel =
    MATERIAL_UNITS.find((u) => u.value === data.unit)?.label ?? data.unit

  function handlePost() {
    setLoading(true)
    // Small delay to simulate async post
    setTimeout(() => onSubmit({}), 600)
  }

  const hasBudget = data.budget_min || data.budget_max

  return (
    <div className="space-y-5">
      <div className="rounded-md bg-gray-50 px-4 py-1">
        <dl className="divide-y divide-gray-200">
          <Row label="Material" value={data.material_name} />
          <Row label="Category" value={categoryLabel} />
          <Row label="Quantity" value={`${data.quantity} ${unitLabel}`} />
          <Row
            label="Certifications"
            value={
              data.certifications_required.length > 0
                ? data.certifications_required.join(', ')
                : <span className="text-gray-400">None specified</span>
            }
          />
          <Row label="Delivery Date" value={data.delivery_date} />
          <Row label="Delivery Location" value={data.delivery_location} />
          <Row
            label="Budget"
            value={
              hasBudget
                ? `${data.budget_min ? formatCurrency(Number(data.budget_min)) : '-'} - ${data.budget_max ? formatCurrency(Number(data.budget_max)) : '-'}`
                : <span className="text-gray-400">Not specified</span>
            }
          />
          <Row
            label="International Suppliers"
            value={
              data.accepts_international ? (
                <span className="flex items-center gap-1 text-green-700">
                  <span>✓</span> Allowed
                </span>
              ) : (
                <span className="text-gray-500">Domestic only</span>
              )
            }
          />
        </dl>
      </div>

      <div className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-600">
        <p className="font-medium text-gray-800">What happens next</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-gray-500">
          <li>Matched suppliers are notified immediately</li>
          <li>
            You&apos;ll be taken to the <strong>Material Intelligence Report</strong> for{' '}
            <strong>{categoryLabel}</strong> - review recommended suppliers and invite additional ones
          </li>
          <li>Quotes arrive within 24–72 hours depending on supplier response time</li>
        </ol>
      </div>

      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="rounded-md border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={handlePost}
          disabled={loading}
          className="flex items-center gap-2 rounded-md bg-amber-500 px-6 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
        >
          {loading ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Posting…
            </>
          ) : (
            'Post RFQ →'
          )}
        </button>
      </div>
    </div>
  )
}
