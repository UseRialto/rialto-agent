import { AppShell } from '@/components/layout/AppShell'
import { RFQWizard } from './_components/RFQWizard'

export const metadata = {
  title: 'Post New RFQ - Rialto',
}

export default function NewRFQPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Post a Material Request</h1>
          <p className="mt-1 text-sm text-gray-500">
            Submit an RFQ to notify matched suppliers and get competitive quotes.
          </p>
        </div>
        <RFQWizard />
      </div>
    </AppShell>
  )
}
