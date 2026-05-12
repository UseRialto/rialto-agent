import Image from 'next/image'
import { RegisterForm } from './_components/RegisterForm'

export const metadata = {
  title: 'Create Account - Rialto',
}

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8" style={{ background: '#f5f0eb' }}>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Image
            src="/Rialto_Full_Logo_CLEAR.png"
            alt="Rialto"
            width={194}
            height={38}
            priority
            className="h-auto w-[12.125rem]"
          />
        </div>

        <div className="rounded-2xl p-6" style={{ background: '#ffffff', border: '1px solid #e2d9cf', boxShadow: '0 4px 24px rgba(30,58,47,0.08)' }}>
          <h1 className="mb-5 text-lg font-semibold" style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: '#1e3a2f' }}>Create your account</h1>
          <RegisterForm />
        </div>
      </div>
    </div>
  )
}
