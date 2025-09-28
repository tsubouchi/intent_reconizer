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

  const statusText = isHealthy === null ? 'チェック中…' : isHealthy ? 'オンライン' : 'オフライン'
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
            {lastUpdated && <span className="text-xs uppercase tracking-[0.3em] text-[var(--text-soft)]">最終更新 {lastUpdated.toLocaleTimeString()}</span>}
          </div>
          <p className="text-xs leading-relaxed">
            バックエンドが停止している場合、メトリクスとマニフェスト機能はプレースホルダーデータになります。`NEXT_PUBLIC_ROUTER_API_URL` を更新して接続を確認してください。
          </p>
        </div>
      </div>
    </footer>
  )
}
