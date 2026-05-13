'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { LogOut, Settings } from 'lucide-react'
import { logoutAction } from '@/lib/actions/auth'

export function ProfileMenu({
  displayName,
  displayEmail,
  settingsHref,
}: {
  displayName: string
  displayEmail: string
  settingsHref: string
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const initial = displayName.charAt(0).toUpperCase()

  useEffect(() => {
    if (!open) return
    function closeOnOutsideClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold"
        style={{ background: '#1e3a2f', color: '#ffffff', outline: '1px solid #e2d9cf' }}
        title={displayName}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {initial}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-[100] mt-2 w-64 overflow-hidden rounded-xl border bg-white shadow-xl" style={{ borderColor: '#e2d9cf' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #ede8e2' }}>
            <p className="truncate text-sm font-semibold" style={{ color: '#1e3a2f' }}>{displayName}</p>
            {displayEmail && <p className="truncate text-xs" style={{ color: '#8a9e96' }}>{displayEmail}</p>}
          </div>
          <Link href={settingsHref} role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-3 text-sm font-medium" style={{ color: '#4a6358' }}>
            <Settings className="h-4 w-4" />
            Settings
          </Link>
          <form action={logoutAction}>
            <button type="submit" role="menuitem" className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium" style={{ color: '#a85c2a', borderTop: '1px solid #ede8e2' }}>
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
