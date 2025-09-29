'use client'

import { useEffect, useState } from 'react'
import { intentRouterAPI } from '@/lib/api/intent-router'

export function IntentMonitor() {
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    let isMounted = true

    const checkIntentRouter = async () => {
      try {
        const healthy = await intentRouterAPI.checkLiveness()
        if (isMounted) {
          setIsHealthy(healthy)
          setLastUpdated(new Date())
        }
      } catch (error) {
        console.error(error)
        if (isMounted) {
          setIsHealthy(false)
          setLastUpdated(new Date())
        }
      }
    }

    checkIntentRouter()
    const intervalId = setInterval(checkIntentRouter, 60_000)

    return () => {
      isMounted = false
      clearInterval(intervalId)
    }
  }, [])

  const statusText = isHealthy === null ? 'Checking...' : isHealthy ? 'Online' : 'Offline'
  const statusClass =
    isHealthy === null
      ? 'border border-[rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.08)]'
      : isHealthy
        ? 'border border-emerald-400 bg-emerald-500/15'
        : 'border border-red-400 bg-red-500/15'

  return (
    <footer className="mt-16">
      <div className="container mx-auto px-6 pb-8">
        <div className="glass-card glass-outline flex flex-col gap-3 rounded-2xl px-6 py-5 text-sm text-[var(--text-muted)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className={`status-chip ${statusClass}`}>Router {statusText}</span>
            {lastUpdated && <span className="text-xs uppercase tracking-[0.3em] text-[var(--text-soft)]">Last updated {lastUpdated.toLocaleTimeString()}</span>}
          </div>
          <p className="text-xs leading-relaxed">
            When the backend is unavailable the metrics and manifest experience fall back to placeholder data. Update `NEXT_PUBLIC_ROUTER_API_URL` to point at a reachable router instance before relying on this dashboard.
          </p>
        </div>
      </div>
    </footer>
  )
}
