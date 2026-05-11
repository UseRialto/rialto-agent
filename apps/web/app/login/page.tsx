import { Boxes, ShieldCheck, Sparkles } from 'lucide-react'
import { LoginForm } from './_components/LoginForm'

export const metadata = {
  title: 'Sign In - Rialto',
}

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_30rem]" style={{ background: '#1e3a2f', color: '#ffffff' }}>
      <section className="relative flex min-h-[42rem] items-center overflow-hidden px-6 py-10 lg:px-12">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 20% 20%, rgba(200,115,90,0.25), transparent 26rem), radial-gradient(circle at 80% 75%, rgba(45,106,79,0.30), transparent 22rem)' }} />
        <div className="relative z-10 max-w-3xl">
          <div className="mb-10 flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl shadow-xl" style={{ background: '#fa6b04' }}>
              <Boxes className="h-6 w-6 text-white" />
            </span>
            <div>
              <p className="text-2xl font-semibold tracking-tight" style={{ fontFamily: 'var(--font-lora, Georgia, serif)' }}>Rialto</p>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>Construction Procurement OS</p>
            </div>
          </div>
          <h1 className="max-w-2xl text-5xl font-semibold tracking-tight text-white" style={{ fontFamily: 'var(--font-lora, Georgia, serif)' }}>
            Turn RFQs and vendor quotes into one controlled comparison workflow.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Contractor and vendor teams share a focused workspace for project sourcing, quote comparison, mailbox replies, and order tracking.
          </p>
          <div className="mt-10 grid max-w-2xl gap-3 sm:grid-cols-2">
            <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <Sparkles className="h-5 w-5" style={{ color: '#fa6b04' }} />
              <p className="mt-3 text-sm font-semibold">AI-assisted authoring</p>
              <p className="mt-1 text-xs leading-5" style={{ color: 'rgba(255,255,255,0.5)' }}>Draft scopes and vendor outreach with project context.</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <ShieldCheck className="h-5 w-5" style={{ color: '#fdc89a' }} />
              <p className="mt-3 text-sm font-semibold">Role-aware portals</p>
              <p className="mt-1 text-xs leading-5" style={{ color: 'rgba(255,255,255,0.5)' }}>Contractors and vendors see the tools that match their work.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-10" style={{ background: '#f5f0eb', color: '#1e3a2f' }}>
        <div className="w-full max-w-sm">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#fa6b04' }}>Secure access</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight" style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: '#1e3a2f' }}>Sign in to Rialto</h2>
            <p className="mt-2 text-sm leading-6" style={{ color: '#8a9e96' }}>Use your email and password to enter the marketplace.</p>
          </div>
          <div className="rounded-2xl p-6" style={{ background: '#ffffff', border: '1px solid #e2d9cf', boxShadow: '0 4px 24px rgba(30,58,47,0.08)' }}>
            <LoginForm />
          </div>
        </div>
      </section>
    </div>
  )
}
