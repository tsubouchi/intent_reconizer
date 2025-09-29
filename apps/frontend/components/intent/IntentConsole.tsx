'use client'

import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, PropsWithChildren } from 'react'
import { intentRouterAPI } from '@/lib/api/intent-router'
import type { IntentRequest, IntentResponse } from '@/lib/api/intent-router'
import { RoutingVisualization } from '@/components/routing/RoutingVisualization'

const SAMPLE_REQUESTS: { label: string; payload: IntentRequest }[] = [
  {
    label: 'Reset password',
    payload: {
      text: 'Customer forgot their password and needs a reset link',
      context: {
        userId: 'user-123',
        metadata: { channel: 'support' },
      },
    },
  },
  {
    label: 'Process payment',
    payload: {
      text: 'Charge credit card for premium subscription renewal',
      context: {
        userId: 'user-987',
        metadata: { amount: 149.99, currency: 'USD' },
      },
    },
  },
  {
    label: 'Generate analytics report',
    payload: {
      text: 'Create the weekly engagement metrics dashboard',
      context: {
        metadata: { timeframe: '7d' },
      },
    },
  },
]

const PIPELINE_STEPS = ['Listening', 'Chunking', 'Summarising', 'IMS', 'Policy', 'Manifest'] as const
const LIFECYCLE_STEPS = ['Design', 'Build', 'Validate', 'Deploy', 'Verify'] as const

function Spinner() {
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[rgba(255,255,255,0.35)] border-t-transparent" />
    </span>
  )
}

type StepState = {
  label: string
  status: 'pending' | 'active' | 'done'
}

function usePipelineProgress(isLoading: boolean, hasResult: boolean) {
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (!isLoading) {
      setActiveIndex(hasResult ? PIPELINE_STEPS.length : 0)
      return
    }

    setActiveIndex(0)
    const interval = setInterval(() => {
      setActiveIndex((index) => {
        if (index >= PIPELINE_STEPS.length - 1) {
          return PIPELINE_STEPS.length - 1
        }
        return index + 1
      })
    }, 750)

    return () => clearInterval(interval)
  }, [isLoading, hasResult])

  const steps: StepState[] = PIPELINE_STEPS.map((label, index) => {
    if (hasResult) {
      return { label, status: 'done' }
    }
    if (index < activeIndex) {
      return { label, status: 'done' }
    }
    if (index === activeIndex) {
      return { label, status: isLoading ? 'active' : 'pending' }
    }
    return { label, status: 'pending' }
  })

  const lifecycleSteps: StepState[] = LIFECYCLE_STEPS.map((label, index) => {
    if (hasResult) {
      return { label, status: 'done' }
    }
    if (index <= Math.min(activeIndex, LIFECYCLE_STEPS.length - 1)) {
      return { label, status: isLoading ? 'active' : 'done' }
    }
    return { label, status: 'pending' }
  })

  return { steps, lifecycleSteps }
}

type CollapsibleCardProps = PropsWithChildren<{
  title: string
  description?: string
  defaultOpen?: boolean
}>

function CollapsibleCard({ title, description, children, defaultOpen = false }: CollapsibleCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="glass-card glass-outline border border-[var(--button-border)]">
      <button
        type="button"
        onClick={() => setIsOpen((previous) => !previous)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-soft)]">{title}</p>
          {description ? (
            <p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p>
          ) : null}
        </div>
        <span className={`text-lg text-[var(--text-soft)] transition-transform ${isOpen ? 'rotate-90' : ''}`}>
          ›
        </span>
      </button>
      {isOpen ? <div className="border-t border-[rgba(255,255,255,0.18)] px-5 py-4 text-sm text-[var(--text-muted)]">{children}</div> : null}
    </div>
  )
}

type IntentConsoleProps = {
  isLoading: boolean
  error: string | null
  lastRoute: IntentResponse | null
  onSubmit: (request: IntentRequest) => Promise<void>
  onReset: () => void
}

export function IntentConsole({ isLoading, error, lastRoute, onSubmit, onReset }: IntentConsoleProps) {
  const [text, setText] = useState('')
  const [path, setPath] = useState('')
  const [method, setMethod] = useState('POST')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [isCheckingConnection, setIsCheckingConnection] = useState(false)
  const [showTimeline, setShowTimeline] = useState(false)
  const { steps, lifecycleSteps } = usePipelineProgress(isLoading, Boolean(lastRoute))

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!text.trim() && !path.trim()) {
      setLocalError('Please provide either text or a request path.')
      return
    }

    setLocalError(null)
    try {
      await onSubmit({
        text: text.trim() || undefined,
        path: path.trim() || undefined,
        method: method || undefined,
      })
    } catch (submitError) {
      console.error(submitError)
      setLocalError('Intent analysis failed. See console for details.')
    }
  }

  const handleSample = async (sample: IntentRequest) => {
    setText(sample.text ?? '')
    setPath(sample.path ?? '')
    setMethod(sample.method ?? 'POST')
    try {
      await onSubmit(sample)
    } catch (sampleError) {
      console.error(sampleError)
      setLocalError('Sample request failed. Check the router API connection.')
    }
  }

  const connectionCheck = async () => {
    setIsCheckingConnection(true)
    try {
      const alive = await intentRouterAPI.checkLiveness()
      setLocalError(alive ? null : 'Router API is unreachable. Please verify the endpoint.')
    } catch (checkError) {
      console.error(checkError)
      setLocalError('Router API is unreachable. Please verify the endpoint.')
    } finally {
      setIsCheckingConnection(false)
    }
  }

  const summary = useMemo(() => {
    if (!lastRoute) return null
    const { recognizedIntent, routing } = lastRoute
    const confidence = `${(recognizedIntent.confidence * 100).toFixed(1)}%`
    const narrative = `Detected ${recognizedIntent.category} with ${confidence} confidence.`
    const followUp = `Recommended action: route to ${routing.targetService} using ${routing.strategy} strategy.`
    return { narrative, followUp }
  }, [lastRoute])

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <header className="flex flex-col gap-2">
          <h3 className="text-sm uppercase tracking-[0.32em] text-[var(--text-soft)]">Input</h3>
          <p className="text-sm text-[var(--text-muted)]">
            Paste transcripts or structured payloads, then run analysis to classify the intent.
          </p>
        </header>

        <div className="glass-card glass-outline p-6">
          <div className="mb-4 flex flex-wrap gap-3">
            {SAMPLE_REQUESTS.map((sample) => (
              <button
                key={sample.label}
                type="button"
                onClick={() => handleSample(sample.payload)}
                className="rounded-full border border-[var(--button-border)] bg-[rgba(34,197,94,0.12)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-primary)] transition hover:border-[rgba(34,197,94,0.45)] hover:bg-[rgba(34,197,94,0.22)]"
              >
                {sample.label}
              </button>
            ))}
            <button
              type="button"
              onClick={connectionCheck}
              className="rounded-full border border-[var(--button-border)] px-4 py-2 text-xs uppercase tracking-[0.22em] text-[var(--text-soft)] transition hover:border-[rgba(34,197,94,0.45)] hover:text-[var(--text-primary)]"
              disabled={isCheckingConnection}
            >
              {isCheckingConnection ? 'Checking API...' : 'Check API connectivity'}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={12}
              className="matrix-input w-full rounded-2xl p-5 text-base leading-relaxed"
              placeholder="Describe the user request or paste transcript snippets here..."
            />

            <button
              type="button"
              onClick={() => setShowAdvanced((previous) => !previous)}
              className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
            >
              {showAdvanced ? 'Hide advanced options' : 'Show advanced options'}
            </button>

            {showAdvanced ? (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label htmlFor="intent-path" className="text-xs uppercase tracking-[0.28em] text-[var(--text-soft)]">
                    Request path
                  </label>
                  <input
                    id="intent-path"
                    value={path}
                    onChange={(event) => setPath(event.target.value)}
                    placeholder="/api/payments/charge"
                    className="matrix-input w-full rounded-xl px-3 py-2 text-sm"
                    type="text"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="intent-method" className="text-xs uppercase tracking-[0.28em] text-[var(--text-soft)]">
                    HTTP method
                  </label>
                  <select
                    id="intent-method"
                    value={method}
                    onChange={(event) => setMethod(event.target.value)}
                    className="matrix-input w-full rounded-xl px-3 py-2 text-sm"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                    <option value="PATCH">PATCH</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.28em] text-[var(--text-soft)]">Session context</label>
                  <p className="rounded-xl border border-dashed border-[rgba(255,255,255,0.18)] bg-black/30 px-3 py-3 text-xs text-[var(--text-muted)]">
                    Additional context (user IDs, metadata) can be provided via API integration.
                  </p>
                </div>
              </div>
            ) : null}

            {localError ? <p className="text-sm text-red-300">{localError}</p> : null}
            {error ? <p className="text-sm text-red-300">{error}</p> : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs uppercase tracking-[0.28em] text-[var(--text-soft)]">
                Endpoint: /intent/recognize
              </div>
              <div className="flex items-center gap-3">
                {lastRoute ? (
                <button
                  type="button"
                  onClick={() => {
                    setText('')
                    setPath('')
                    onReset()
                  }}
                  className="rounded-full border border-[var(--button-border)] px-5 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-[var(--text-muted)] transition hover:border-[rgba(34,197,94,0.45)] hover:text-[var(--text-primary)]"
                >
                  Clear session
                </button>
              ) : null}
              <button
                type="submit"
                className="rounded-full bg-[var(--accent-primary)] px-6 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-black shadow-[0_0_18px_rgba(34,197,94,0.35)] transition hover:brightness-110 hover:shadow-[0_0_22px_rgba(34,197,94,0.5)] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isLoading}
              >
                  {isLoading ? 'Analyzing...' : 'Analyze intent'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </section>

      <section className="space-y-4">
        <header className="flex flex-col gap-2">
          <h3 className="text-sm uppercase tracking-[0.32em] text-[var(--text-soft)]">Analysis</h3>
          <p className="text-sm text-[var(--text-muted)]">
            Follow the pipeline in real-time while the router processes the request.
          </p>
        </header>

        <div className="glass-card glass-outline p-6">
          <div className="flex items-center gap-3 text-sm text-[var(--text-muted)]">
            {isLoading ? <Spinner /> : null}
            <span>{isLoading ? 'Thinking...' : lastRoute ? 'Analysis complete' : 'Awaiting input'}</span>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-soft)]">Streaming pipeline</p>
              <ul className="mt-3 space-y-2">
                {steps.map((step) => (
                  <li
                    key={step.label}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm transition ${
                      step.status === 'done'
                        ? 'border-[rgba(34,197,94,0.35)] bg-[rgba(34,197,94,0.14)] text-[var(--text-primary)]'
                        : step.status === 'active'
                          ? 'border-[rgba(34,197,94,0.45)] bg-[rgba(34,197,94,0.22)] text-[var(--text-primary)] shadow-[0_0_18px_rgba(34,197,94,0.25)]'
                          : 'border-[rgba(255,255,255,0.12)] bg-[rgba(8,10,8,0.62)] text-[var(--text-muted)]'
                    }`}
                  >
                    <span>{step.label}</span>
                    <span className="text-xs uppercase tracking-[0.25em]">
                      {step.status === 'done' ? 'Done' : step.status === 'active' ? 'Active' : 'Pending'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-soft)]">Manifest lifecycle</p>
              <ul className="mt-3 space-y-2">
                {lifecycleSteps.map((step) => (
                  <li
                    key={step.label}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm transition ${
                      step.status === 'done'
                        ? 'border-[rgba(34,197,94,0.35)] bg-[rgba(34,197,94,0.14)] text-[var(--text-primary)]'
                        : step.status === 'active'
                          ? 'border-[rgba(34,197,94,0.45)] bg-[rgba(34,197,94,0.22)] text-[var(--text-primary)] shadow-[0_0_18px_rgba(34,197,94,0.25)]'
                          : 'border-[rgba(255,255,255,0.12)] bg-[rgba(8,10,8,0.62)] text-[var(--text-muted)]'
                    }`}
                  >
                    <span>{step.label}</span>
                    <span className="text-xs uppercase tracking-[0.25em]">
                      {step.status === 'done' ? 'Done' : step.status === 'active' ? 'Active' : 'Pending'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <header className="flex flex-col gap-2">
          <h3 className="text-sm uppercase tracking-[0.32em] text-[var(--text-soft)]">Result</h3>
          <p className="text-sm text-[var(--text-muted)]">
            Review the intent summary, recommended action, and supporting evidence.
          </p>
        </header>

        <div className="glass-card glass-outline space-y-6 p-6">
          {summary ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-[var(--text-primary)]">{summary.narrative}</p>
                <p className="text-sm text-[var(--text-muted)]">{summary.followUp}</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="rounded-full bg-[var(--accent-primary)] px-5 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-black shadow-[0_0_18px_rgba(34,197,94,0.35)] transition hover:brightness-110 hover:shadow-[0_0_22px_rgba(34,197,94,0.5)] disabled:opacity-60"
                  disabled
                >
                  Apply recommended action
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[var(--button-border)] px-5 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-[var(--text-muted)] transition hover:border-[rgba(34,197,94,0.45)] hover:text-[var(--text-primary)]"
                >
                  Escalate to human
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[var(--button-border)] px-5 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-[var(--text-muted)] transition hover-border-[rgba(34,197,94,0.45)] hover:text-[var(--text-primary)]"
                  onClick={() => {
                    if (!summary) return
                    navigator.clipboard.writeText(`${summary.narrative} ${summary.followUp}`).catch((clipError) => {
                     console.error('Clipboard copy failed', clipError)
                   })
                 }}
                >
                  Copy summary
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Run an analysis to see the intent summary and recommended action.</p>
          )}

          {lastRoute ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <CollapsibleCard title="Suggested follow-up" description="Checklist to assist the operator" defaultOpen>
                <ul className="list-disc space-y-2 pl-5">
                  <li>Confirm customer identity before executing downstream actions.</li>
                  <li>Trigger the billing retry playbook or hand off to finance if unavailable.</li>
                  <li>Monitor response metrics in the Analytics tab after deployment.</li>
                </ul>
              </CollapsibleCard>
              <CollapsibleCard title="Execution report" description="Manifest draft, telemetry, rollback token">
                <div className="space-y-2 text-xs text-[var(--text-muted)]">
                  <p>Processing time: {lastRoute.metadata.processingTime} ms</p>
                  <p>Cache: {lastRoute.metadata.cacheHit ? 'Hit' : 'Miss'}</p>
                  <p>Model version: {lastRoute.metadata.modelVersion}</p>
                  {lastRoute.metadata ? (
                    <p>Rollback token: {lastRoute.routing.targetService}-{lastRoute.intentId}</p>
                  ) : null}
                </div>
              </CollapsibleCard>
              <CollapsibleCard title="Model decision" description="IMS selection rationale">
                {lastRoute.recognizedIntent.mlModel ? (
                  <p className="text-sm text-[var(--text-muted)]">
                    Selected model: {lastRoute.recognizedIntent.mlModel}
                  </p>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">
                    Model details unavailable in this response.
                  </p>
                )}
              </CollapsibleCard>
              <CollapsibleCard title="Routing detail" description="Full route visualisation">
                <RoutingVisualization route={lastRoute} />
              </CollapsibleCard>
            </div>
          ) : null}
        </div>

        <div className="glass-card glass-outline p-6">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            onClick={() => setShowTimeline((previous) => !previous)}
          >
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-soft)]">Event timeline</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Expand to inspect detailed streaming logs.</p>
            </div>
            <span className={`text-lg text-[var(--text-soft)] transition-transform ${showTimeline ? 'rotate-180' : ''}`}>
              ▾
            </span>
          </button>

          <div className={`mt-4 ${showTimeline ? '' : 'hidden'}`}>
            {lastRoute ? (
              <div className="space-y-3 text-sm text-[var(--text-muted)]">
                <div className="rounded-xl border border-[rgba(255,255,255,0.16)] bg-black/40 p-4">
                  <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-soft)]">action.dispatched</p>
                  <p className="mt-1 text-xs">Target: {lastRoute.routing.targetService}</p>
                </div>
                <div className="rounded-xl border border-[rgba(255,255,255,0.16)] bg-black/40 p-4">
                  <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-soft)]">policy.decision</p>
                  <p className="mt-1 text-xs">Strategy: {lastRoute.routing.strategy}</p>
                </div>
                <div className="rounded-xl border border-[rgba(255,255,255,0.16)] bg-black/40 p-4">
                  <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-soft)]">model.selector</p>
                  <p className="mt-1 text-xs">
                    Model: {lastRoute.recognizedIntent.mlModel ?? 'unknown'}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">Timeline will appear after running an analysis.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
