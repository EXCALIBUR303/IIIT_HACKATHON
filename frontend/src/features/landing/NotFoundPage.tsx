import { Link } from 'react-router-dom'
import { LogoMark } from '@/components/brand/Logo'
import { Button } from '@/components/ui/button'

export default function NotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <LogoMark size={56} />
      <h1 className="text-2xl font-extrabold">Page not found</h1>
      <p className="max-w-sm text-muted">This page doesn’t exist. Your fictional rupees are safe though.</p>
      <Button asChild>
        <Link to="/">Go home</Link>
      </Button>
    </main>
  )
}
