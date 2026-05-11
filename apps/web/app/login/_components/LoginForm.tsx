'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { loginAction } from '@/lib/actions/auth'

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined)

  return (
    <form action={action} className="space-y-4">
      {state?.message && (
        <div className="rounded-xl px-4 py-3" style={{ background: '#fdeaea', border: '1px solid #f5c6c6' }}>
          <p className="text-sm" style={{ color: '#c0392b' }}>{state.message}</p>
        </div>
      )}

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-semibold" style={{ color: '#4a6358' }}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-xl px-3 py-2.5 text-sm shadow-sm transition-colors focus:outline-none"
          style={{ background: '#ede8e2', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
          placeholder="you@company.com"
        />
        {state?.errors?.email && (
          <p className="mt-1 text-xs" style={{ color: '#c0392b' }}>{state.errors.email[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-semibold" style={{ color: '#4a6358' }}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-xl px-3 py-2.5 text-sm shadow-sm transition-colors focus:outline-none"
          style={{ background: '#ede8e2', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
          placeholder="••••••••"
        />
        {state?.errors?.password && (
          <p className="mt-1 text-xs" style={{ color: '#c0392b' }}>{state.errors.password[0]}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl py-2.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-60"
        style={{ background: '#1e3a2f' }}
      >
        {pending ? 'Signing in…' : 'Sign In'}
      </button>

      <p className="text-center text-sm" style={{ color: '#8a9e96' }}>
        No account?{' '}
        <Link href="/register" className="font-semibold hover:underline" style={{ color: '#fa6b04' }}>
          Create one
        </Link>
      </p>
    </form>
  )
}
