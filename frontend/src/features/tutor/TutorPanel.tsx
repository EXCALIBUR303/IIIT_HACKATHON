import { Bot, MessageCircleQuestion, Send } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { api } from '@/lib/api/endpoints'
import type { TutorAnswer } from '@/lib/api/types'
import { useI18n } from '@/lib/i18n'
import { errorMessage } from '@/lib/useAsync'

const OPEN_EVENT = 'rupeerise:open-tutor'

interface OpenRequest {
  question?: string
  sessionId?: string
}

/** Open the tutor from anywhere (e.g. "Explain my result"). */
// eslint-disable-next-line react-refresh/only-export-components
export function openTutor(req: OpenRequest = {}) {
  window.dispatchEvent(new CustomEvent<OpenRequest>(OPEN_EVENT, { detail: req }))
}

const SUGGESTIONS = ['What is an emergency fund?', 'Why should I never share my OTP?', 'How is compound interest different?', 'What does diversification mean?']

export function TutorButton() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [sessionId, setSessionId] = useState<string | undefined>()
  const [answers, setAnswers] = useState<{ q: string; a: TutorAnswer }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef<OpenRequest | null>(null)

  async function ask(q: string, sid?: string) {
    if (q.trim().length < 2) return
    setBusy(true)
    setError(null)
    try {
      const a = await api.tutor.ask({ question: q.trim(), session_id: sid })
      setAnswers((xs) => [...xs, { q: q.trim(), a }])
      setQuestion('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<OpenRequest>).detail
      setOpen(true)
      setSessionId(detail.sessionId)
      if (detail.question) pending.current = detail
    }
    window.addEventListener(OPEN_EVENT, handler)
    return () => window.removeEventListener(OPEN_EVENT, handler)
  }, [])

  useEffect(() => {
    if (open && pending.current?.question) {
      const req = pending.current
      pending.current = null
      void ask(req.question!, req.sessionId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void ask(question, sessionId)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-raised)] hover:bg-primary-hover"
      >
        <MessageCircleQuestion className="size-5" aria-hidden />
        <span className="hidden sm:inline">{t('tutor.title')}</span>
        <span className="sr-only sm:hidden">{t('tutor.title')}</span>
      </button>
      <Sheet open={open} onOpenChange={setOpen} title={t('tutor.title')} description="Explains money ideas and your own simulation results. It never gives investment advice.">
        <div className="flex h-full flex-col">
          <div className="flex-1 space-y-4" aria-live="polite">
            {answers.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted">Try one of these:</p>
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => void ask(s)} className="block w-full rounded-xl border border-line px-3 py-2 text-left text-sm hover:bg-canvas">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {answers.map(({ q, a }, i) => (
              <div key={i} className="space-y-2">
                <p className="ml-8 rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2.5 text-sm text-white">{q}</p>
                <div className="mr-4 rounded-2xl rounded-tl-sm bg-canvas p-3.5 text-sm leading-relaxed ring-1 ring-line">
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted">
                    <Bot className="size-4" aria-hidden />
                    {a.source === 'ai' ? 'AI explanation, grounded on RupeeRise content' : 'From the RupeeRise glossary'}
                  </p>
                  <p className="whitespace-pre-line">{a.answer}</p>
                  {a.concept && <Badge className="mt-2">{a.concept.replaceAll('_', ' ')}</Badge>}
                </div>
              </div>
            ))}
            {error && <Alert tone="danger">{error}</Alert>}
          </div>
          <form onSubmit={submit} className="sticky bottom-0 mt-4 flex gap-2 bg-surface pt-2">
            <label htmlFor="tutor-q" className="sr-only">
              Your question
            </label>
            <input
              id="tutor-q"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={500}
              placeholder={t('tutor.placeholder')}
              className="h-11 flex-1 rounded-xl border border-line-strong px-3 text-sm focus:border-primary focus:outline-none"
            />
            <Button type="submit" size="icon" loading={busy} aria-label={t('tutor.ask')} disabled={question.trim().length < 2}>
              {!busy && <Send />}
            </Button>
          </form>
        </div>
      </Sheet>
    </>
  )
}
