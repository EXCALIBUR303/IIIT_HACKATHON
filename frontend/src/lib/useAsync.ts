import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'
import { ApiError } from './api/client'

export interface AsyncState<T> {
  data: T | undefined
  error: ApiError | null
  loading: boolean
  reload: () => void
  setData: (value: T) => void
}

/** Load data on mount / when deps change, with loading and error states and stale-response protection. */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList = []): AsyncState<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const callId = useRef(0)

  useEffect(() => {
    const id = ++callId.current
    setLoading(true)
    setError(null)
    fn()
      .then((value) => {
        if (id === callId.current) setData(value)
      })
      .catch((err: unknown) => {
        if (id === callId.current)
          setError(err instanceof ApiError ? err : new ApiError(0, 'unknown', 'Something went wrong'))
      })
      .finally(() => {
        if (id === callId.current) setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, reload, setData }
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return 'Something went wrong'
}
