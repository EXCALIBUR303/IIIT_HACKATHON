import { MotionConfig } from 'motion/react'
import { StrictMode, useEffect, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AuthProvider } from './lib/auth'
import { I18nProvider } from './lib/i18n'
import { applyPreferences, storedPreferences } from './lib/preferences'
import './index.css'

applyPreferences(storedPreferences())

/** Motion follows the OS setting and the in-app "Reduce motion" switch (a class on <html>). */
function AppMotion({ children }: { children: ReactNode }) {
  const read = () => document.documentElement.classList.contains('pref-reduced-motion')
  const [reduce, setReduce] = useState(read)
  useEffect(() => {
    const mo = new MutationObserver(() => setReduce(read()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [])
  return <MotionConfig reducedMotion={reduce ? 'always' : 'user'}>{children}</MotionConfig>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppMotion>
      <I18nProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </I18nProvider>
    </AppMotion>
  </StrictMode>,
)
