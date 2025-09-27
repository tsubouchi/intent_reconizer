'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import type { IntentRequest } from '@/lib/api/intent-router'

type IntentInputProps = {
  onSubmit: (request: IntentRequest) => Promise<void> | void
  isLoading?: boolean
}

const SAMPLE_REQUESTS: { label: string; payload: IntentRequest }[] = [
  {
    label: 'Reset user password',
    payload: {
      text: 'User forgot their password and needs a reset link',
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
      text: 'Create weekly engagement metrics dashboard',
      context: {
        metadata: { timeframe: '7d' },
      },
    },
  },
]

export function IntentInput({ onSubmit, isLoading }: IntentInputProps) {
  const [text, setText] = useState('')
  const [path, setPath] = useState('')
  const [method, setMethod] = useState('POST')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!text.trim() && !path.trim()) {
      setError('テキストまたはパスを入力してください。')
      return
    }

    setError(null)

    try {
      await onSubmit({
        text: text.trim() || undefined,
        path: path.trim() || undefined,
        method: method || undefined,
      })
    } catch (submitError) {
      console.error(submitError)
      setError('ルーティングのリクエストに失敗しました。')
    }
  }

  const handleSample = async (sample: IntentRequest) => {
    setText(sample.text ?? '')
    setPath(sample.path ?? '')
    setMethod(sample.method ?? 'POST')

    try {
      await onSubmit(sample)
    } catch (submitError) {
      console.error(submitError)
      setError('サンプルリクエストの送信に失敗しました。')
    }
  }

  return (
    <div className="space-y-6">
      <div className="mb-2 flex flex-wrap gap-3">
        {SAMPLE_REQUESTS.map((sample) => (
          <button
            key={sample.label}
            type="button"
            onClick={() => handleSample(sample.payload)}
            className="rounded-full border border-[rgba(56,189,248,0.35)] bg-[rgba(56,189,248,0.12)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-primary)] transition hover:border-[rgba(236,72,153,0.4)] hover:bg-[rgba(236,72,153,0.14)]"
          >
            {sample.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="intent-text" className="text-xs uppercase tracking-[0.3em] text-[var(--text-soft)]">
            インテントの説明
          </label>
          <textarea
            id="intent-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={6}
            className="matrix-input mt-1 min-h-[180px] w-full rounded-2xl border border-[rgba(148,163,184,0.25)] bg-[rgba(13,23,42,0.78)] p-5 text-base leading-relaxed resize-y"
            style={{ width: '100%', maxWidth: '100%' }}
            placeholder="例: ユーザーがプレミアムプランの支払いを行いたい"
          />
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced((previous) => !previous)}
          className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
        >
          {showAdvanced ? '入力項目を隠す' : '詳細設定を表示'}
        </button>

        {showAdvanced && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="intent-path" className="text-xs uppercase tracking-[0.3em] text-[var(--text-soft)]">
                リクエストパス
              </label>
              <input
                id="intent-path"
                type="text"
                value={path}
                onChange={(event) => setPath(event.target.value)}
                className="matrix-input mt-1 w-full rounded-2xl border border-[rgba(148,163,184,0.25)] bg-[rgba(13,23,42,0.78)] p-3 text-sm"
                placeholder="例: /api/payments/charge"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="intent-method" className="text-xs uppercase tracking-[0.3em] text-[var(--text-soft)]">
                HTTPメソッド
              </label>
              <select
                id="intent-method"
                value={method}
                onChange={(event) => setMethod(event.target.value)}
                className="matrix-input mt-1 w-full rounded-2xl border border-[rgba(148,163,184,0.25)] bg-[rgba(13,23,42,0.78)] p-3 text-sm"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
                <option value="PATCH">PATCH</option>
              </select>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-300">{error}</p>}

        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.25em] text-[var(--text-soft)]">Endpoint: /intent/recognize</p>
          <button
            type="submit"
            className="rounded-full bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-500 px-6 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-slate-950 shadow-lg transition hover:shadow-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading}
          >
            {isLoading ? '解析中…' : 'インテント解析'}
          </button>
        </div>
      </form>
    </div>
  )
}
