import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { ErrorState } from '@/components/common/states'
import { FullPageLoader } from '@/components/layout/guards'
import { api } from '@/lib/api/endpoints'
import type { Profile } from '@/lib/api/types'
import { useI18n } from '@/lib/i18n'
import { applyPreferences } from '@/lib/preferences'
import { useAsync } from '@/lib/useAsync'

interface ProfileContextValue {
  profile: Profile
  setProfile: (p: Profile) => void
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used inside StudentGate')
  return ctx
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOptionalProfile(): ProfileContextValue | null {
  return useContext(ProfileContext)
}

/** Loads the student profile, applies their language/accessibility settings, and enforces onboarding. */
export function StudentGate({ children }: { children: ReactNode }) {
  const { data, error, loading, reload, setData } = useAsync(() => api.profile.get(), [])
  const { setLang } = useI18n()

  useEffect(() => {
    if (!data) return
    setLang(data.language)
    applyPreferences(data.preferences)
  }, [data, setLang])

  if (loading && !data) return <FullPageLoader />
  if (error)
    return (
      <div className="mx-auto max-w-lg p-6">
        <ErrorState message={error.message} onRetry={reload} />
      </div>
    )
  if (!data) return null
  if (!data.onboarding_completed) return <Navigate to="/onboarding" replace />
  return <ProfileContext.Provider value={{ profile: data, setProfile: setData }}>{children}</ProfileContext.Provider>
}
