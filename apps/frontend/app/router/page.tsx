'use client'

import { useEffect, useMemo, useState } from 'react'
import { IntentAnalyzer } from '@/components/intent/IntentAnalyzer'
import { IntentInput } from '@/components/intent/IntentInput'
import { RoutingVisualization } from '@/components/routing/RoutingVisualization'
import { useIntentRouter } from '@/hooks/useIntentRouter'

export default function RouterPage() {
  const { routeIntent, isLoading, lastRoute, error } = useIntentRouter()
  const [time, setTime] = useState('Syncing...')

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString())
    tick()
    const timer = setInterval(tick, 1_000)
    return () => clearInterval(timer)
  }, [])

  const insightCards = useMemo(() => {
    const confidence = lastRoute ? `${(lastRoute.recognizedIntent.confidence * 100).toFixed(1)}%` : '—'
    const targetService = lastRoute?.routing.targetService ?? 'Awaiting input'
    const latency = lastRoute ? `${lastRoute.metadata.processingTime} ms` : '—'
    const cacheState = lastRoute ? (lastRoute.metadata.cacheHit ? 'Cache hit' : 'Cache miss') : 'No request yet'

    return [
      { label: 'Latest Confidence', value: confidence, hint: 'Classification confidence for the most recent intent' },
      { label: 'Active Service', value: targetService, hint: 'Selected downstream service for the last route' },
      { label: 'Inference Latency', value: latency, hint: 'Processing time for the last analysed payload' },
      { label: 'Cache Status', value: cacheState, hint: 'Meta-routing cache feedback' },
    ]
  }, [lastRoute])

  return (
    <div className="relative">
      <span className="floating-orb" style={{ top: '12%', left: '-6%' }} />
      <span className="floating-orb secondary" style={{ bottom: '4%', right: '-4%' }} />

      <div className="container relative mx-auto px-6 pb-16 pt-12 lg:pt-16">
        <div className="neon-shell">
          <div className="neon-content space-y-10 px-6 py-8 sm:px-10 sm:py-12">
            <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.35em] text-[var(--text-soft)]">Neural Router · Meta Orchestration</p>
                <h2 className="text-3xl font-semibold leading-tight text-[var(--text-primary)] sm:text-4xl">
                  Adaptive Intent Control Centre
                </h2>
                <p className="max-w-2xl text-sm text-[var(--text-muted)]">
                  Monitor inference quality, observe downstream readiness, and iterate on routing logic from a single operational console.
                </p>
              </div>
              <div className="flex flex-col items-start gap-3 text-right sm:flex-row sm:items-center lg:flex-col lg:items-end">
                <span className="status-chip">
                  <span className="status-dot" />
                  Online · {time}
                </span>
                <div className="text-xs uppercase tracking-[0.3em] text-[var(--text-soft)]">
                  Build&nbsp;
                  <span className="text-[var(--text-primary)]">v1.0.0</span>
                </div>
              </div>
            </header>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {insightCards.map((card) => (
                <div key={card.label} className="metric-pill">
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                  <p className="text-xs text-[var(--text-muted)]">{card.hint}</p>
                  <span className="spark-bar" />
                </div>
              ))}
            </div>

            <div className="space-y-6">
              <div className="glass-card glass-outline px-8 py-8 sm:px-12 sm:py-10">
                <div className="mb-8">
                  <h3 className="text-sm uppercase tracking-[0.35em] text-[var(--text-soft)] mb-4">Intent Recognizer</h3>
                  <IntentAnalyzer />
                </div>

                <div className="border-t border-[var(--accent-primary)]/20 pt-6">
                  <h3 className="text-sm uppercase tracking-[0.35em] text-[var(--text-soft)] mb-4">Intent Router Playground</h3>
                  <IntentInput onSubmit={routeIntent} isLoading={isLoading} />
                </div>
                {error ? (
                  <div className="glass-card glass-outline border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
                    <p className="font-semibold uppercase tracking-[0.25em]">Communication Error</p>
                    <p className="mt-1 text-red-100/90">{error}</p>
                  </div>
                ) : null}
                {lastRoute ? (
                  <div className="space-y-4">
                    <h2 className="text-sm uppercase tracking-[0.35em] text-[var(--text-soft)]">Latest Route Summary</h2>
                    <RoutingVisualization route={lastRoute} />
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">
                    Submit an intent request to review the resolved destination, model confidence, and contextual factors.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
