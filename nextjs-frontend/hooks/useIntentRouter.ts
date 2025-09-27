'use client'

import { useCallback, useState } from 'react'
import { intentRouterAPI } from '@/lib/api/intent-router'
import type { IntentRequest, IntentResponse } from '@/lib/api/intent-router'

type IntentRouterState = {
  isLoading: boolean
  error: string | null
  lastRoute: IntentResponse | null
  routeIntent: (request: IntentRequest) => Promise<void>
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
      setError('インテント解析に失敗しました。APIエンドポイントを確認してください。')
      throw submitError
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    isLoading,
    error,
    lastRoute,
    routeIntent,
  }
}
