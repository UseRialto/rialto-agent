import { Boxes } from 'lucide-react'
import { RegisterForm } from './_components/RegisterForm'

export const metadata = {
  title: 'Create Account - Rialto',
}

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8" style={{ background: '#f5f0eb' }}>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: '#1e3a2f' }}>
            <Boxes className="h-5 w-5 text-white" />
          </span>
          <div>
            <p className="text-xl font-semibold tracking-tight" style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: '#1e3a2f' }}>Rialto</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>Procurement OS</p>
          </div>
        </div>

        <div className="rounded-2xl p-6" style={{ background: '#ffffff', border: '1px solid #e2d9cf', boxShadow: '0 4px 24px rgba(30,58,47,0.08)' }}>
          <h1 className="mb-5 text-lg font-semibold" style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: '#1e3a2f' }}>Create your account</h1>
          <RegisterForm />
        </div>
      </div>
    </div>
  )
}
