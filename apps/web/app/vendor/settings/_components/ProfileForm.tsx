'use client'

import { useActionState } from 'react'
import { updateProfileAction, changePasswordAction } from '@/lib/actions/auth'
import type { User } from '@/lib/auth/types'

interface Props {
  user: User
}

export function ProfileForm({ user }: Props) {
  const [profileState, profileAction, profilePending] = useActionState(updateProfileAction, undefined)
  const [pwState, pwAction, pwPending] = useActionState(changePasswordAction, undefined)

  return (
    <div className="space-y-8">
      {/* Profile section */}
      <div
        className="rounded-xl p-6 shadow-sm"
        style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}
      >
        <h2
          className="mb-4 text-base font-semibold"
          style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}
        >
          Profile Information
        </h2>

        <form action={profileAction} className="space-y-4">
          {profileState?.message && (
            <div
              className="rounded-md px-4 py-3"
              style={
                profileState.message.includes('success')
                  ? { background: '#e8f4ee', border: '1px solid #a8d5ba' }
                  : { background: '#fdeaea', border: '1px solid #f5c6c6' }
              }
            >
              <p
                className="text-sm"
                style={{ color: profileState.message.includes('success') ? '#2d6a4f' : '#c0392b' }}
              >
                {profileState.message}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium" style={{ color: '#4a6358' }}>Full Name</label>
              <input
                name="name"
                type="text"
                defaultValue={user.name}
                required
                className="w-full rounded-md px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none"
                style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
              />
              {profileState?.errors?.name && (
                <p className="mt-1 text-xs" style={{ color: '#c0392b' }}>{profileState.errors.name[0]}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" style={{ color: '#4a6358' }}>Email</label>
              <input
                name="email"
                type="email"
                defaultValue={user.email}
                required
                className="w-full rounded-md px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none"
                style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
              />
              {profileState?.errors?.email && (
                <p className="mt-1 text-xs" style={{ color: '#c0392b' }}>{profileState.errors.email[0]}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" style={{ color: '#4a6358' }}>Phone</label>
              <input
                name="phone"
                type="tel"
                defaultValue={user.company_info?.phone}
                className="w-full rounded-md px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none"
                style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
                placeholder="(555) 000-0000"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" style={{ color: '#4a6358' }}>Company Name</label>
              <input
                name="company_name"
                type="text"
                defaultValue={user.company_info?.company_name}
                className="w-full rounded-md px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none"
                style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
                placeholder="Your company name"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={profilePending}
              className="rounded-md px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: '#1e3a2f' }}
              onMouseEnter={(e) => { if (!profilePending) (e.currentTarget as HTMLButtonElement).style.background = '#4a6358' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#1e3a2f' }}
            >
              {profilePending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      {/* Change password section */}
      <div
        className="rounded-xl p-6 shadow-sm"
        style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}
      >
        <h2
          className="mb-4 text-base font-semibold"
          style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}
        >
          Change Password
        </h2>

        <form action={pwAction} className="space-y-4">
          {pwState?.message && (
            <div
              className="rounded-md px-4 py-3"
              style={
                pwState.message.includes('success')
                  ? { background: '#e8f4ee', border: '1px solid #a8d5ba' }
                  : { background: '#fdeaea', border: '1px solid #f5c6c6' }
              }
            >
              <p
                className="text-sm"
                style={{ color: pwState.message.includes('success') ? '#2d6a4f' : '#c0392b' }}
              >
                {pwState.message}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium" style={{ color: '#4a6358' }}>Current Password</label>
              <input
                name="current_password"
                type="password"
                autoComplete="current-password"
                required
                className="w-full rounded-md px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none"
                style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
                placeholder="••••••••"
              />
              {pwState?.errors?.current_password && (
                <p className="mt-1 text-xs" style={{ color: '#c0392b' }}>{pwState.errors.current_password[0]}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" style={{ color: '#4a6358' }}>New Password</label>
              <input
                name="new_password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className="w-full rounded-md px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none"
                style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
                placeholder="••••••••"
              />
              {pwState?.errors?.new_password && (
                <p className="mt-1 text-xs" style={{ color: '#c0392b' }}>{pwState.errors.new_password[0]}</p>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={pwPending}
              className="rounded-md px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: '#1e3a2f' }}
              onMouseEnter={(e) => { if (!pwPending) (e.currentTarget as HTMLButtonElement).style.background = '#4a6358' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#1e3a2f' }}
            >
              {pwPending ? 'Updating…' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>

      {/* Onboarding info */}
      {user.company_info && (
        <div
          className="rounded-xl p-6 shadow-sm"
          style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}
        >
          <div className="flex items-center justify-between">
            <h2
              className="text-base font-semibold"
              style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}
            >
              Company Profile
            </h2>
            <a href="/vendor/onboarding" className="text-sm font-medium" style={{ color: '#fa6b04' }}>
              Edit →
            </a>
          </div>
          {user.company_info.materials && user.company_info.materials.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-medium" style={{ color: '#8a9e96' }}>Materials</p>
              <div className="flex flex-wrap gap-1">
                {user.company_info.materials.map((m) => (
                  <span
                    key={m}
                    className="rounded-full px-2.5 py-0.5 text-xs"
                    style={{ background: '#ede8e2', color: '#4a6358' }}
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}
          {user.company_info.certifications && user.company_info.certifications.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-medium" style={{ color: '#8a9e96' }}>Certifications</p>
              <div className="flex flex-wrap gap-1">
                {user.company_info.certifications.map((c) => (
                  <span
                    key={c}
                    className="rounded-full px-2.5 py-0.5 text-xs"
                    style={{ background: '#fff3eb', color: '#fa6b04' }}
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
