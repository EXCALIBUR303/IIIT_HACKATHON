import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { setUnauthorizedHandler, tokenStore } from './api/client'
import { api } from './api/endpoints'
import type { TokenResponse, User } from './api/types'

interface AuthContextValue {
  user: User | null
  ready: boolean
  signIn: (res: TokenResponse) => void
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  const signOut = useCallback(() => {
    tokenStore.set(null)
    setUser(null)
  }, [])

  const signIn = useCallback((res: TokenResponse) => {
    tokenStore.set(res.access_token)
    setUser(res.user)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(signOut)
    if (!tokenStore.get()) {
      setReady(true)
      return
    }
    api.auth
      .me()
      .then(setUser)
      .catch(() => tokenStore.set(null))
      .finally(() => setReady(true))
    return () => setUnauthorizedHandler(null)
  }, [signOut])

  const value = useMemo(() => ({ user, ready, signIn, signOut }), [user, ready, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
