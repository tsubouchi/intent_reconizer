'use client'

import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { useManifestRefresher } from '@/hooks/useManifestRefresher'
import type { RefreshProfile } from '@/lib/api/intent-router'

const profileOptions: { value: RefreshProfile; label: string; description: string }[] = [
  { value: 'balanced', label: 'バランス', description: 'コストと性能のバランスを維持' },
  { value: 'performance', label: 'パフォーマンス', description: 'スループットと低遅延を優先' },
  { value: 'cost', label: 'コスト', description: 'リソース使用量を最小化' },
  { value: 'compliance', label: 'コンプライアンス', description: '安全性とポリシー順守を優先' },
]

const FALLBACK_MANIFESTS = [
  'user-authentication-service',
  'payment-processing-service',
  'email-notification-service',
  'image-processing-service',
  'data-analytics-service',
  'pdf-generator-service',
  'websocket-chat-service',
  'machine-learning-inference-service',
  'scheduled-batch-processor-service',
  'api-gateway-service'
].map((service) => ({
  service,
  lastModified: new Date().toISOString(),
  source: 'filesystem' as const,
  driftScore: null,
  lastJobStatus: null,
  lastJobAt: null,
}))

export function ManifestRefreshPanel() {
  const [selectedService, setSelectedService] = useState<string>()
  const [profile, setProfile] = useState<RefreshProfile>('balanced')
  const [notes, setNotes] = useState('')
  const [autoApply, setAutoApply] = useState(false)

  const {
    summariesQuery,
    detailQuery,
    jobsQuery,
    latestJobByService,
    refreshMutation,
    approveMutation,
    rollbackMutation,
  } = useManifestRefresher(selectedService)

  const manifests = useMemo(() => {
    if (summariesQuery.data && summariesQuery.data.length > 0) {
      return summariesQuery.data
    }
    return FALLBACK_MANIFESTS
  }, [summariesQuery.data])

  useEffect(() => {
    if (!selectedService && manifests.length > 0) {
      setSelectedService(manifests[0].service)
    }
  }, [selectedService, manifests])

  const selectedJob = useMemo(() => {
    if (!selectedService) return null
    return latestJobByService.get(selectedService) ?? null
  }, [latestJobByService, selectedService])

  const handleRefresh = () => {
    if (!selectedService) return
    refreshMutation.mutate({
      service: selectedService,
      profile,
      notes: notes.trim() || undefined,
      autoApply,
    })
  }

  const handleApprove = () => {
    if (selectedJob) {
      approveMutation.mutate(selectedJob.id)
    }
  }

  const handleRollback = () => {
    if (selectedJob) {
      rollbackMutation.mutate(selectedJob.id)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,280px)_1fr]">
      <section className="glass-card glass-outline space-y-5 p-5">
        <header>
          <h2 className="text-sm uppercase tracking-[0.3em] text-[var(--text-soft)]">マニフェスト一覧</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            監視対象サービスの差分スコアと最新リフレッシュ状況を確認できます。
          </p>
          {(!summariesQuery.data || summariesQuery.data.length === 0) && !summariesQuery.isLoading ? (
            <p className="mt-2 text-xs uppercase tracking-[0.3em] text-[var(--text-soft)]">
              バックエンドが未接続のためサンプルリストを表示しています。
            </p>
          ) : null}
        </header>

        <div className="space-y-2">
          {summariesQuery.isLoading && <p className="text-sm text-[var(--text-muted)]">読み込み中...</p>}
          {summariesQuery.error && (
            <p className="text-sm text-red-300">マニフェストの取得に失敗しました。バックエンドを確認してください。</p>
          )}

          {manifests.map((summary) => {
            const isActive = summary.service === selectedService
            const driftPercentage = summary.driftScore != null ? Math.round(summary.driftScore * 100) : null
            const lastStatus = summary.lastJobStatus ?? '未実行'

            return (
              <button
                key={summary.service}
                onClick={() => setSelectedService(summary.service)}
                className={clsx(
                  'flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition',
                  isActive
                    ? 'border-[rgba(56,189,248,0.45)] bg-[rgba(56,189,248,0.12)] text-[var(--text-primary)] shadow-lg'
                    : 'border-[rgba(148,163,184,0.18)] bg-[rgba(13,23,42,0.65)] text-[var(--text-primary)] hover:border-[rgba(236,72,153,0.38)] hover:bg-[rgba(236,72,153,0.12)]'
                )}
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{summary.service}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    最終更新: {new Date(summary.lastModified).toLocaleString()} / 状況: {lastStatus}
                  </p>
                  {driftPercentage !== null && (
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <span className="text-[var(--text-muted)]">ドリフト:</span>
                      <span
                        className={clsx(
                          driftPercentage >= 70
                            ? 'text-red-400'
                            : driftPercentage >= 40
                              ? 'text-yellow-300'
                              : 'text-emerald-300'
                        )}
                      >
                        {driftPercentage}%
                      </span>
                    </div>
                  )}
                </div>
                <span aria-hidden="true" className="text-lg text-[var(--text-soft)]">›</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="space-y-6">
        <header className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm uppercase tracking-[0.3em] text-[var(--text-soft)]">リフレッシュ操作</h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              選択中のサービスに対してマニフェストの最適化案を生成し、差分を確認できます。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={profile}
              onChange={(event) => setProfile(event.target.value as RefreshProfile)}
              className="matrix-input rounded-full border border-[rgba(148,163,184,0.25)] bg-[rgba(13,23,42,0.72)] px-3 py-2 text-xs uppercase tracking-[0.2em]"
            >
              {profileOptions.map((option) => (
                <option key={option.value} value={option.value} title={option.description}>
                  {option.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
              <input
                type="checkbox"
                checked={autoApply}
                onChange={(event) => setAutoApply(event.target.checked)}
                className="h-4 w-4"
              />
              低リスク時は自動適用
            </label>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={!selectedService || refreshMutation.isPending}
              className="rounded-full bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-500 px-5 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-slate-950 shadow-lg transition hover:shadow-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshMutation.isPending ? '生成中...' : 'リフレッシュ実行'}
            </button>
          </div>
          {refreshMutation.error ? (
            <p className="text-xs text-red-300">{refreshMutation.error}</p>
          ) : null}
        </header>

        <div className="glass-card glass-outline space-y-5 p-5">
          {detailQuery.isLoading && <p className="text-sm text-gray-500">詳細を読み込み中...</p>}
          {detailQuery.error && <p className="text-sm text-red-500">詳細の取得に失敗しました。</p>}

          {detailQuery.data && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xs uppercase tracking-[0.3em] text-[var(--text-soft)]">メタ情報</h3>
                <dl className="mt-3 grid gap-3 text-sm text-[var(--text-muted)] md:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase tracking-[0.3em] text-[var(--text-soft)]">サービス</dt>
                    <dd className="text-[var(--text-primary)]">{detailQuery.data.name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-[0.3em] text-[var(--text-soft)]">最終更新</dt>
                    <dd className="text-[var(--text-primary)]">{new Date(detailQuery.data.lastModified).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-[0.3em] text-[var(--text-soft)]">ソース</dt>
                    <dd className="text-[var(--text-primary)]">{detailQuery.data.source}</dd>
                  </div>
                </dl>
              </div>

              {selectedJob && (
                <div className="rounded-2xl border border-dashed border-[rgba(148,163,184,0.25)] bg-[rgba(13,23,42,0.6)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        最新ジョブ: {selectedJob.status}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        更新時刻 {new Date(selectedJob.updatedAt).toLocaleString()} / ドリフトスコア{' '}
                        {selectedJob.driftScore != null ? `${Math.round(selectedJob.driftScore * 100)}%` : '—'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleApprove}
                        disabled={selectedJob.status !== 'AWAITING_APPROVAL' || approveMutation.isPending}
                        className="rounded-full border border-emerald-400 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:border-emerald-200 disabled:text-emerald-200/60"
                      >
                        {approveMutation.isPending ? '適用中...' : '適用'}
                      </button>
                      <button
                        type="button"
                        onClick={handleRollback}
                        disabled={rollbackMutation.isPending}
                        className="rounded-full border border-red-400 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-red-200 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:border-red-200 disabled:text-red-200/60"
                      >
                        {rollbackMutation.isPending ? '処理中...' : 'ロールバック'}
                      </button>
                    </div>
                  </div>

                  {selectedJob.telemetry && (
                    <div className="mt-3 grid gap-3 text-xs text-[var(--text-muted)] md:grid-cols-3">
                      <p>CPU利用率: {(selectedJob.telemetry.cpuUtilization * 100).toFixed(0)}%</p>
                      <p>メモリ利用率: {(selectedJob.telemetry.memoryUtilization * 100).toFixed(0)}%</p>
                      <p>p95レイテンシ: {selectedJob.telemetry.p95LatencyMs} ms</p>
                      <p>エラー率: {(selectedJob.telemetry.errorRate * 100).toFixed(2)}%</p>
                      <p>RPM: {selectedJob.telemetry.requestsPerMinute}</p>
                      <p>コスト/100万リクエスト: ¥{selectedJob.telemetry.costPerMillionRequests.toFixed(2)}</p>
                    </div>
                  )}

                  {selectedJob.diffSummary && selectedJob.diffSummary.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-soft)]">差分サマリー</p>
                      <ul className="space-y-1 text-xs text-[var(--text-muted)]">
                        {selectedJob.diffSummary.map((change) => (
                          <li key={change.path} className="rounded-xl border border-[rgba(148,163,184,0.18)] bg-[rgba(15,23,42,0.7)] p-3">
                            <p className="font-medium text-[var(--text-primary)]">{change.path}</p>
                            <p>変更理由: {change.rationale}</p>
                            <p>
                              {String(change.before)} → {String(change.after)} ({change.impact})
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="mb-2 block text-xs uppercase tracking-[0.3em] text-[var(--text-soft)]" htmlFor="refresh-notes">
                  メモ
                </label>
                <textarea
                  id="refresh-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={2}
                  placeholder="目的や補足事項を記載"
                  className="matrix-input mt-1 w-full rounded-2xl border border-[rgba(148,163,184,0.25)] bg-[rgba(13,23,42,0.75)] p-3 text-sm"
                />
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-soft)]">マニフェスト内容</p>
                <pre className="mt-3 max-h-80 overflow-auto rounded-2xl border border-[rgba(148,163,184,0.18)] bg-[rgba(10,16,32,0.85)] p-4 text-xs text-[var(--text-primary)]">
                  {JSON.stringify(detailQuery.data.manifest, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        <div className="glass-card glass-outline p-5">
          <h3 className="text-xs uppercase tracking-[0.3em] text-[var(--text-soft)]">実行履歴</h3>
          {jobsQuery.isLoading && <p className="text-sm text-[var(--text-muted)]">履歴を読み込み中...</p>}
          {jobsQuery.data && jobsQuery.data.length === 0 && (
            <p className="text-sm text-[var(--text-muted)]">まだ実行履歴はありません。</p>
          )}
          {jobsQuery.data && jobsQuery.data.length > 0 && (
            <div className="mt-3 max-h-64 overflow-auto table-glow">
              <table className="text-left text-xs text-[var(--text-muted)]">
                <thead>
                  <tr>
                    <th className="px-2 py-1">サービス</th>
                    <th className="px-2 py-1">ステータス</th>
                    <th className="px-2 py-1">プロフィール</th>
                    <th className="px-2 py-1">ドリフト</th>
                    <th className="px-2 py-1">更新日時</th>
                  </tr>
                </thead>
                <tbody>
                  {jobsQuery.data.map((job) => (
                    <tr key={job.id}>
                      <td className="px-2 py-1 text-[var(--text-primary)]">{job.service}</td>
                      <td className="px-2 py-1">{job.status}</td>
                      <td className="px-2 py-1">{job.profile}</td>
                      <td className="px-2 py-1">
                        {job.driftScore != null ? `${Math.round(job.driftScore * 100)}%` : '—'}
                      </td>
                      <td className="px-2 py-1">{new Date(job.updatedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
