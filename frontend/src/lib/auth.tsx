import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { hasSessionHint, setUnauthorizedHandler } from './api/client'
import { api } from './api/endpoints'
import type { AuthResponse, User } from './api/types'

interface AuthContextValue {
  user: User | null
  ready: boolean
  signIn: (res: AuthResponse) => void
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  // Local-only: the session has already ended (or is being ended) on the server.
  const clear = useCallback(() => setUser(null), [])

  // Logging out is a server action: the cookies alone are not what ends a session.
  const signOut = useCallback(() => {
    setUser(null)
    void api.auth.logout().catch(() => undefined)
  }, [])

  const signIn = useCallback((res: AuthResponse) => setUser(res.user), [])

  useEffect(() => {
    setUnauthorizedHandler(clear)
    // The session lives in HttpOnly cookies the page cannot read; the readable CSRF cookie
    // tells us whether it is worth asking who is signed in.
    if (!hasSessionHint()) {
      setReady(true)
    } else {
      api.auth
        .me()
        .then(setUser)
        .catch(() => undefined)
        .finally(() => setReady(true))
    }
    return () => setUnauthorizedHandler(null)
  }, [clear])

  const value = useMemo(() => ({ user, ready, signIn, signOut }), [user, ready, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
