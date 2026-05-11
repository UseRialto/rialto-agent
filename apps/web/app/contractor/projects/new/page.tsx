import { CreateProjectForm } from './_components/CreateProjectForm'

export const metadata = {
  title: 'New Project - Rialto',
}

export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold" style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}>Create New Project</h1>
        <p className="mt-0.5 text-sm" style={{ color: '#8a9e96' }}>
          Projects organize your RFQs and procurement activity.
        </p>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm" style={{ borderColor: '#e2d9cf' }}>
        <CreateProjectForm />
      </div>
    </div>
  )
}
