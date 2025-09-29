'use client'

import { useCallback, useState } from 'react'
import { intentRouterAPI } from '@/lib/api/intent-router'
import type { IntentRequest, IntentResponse } from '@/lib/api/intent-router'

type IntentRouterState = {
  isLoading: boolean
  error: string | null
  lastRoute: IntentResponse | null
  routeIntent: (request: IntentRequest) => Promise<void>
  reset: () => void
}

export function useIntentRouter(): IntentRouterState {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRoute, setLastRoute] = useState<IntentResponse | null>(null)

  const routeIntent = useCallback(async (request: IntentRequest) => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await intentRouterAPI.recognizeIntent(request)
      setLastRoute(response)
    } catch (submitError) {
      console.error(submitError)
      setError('Intent analysis failed. Please verify the router API endpoint.')
      throw submitError
    } finally {
      setIsLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setLastRoute(null)
    setError(null)
  }, [])

  return {
    isLoading,
    error,
    lastRoute,
    routeIntent,
    reset,
  }
}
