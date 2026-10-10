import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { LogoMark } from '@/components/brand/Logo'
import { useAuth } from '@/lib/auth'

export function FullPageLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Loading">
      <LogoMark size={48} className="animate-pulse" />
    </div>
  )
}

export function RequireRole({ role, children }: { role: 'student' | 'educator'; children: ReactNode }) {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <FullPageLoader />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  const ok = role === 'student' ? user.role === 'student' : user.role === 'educator' || user.role === 'admin'
  if (!ok) return <Navigate to={user.role === 'student' ? '/app' : '/educator'} replace />
  return <>{children}</>
}

export function homeFor(role: string): string {
  return role === 'student' ? '/app' : '/educator'
}
