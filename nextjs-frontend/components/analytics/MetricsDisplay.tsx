'use client'

import { useEffect, useState } from 'react'
import { intentRouterAPI } from '@/lib/api/intent-router'
import type { RoutingMetrics } from '@/lib/api/intent-router'

export function MetricsDisplay() {
  const [metrics, setMetrics] = useState<RoutingMetrics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    const fetchMetrics = async () => {
      try {
        setIsLoading(true)
        const data = await intentRouterAPI.getMetrics()
        if (isMounted) {
          setMetrics(data)
          setError(null)
        }
      } catch (fetchError) {
        console.error(fetchError)
        if (isMounted) {
          setError('メトリクスを取得できませんでした。Intent Router の `/metrics` が利用可能か、Prometheus や OpenTelemetry の設定を確認してください。')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    fetchMetrics()
    const intervalId = setInterval(fetchMetrics, 60_000)

    return () => {
      isMounted = false
      clearInterval(intervalId)
    }
  }, [])

  if (isLoading) {
    return <p className="text-sm text-[var(--text-muted)]">メトリクスを読み込み中...</p>
  }

  if (error) {
    return <p className="text-sm text-red-300">{error}</p>
  }

  if (!metrics) {
    return <p className="text-sm text-[var(--text-muted)]">表示するメトリクスがありません。</p>
  }

  const topMetrics = [
    {
      label: '総リクエスト数',
      value: metrics.totalRequests.toLocaleString(),
    },
    {
      label: '成功率',
      value: `${(metrics.successRate * 100).toFixed(1)}%`,
    },
    {
      label: '平均レイテンシ',
      value: `${metrics.averageLatency.toFixed(0)} ms`,
    },
    {
      label: 'キャッシュヒット率',
      value: `${(metrics.cacheHitRate * 100).toFixed(1)}%`,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {topMetrics.map((metric) => (
          <div key={metric.label} className="glass-card glass-outline p-4">
            <dt className="text-xs uppercase tracking-[0.3em] text-[var(--text-soft)]">{metric.label}</dt>
            <dd className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{metric.value}</dd>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-card glass-outline p-5">
          <h3 className="text-sm uppercase tracking-[0.3em] text-[var(--text-soft)]">サービスディストリビューション</h3>
          <ul className="mt-4 space-y-2 text-sm text-[var(--text-muted)]">
            {Object.entries(metrics.serviceDistribution).map(([service, rawPercentage]) => {
              const percentage = Number(rawPercentage) || 0
              return (
                <li key={service} className="flex justify-between">
                  <span>{service}</span>
                  <span>{(percentage * 100).toFixed(1)}%</span>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="glass-card glass-outline p-5">
          <h3 className="text-sm uppercase tracking-[0.3em] text-[var(--text-soft)]">エラーディストリビューション</h3>
          <ul className="mt-4 space-y-2 text-sm text-[var(--text-muted)]">
            {Object.entries(metrics.errorDistribution).map(([category, rawPercentage]) => {
              const percentage = Number(rawPercentage) || 0
              return (
                <li key={category} className="flex justify-between">
                  <span>{category}</span>
                  <span>{(percentage * 100).toFixed(1)}%</span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      <div className="glass-card glass-outline p-5">
        <h3 className="text-sm uppercase tracking-[0.3em] text-[var(--text-soft)]">時系列トレンド</h3>
        <div className="mt-4 grid gap-4 text-sm text-[var(--text-muted)] md:grid-cols-3">
          {metrics.timeSeriesData.slice(-6).map((point) => (
            <div key={point.timestamp} className="rounded-xl border border-[rgba(148,163,184,0.18)] bg-[rgba(15,23,42,0.7)] p-3">
              <p className="text-xs text-[var(--text-muted)]">{new Date(point.timestamp).toLocaleString()}</p>
              <p className="mt-2 text-sm">
                リクエスト: <span className="font-semibold text-[var(--text-primary)]">{point.requests}</span>
              </p>
              <p className="mt-1 text-sm">
                レイテンシ: <span className="font-semibold text-[var(--text-primary)]">{point.latency.toFixed(1)} ms</span>
              </p>
              <p className="mt-1 text-sm">
                エラー: <span className="font-semibold text-[var(--text-primary)]">{point.errors}</span>
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
