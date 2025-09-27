'use client'

import { useState } from 'react'

interface IntentAnalysis {
  intent: string
  confidence: number
  entities: {
    subject?: string
    action?: string
    parameters?: any
  }
  suggestedAction: string
}

export function IntentAnalyzer() {
  const [input, setInput] = useState('')
  const [analysis, setAnalysis] = useState<IntentAnalysis | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const analyzeIntent = async () => {
    if (!input.trim()) return

    setIsLoading(true)
    try {
      const response = await fetch('/api/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input })
      })

      if (!response.ok) throw new Error('Failed to analyze intent')

      const data = await response.json()
      setAnalysis(data)
    } catch (error) {
      console.error('Error analyzing intent:', error)
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
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && analyzeIntent()}
            placeholder="Enter your message to analyze intent..."
            className="flex-1 rounded-lg border border-[var(--accent-blue)]/20 bg-black/40 px-4 py-2 text-sm text-white placeholder-gray-500 backdrop-blur-sm focus:border-[var(--accent-blue)] focus:outline-none"
          />
          <button
            onClick={analyzeIntent}
            disabled={isLoading}
            className="rounded-lg bg-[var(--accent-blue)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--accent-blue)]/90 disabled:opacity-50"
          >
            {isLoading ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
      </div>

      {analysis && (
        <div className="glass-card glass-outline p-4 space-y-3">
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

          {Object.keys(analysis.entities).length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-soft)] mb-2">Entities</p>
              <div className="space-y-1">
                {Object.entries(analysis.entities).map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <span className="text-xs text-[var(--text-muted)]">{key}:</span>
                    <span className="text-xs text-[var(--text-primary)]">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {analysis.suggestedAction && (
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-soft)] mb-1">Suggested Action</p>
              <p className="text-sm text-[var(--text-primary)]">{analysis.suggestedAction}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}