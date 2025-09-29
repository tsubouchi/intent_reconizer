'use client'

import { useState } from 'react'

type IntentAnalysis = {
  intent: string
  confidence: number
  entities: Record<string, unknown>
  suggestedAction: string
}

export function IntentAnalyzer() {
  const [input, setInput] = useState('')
  const [analysis, setAnalysis] = useState<IntentAnalysis | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const analyzeIntent = async () => {
    if (!input.trim()) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Failed to analyze intent')
      }

      const data = (await response.json()) as IntentAnalysis
      setAnalysis(data)
    } catch (caughtError) {
      console.error('Error analyzing intent:', caughtError)
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to analyze intent')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs uppercase tracking-[0.3em] text-[var(--text-soft)]">
          Intent Recognition Testing
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && analyzeIntent()}
            placeholder="Enter your message to analyze intent..."
            className="flex-1 rounded-lg border border-[var(--button-border)] bg-black/40 px-4 py-2 text-sm text-[var(--text-primary)] placeholder-gray-500 backdrop-blur-sm focus:border-[rgba(34,197,94,0.45)] focus:outline-none"
          />
          <button
            type="button"
            onClick={analyzeIntent}
            disabled={isLoading}
            className="rounded-lg bg-[var(--accent-primary)] px-6 py-2 text-sm font-medium text-black shadow-[0_0_18px_rgba(34,197,94,0.35)] transition hover:brightness-110 hover:shadow-[0_0_22px_rgba(34,197,94,0.5)] disabled:opacity-50"
          >
            {isLoading ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {analysis ? (
        <div className="glass-card glass-outline space-y-3 p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-soft)]">Intent</p>
              <p className="text-lg font-semibold text-[var(--text-primary)]">{analysis.intent}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-soft)]">Confidence</p>
              <p className="text-lg font-semibold text-[var(--text-primary)]">
                {(analysis.confidence * 100).toFixed(1)}%
              </p>
            </div>
          </div>

          {Object.keys(analysis.entities).length > 0 ? (
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--text-soft)]">Entities</p>
              <div className="space-y-1">
                {Object.entries(analysis.entities).map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <span className="text-xs text-[var(--text-muted)]">{key}:</span>
                    <span className="text-xs text-[var(--text-primary)]">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {analysis.suggestedAction ? (
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-soft)] mb-1">Suggested Action</p>
              <p className="text-sm text-[var(--text-primary)]">{analysis.suggestedAction}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
