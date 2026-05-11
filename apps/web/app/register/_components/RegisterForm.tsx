'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { registerAction } from '@/lib/actions/auth'

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, undefined)
  const [selectedRole, setSelectedRole] = useState<string>('')

  return (
    <form action={action} className="space-y-4">
      {state?.message && (
        <div className="rounded-xl px-4 py-3" style={{ background: '#fdeaea', border: '1px solid #f5c6c6' }}>
          <p className="text-sm" style={{ color: '#c0392b' }}>{state.message}</p>
        </div>
      )}

      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium" style={{ color: '#4a6358' }}>
          Full Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
          style={{ background: '#ede8e2', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
          placeholder="Jane Smith"
        />
        {state?.errors?.name && (
          <p className="mt-1 text-xs" style={{ color: '#c0392b' }}>{state.errors.name[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium" style={{ color: '#4a6358' }}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
          style={{ background: '#ede8e2', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
          placeholder="you@company.com"
        />
        {state?.errors?.email && (
          <p className="mt-1 text-xs" style={{ color: '#c0392b' }}>{state.errors.email[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium" style={{ color: '#4a6358' }}>
          Password <span className="font-normal" style={{ color: '#8a9e96' }}>(min 8 characters)</span>
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
          style={{ background: '#ede8e2', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
          placeholder="••••••••"
        />
        {state?.errors?.password && (
          <p className="mt-1 text-xs" style={{ color: '#c0392b' }}>{state.errors.password[0]}</p>
        )}
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium" style={{ color: '#4a6358' }}>I am a…</label>
        <div className="grid grid-cols-2 gap-3">
          {(['vendor', 'contractor'] as const).map((role) => (
            <label
              key={role}
              className="flex cursor-pointer flex-col items-center rounded-xl border-2 p-3 text-center transition-colors"
              style={selectedRole === role
                ? { borderColor: '#1e3a2f', background: '#f0f4f1' }
                : { borderColor: '#e2d9cf', background: '#ffffff' }}
            >
              <input
                type="radio"
                name="role"
                value={role}
                className="sr-only"
                required
                onChange={() => setSelectedRole(role)}
              />
              <span className="text-xl">{role === 'vendor' ? '🏭' : '🏗'}</span>
              <span className="mt-1 text-sm font-medium capitalize" style={{ color: '#1e3a2f' }}>{role}</span>
              <span className="mt-0.5 text-xs" style={{ color: '#8a9e96' }}>
                {role === 'vendor' ? 'Supplier / Distributor' : 'General Contractor'}
              </span>
            </label>
          ))}
        </div>
        {state?.errors?.role && (
          <p className="mt-1 text-xs" style={{ color: '#c0392b' }}>{state.errors.role[0]}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-60 transition-colors"
        style={{ background: '#1e3a2f' }}
      >
        {pending ? 'Creating account…' : 'Create Account'}
      </button>

      <p className="text-center text-sm" style={{ color: '#8a9e96' }}>
        Already have an account?{' '}
        <Link href="/login" className="font-medium hover:underline" style={{ color: '#fa6b04' }}>
          Sign in
        </Link>
      </p>
    </form>
  )
}
