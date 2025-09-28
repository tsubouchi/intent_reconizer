import path from 'path'

const distRoot = path.resolve(__dirname)

const repoRoot = path.resolve(distRoot, '..', '..', '..')

export const routerConfig = {
  repoRoot,
  manifestDirectory: process.env.MANIFEST_DIR || path.resolve(repoRoot, 'manifests'),
  configDirectory: process.env.CONFIG_DIR || path.resolve(repoRoot, 'manifests', 'config'),
  manifestHistoryDirectory:
    process.env.MANIFEST_HISTORY_DIR || path.resolve(repoRoot, 'manifests', 'history'),
  telemetryCacheTtlMs: Number(process.env.TELEMETRY_CACHE_TTL_MS || 5 * 60 * 1000),
  defaultConfidenceThreshold: Number(process.env.CONFIDENCE_THRESHOLD || 0.7),
  refresher: {
    defaultProfile: process.env.MANIFEST_REFRESH_PROFILE || 'balanced',
    autoApplyLowRisk: process.env.AUTO_APPLY_LOW_RISK === 'true',
    driftWarningThreshold: Number(process.env.DRIFT_WARNING_THRESHOLD || 0.4),
    driftCriticalThreshold: Number(process.env.DRIFT_CRITICAL_THRESHOLD || 0.7)
  }
} as const

export type RouterConfig = typeof routerConfig
