'use client'

import type { IntentResponse } from '@/lib/api/intent-router'

type RoutingVisualizationProps = {
  route: IntentResponse
}

export function RoutingVisualization({ route }: RoutingVisualizationProps) {
  const { intentId, recognizedIntent, routing, metadata, contextualFactors } = route

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="glass-card glass-outline space-y-4 p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-soft)]">Recognized Intent</p>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Intent ID: {intentId}</h3>
        </div>
        <dl className="space-y-2 text-sm text-[var(--text-muted)]">
          <div className="flex justify-between">
            <dt className="uppercase tracking-[0.25em] text-[var(--text-soft)]">Category</dt>
            <dd className="font-medium text-[var(--text-primary)]">{recognizedIntent.category}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="uppercase tracking-[0.25em] text-[var(--text-soft)]">Confidence</dt>
            <dd className="text-[var(--text-primary)]">{(recognizedIntent.confidence * 100).toFixed(1)}%</dd>
          </div>
          {recognizedIntent.keywords?.length ? (
            <div>
              <dt className="uppercase tracking-[0.25em] text-[var(--text-soft)]">Keywords</dt>
              <dd className="mt-2 flex flex-wrap gap-2">
                {recognizedIntent.keywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="rounded-full border border-[rgba(34,197,94,0.32)] bg-[rgba(34,197,94,0.18)] px-2 py-1 text-xs font-medium text-[var(--text-primary)]"
                  >
                    {keyword}
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
          {recognizedIntent.mlModel ? (
            <div className="flex justify-between">
              <dt className="uppercase tracking-[0.25em] text-[var(--text-soft)]">Model</dt>
              <dd className="text-[var(--text-primary)]">{recognizedIntent.mlModel}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="glass-card glass-outline space-y-4 p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-soft)]">Routing Outcome</p>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">{routing.targetService}</h3>
        </div>
        <dl className="space-y-2 text-sm text-[var(--text-muted)]">
          <div className="flex justify-between">
            <dt className="uppercase tracking-[0.25em] text-[var(--text-soft)]">Target Service</dt>
            <dd className="font-medium text-[var(--text-primary)]">{routing.targetService}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="uppercase tracking-[0.25em] text-[var(--text-soft)]">Timeout</dt>
            <dd className="text-[var(--text-primary)]">{routing.timeout} ms</dd>
          </div>
          <div className="flex justify-between">
            <dt className="uppercase tracking-[0.25em] text-[var(--text-soft)]">Priority</dt>
            <dd className="text-[var(--text-primary)]">{routing.priority}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="uppercase tracking-[0.25em] text-[var(--text-soft)]">Strategy</dt>
            <dd className="text-[var(--text-primary)]">{routing.strategy}</dd>
          </div>
        </dl>

        <h4 className="mt-5 text-xs uppercase tracking-[0.3em] text-[var(--text-soft)]">Metadata</h4>
        <dl className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
          <div className="flex justify-between">
            <dt>Processing Time</dt>
            <dd>{metadata.processingTime} ms</dd>
          </div>
          <div className="flex justify-between">
            <dt>Cache Hit</dt>
            <dd>{metadata.cacheHit ? 'Yes' : 'No'}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Model Version</dt>
            <dd>{metadata.modelVersion}</dd>
          </div>
        </dl>

        {contextualFactors ? (
          <div className="mt-4">
            <h4 className="text-xs uppercase tracking-[0.3em] text-[var(--text-soft)]">Contextual Factors</h4>
            <ul className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
              {Object.entries(contextualFactors).map(([factor, value]) => (
                <li key={factor} className="flex justify-between capitalize">
                  <span>{factor.replace(/([A-Z])/g, ' $1')}</span>
                  <span>{(value * 100).toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  )
}
