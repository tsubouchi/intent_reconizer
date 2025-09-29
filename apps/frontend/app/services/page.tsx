'use client'

import { useEffect, useState } from 'react'
import { ServiceHealth } from '@/components/monitoring/ServiceHealth'

export default function ServicesPage() {
  const [time, setTime] = useState('Syncing...')

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString())
    tick()
    const timer = setInterval(tick, 1_000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="relative">
      <span className="floating-orb" style={{ top: '10%', left: '-8%' }} />
      <span className="floating-orb secondary" style={{ bottom: '6%', right: '-6%' }} />

      <div className="container relative mx-auto px-6 pb-16 pt-12 lg:pt-16">
        <div className="neon-shell">
          <div className="neon-content space-y-10 px-6 py-8 sm:px-10 sm:py-12">
            <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.35em] text-[var(--text-soft)]">Observability · Service Reliability</p>
                <h2 className="text-3xl font-semibold leading-tight text-[var(--text-primary)] sm:text-4xl">
                  Distributed Service Health
                </h2>
                <p className="max-w-2xl text-sm text-[var(--text-muted)]">
                  Review live heartbeat data, error budgets, and saturation signals reported by the router. Integrate Prometheus or Cloud Monitoring to replace the placeholders with production telemetry.
                </p>
              </div>
              <div className="flex flex-col items-start gap-3 text-right sm:flex-row sm:items-center lg:flex-col lg:items-end">
                <span className="status-chip">
                  <span className="status-dot" />
                  Snapshot · {time}
                </span>
                <div className="text-xs uppercase tracking-[0.3em] text-[var(--text-soft)]">
                  Health Feed
                </div>
              </div>
            </header>

            <div className="glass-card glass-outline px-8 py-8 sm:px-10 sm:py-10">
              <p className="text-sm text-[var(--text-muted)]">
                The intent router polls connected services every 30 seconds. Replace the demo data sources with your own liveness checks to surface end-to-end readiness from this view.
              </p>
              <div className="mt-6">
                <ServiceHealth />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
