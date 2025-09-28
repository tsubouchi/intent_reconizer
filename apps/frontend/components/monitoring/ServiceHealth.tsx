'use client'

import { useEffect, useState } from 'react'
import { intentRouterAPI } from '@/lib/api/intent-router'
import type { ServiceHealth as ServiceHealthEntry } from '@/lib/api/intent-router'

export function ServiceHealth() {
  const [services, setServices] = useState<ServiceHealthEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    const fetchHealth = async () => {
      try {
        setIsLoading(true)
        const data = await intentRouterAPI.getServiceHealth()
        if (isMounted) {
          setServices(data)
          setError(null)
        }
      } catch (fetchError) {
        console.error(fetchError)
        if (isMounted) {
          setError('サービスのヘルス情報を取得できませんでした。Intent Router の `/health/services` が応答しているか確認してください。')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    fetchHealth()
    const intervalId = setInterval(fetchHealth, 30_000)

    return () => {
      isMounted = false
      clearInterval(intervalId)
    }
  }, [])

  if (isLoading) {
    return <p className="text-sm text-[var(--text-muted)]">サービスの状態を読み込み中...</p>
  }

  if (error) {
    return <p className="text-sm text-red-300">{error}</p>
  }

  if (!services.length) {
    return <p className="text-sm text-[var(--text-muted)]">表示するサービスの情報がありません。</p>
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {services.map((service) => (
        <div
          key={service.service}
          className="glass-card glass-outline p-5"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">{service.service}</h3>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                service.status === 'healthy'
                  ? 'badge'
                : service.status === 'degraded'
                    ? 'badge degraded'
                    : service.status === 'unhealthy'
                      ? 'badge critical'
                      : 'badge'
              }`}
            >
              {service.status}
            </span>
          </div>

          <dl className="mt-4 space-y-2 text-sm text-[var(--text-muted)]">
            <div className="flex justify-between">
              <dt>レイテンシ</dt>
              <dd>{service.latency} ms</dd>
            </div>
            <div className="flex justify-between">
              <dt>エラーレート</dt>
              <dd>{(service.errorRate * 100).toFixed(2)}%</dd>
            </div>
            <div className="flex justify-between">
              <dt>スループット</dt>
              <dd>{service.throughput} rpm</dd>
            </div>
            <div className="flex justify-between">
              <dt>最終チェック</dt>
              <dd className="text-[var(--text-primary)]">{new Date(service.lastChecked).toLocaleString()}</dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  )
}
