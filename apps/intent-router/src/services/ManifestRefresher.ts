import { v4 as uuidv4 } from 'uuid'
import { manifestRepository, ManifestRecord } from './ManifestRepository'
import { telemetryService, TelemetrySnapshot } from './TelemetryService'
import { routerConfig } from '../config'

export interface ManifestChange {
  path: string
  before: unknown
  after: unknown
  rationale: string
  impact: 'increase' | 'decrease' | 'change'
}

export type RefreshStatus =
  | 'PENDING'
  | 'GENERATING'
  | 'AWAITING_APPROVAL'
  | 'APPLIED'
  | 'FAILED'

type RefreshProfile = NonNullable<RefreshOptions['profile']>

const PROFILE_FALLBACK: RefreshProfile = 'balanced'
const PROFILE_VALUES: RefreshProfile[] = ['balanced', 'performance', 'cost', 'compliance']

export interface ManifestRefreshJob {
  id: string
  service: string
  status: RefreshStatus
  profile: RefreshProfile
  createdAt: string
  updatedAt: string
  notes?: string
  telemetry?: TelemetrySnapshot
  driftScore?: number
  riskLevel?: 'low' | 'medium' | 'high'
  confidence?: number
  diffSummary?: ManifestChange[]
  manifestPreview?: any
  manifestPath?: string
  error?: string
}

interface RefreshOptions {
  profile?: 'performance' | 'cost' | 'balanced' | 'compliance'
  notes?: string
  autoApply?: boolean
}

export class ManifestRefresherService {
  private jobs = new Map<string, ManifestRefreshJob>()

  constructor(private logger: any) {}

  async listJobs(): Promise<ManifestRefreshJob[]> {
    return Array.from(this.jobs.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async listManifests(): Promise<ManifestRecord[]> {
    return manifestRepository.listManifests()
  }

  async getManifest(service: string): Promise<ManifestRecord | undefined> {
    return manifestRepository.getManifest(service)
  }

  async triggerRefresh(service: string, options: RefreshOptions = {}): Promise<ManifestRefreshJob> {
    const manifestRecord = await manifestRepository.getManifest(service)

    if (!manifestRecord) {
      throw new Error(`Manifest for service ${service} not found`)
    }

    const jobId = uuidv4()
    const createdAt = new Date().toISOString()
    const profile = this.resolveProfile(options.profile)

    const job: ManifestRefreshJob = {
      id: jobId,
      service,
      status: 'GENERATING',
      profile,
      createdAt,
      updatedAt: createdAt,
      notes: options.notes
    }

    this.jobs.set(jobId, job)

    try {
      const telemetry = telemetryService.getSnapshot(service)
      const { updatedManifest, changes, driftScore, riskLevel, confidence } = this.enrichManifest(
        manifestRecord.manifest,
        telemetry,
        job.profile
      )

      job.telemetry = telemetry
      job.driftScore = driftScore
      job.riskLevel = riskLevel
      job.confidence = confidence
      job.diffSummary = changes
      job.manifestPreview = updatedManifest
      job.status = options.autoApply && riskLevel === 'low' ? 'APPLIED' : 'AWAITING_APPROVAL'
      job.updatedAt = new Date().toISOString()

      if (options.autoApply && riskLevel === 'low') {
        job.manifestPath = await manifestRepository.saveRevision(service, updatedManifest, {
          jobId,
          generatedAt: job.updatedAt,
          generatedBy: 'manifest-refresher',
          confidence,
          profile: job.profile,
          notes: options.notes
        })
      }
    } catch (error) {
      this.logger.error({ error, service }, 'Failed to refresh manifest')
      job.status = 'FAILED'
      job.error = error instanceof Error ? error.message : 'Unknown error'
      job.updatedAt = new Date().toISOString()
    }

    this.jobs.set(jobId, job)
    return job
  }

  async approve(jobId: string): Promise<ManifestRefreshJob> {
    const job = this.jobs.get(jobId)
    if (!job) {
      throw new Error('Job not found')
    }

    if (!job.manifestPreview) {
      throw new Error('No manifest preview available for this job')
    }

    const appliedAt = new Date().toISOString()
    job.manifestPath = await manifestRepository.saveRevision(job.service, job.manifestPreview, {
      jobId,
      generatedAt: appliedAt,
      generatedBy: 'manifest-refresher',
      confidence: job.confidence ?? 0.75,
      profile: job.profile,
      notes: job.notes
    })

    job.status = 'APPLIED'
    job.updatedAt = appliedAt
    this.jobs.set(jobId, job)
    return job
  }

  async rollback(jobId: string): Promise<ManifestRefreshJob> {
    const job = this.jobs.get(jobId)
    if (!job) {
      throw new Error('Job not found')
    }

    job.status = 'FAILED'
    job.updatedAt = new Date().toISOString()
    job.error = 'Rollback requested (not implemented)'
    this.jobs.set(jobId, job)
    return job
  }

  private enrichManifest(
    manifest: any,
    telemetry: TelemetrySnapshot,
    profile: RefreshOptions['profile']
  ) {
    const updatedManifest = JSON.parse(JSON.stringify(manifest))
    const changes: ManifestChange[] = []

    const annotations =
      updatedManifest?.spec?.template?.metadata?.annotations ?? (updatedManifest.spec.template.metadata.annotations = {})
    const container = updatedManifest?.spec?.template?.spec?.containers?.[0]

    if (container) {
      this.applyScalingAdjustments(annotations, telemetry, profile, changes)
      this.applyResourceAdjustments(container, telemetry, profile, changes)
      this.applyProbeHardening(container, telemetry, changes)
    }

    const driftScore = this.calculateDriftScore(telemetry)
    let riskLevel: ManifestRefreshJob['riskLevel'] = 'low'
    if (driftScore >= routerConfig.refresher.driftCriticalThreshold) {
      riskLevel = 'high'
    } else if (driftScore >= routerConfig.refresher.driftWarningThreshold) {
      riskLevel = 'medium'
    }

    const confidence = Math.max(0.5, 1 - telemetry.errorRate * 4)

    return {
      updatedManifest,
      changes,
      driftScore,
      riskLevel,
      confidence
    }
  }

  private applyScalingAdjustments(
    annotations: Record<string, string>,
    telemetry: TelemetrySnapshot,
    profile: RefreshOptions['profile'],
    changes: ManifestChange[]
  ) {
    const currentMin = Number(annotations['autoscaling.knative.dev/minScale'] || '1')
    const currentMax = Number(annotations['autoscaling.knative.dev/maxScale'] || currentMin * 5)

    let proposedMin = currentMin
    let proposedMax = currentMax

    if (telemetry.cpuUtilization > 0.75 || telemetry.p95LatencyMs > 600) {
      proposedMax = Math.ceil(currentMax * 1.3)
      changes.push({
        path: 'spec.template.metadata.annotations.autoscaling.knative.dev/maxScale',
        before: String(currentMax),
        after: String(proposedMax),
        rationale: 'High CPU or latency observed; increasing capacity ensures headroom.',
        impact: 'increase'
      })
    }

    if (telemetry.cpuUtilization < 0.35 && telemetry.requestsPerMinute < 120) {
      proposedMin = Math.max(1, Math.floor(currentMin * 0.7))
      changes.push({
        path: 'spec.template.metadata.annotations.autoscaling.knative.dev/minScale',
        before: String(currentMin),
        after: String(proposedMin),
        rationale: 'Sustained low utilization; scale-to-zero closer to reduce idle cost.',
        impact: 'decrease'
      })
    }

    if (profile === 'performance') {
      proposedMin = Math.max(proposedMin, currentMin + 1)
      changes.push({
        path: 'spec.template.metadata.annotations.autoscaling.knative.dev/minScale',
        before: String(currentMin),
        after: String(proposedMin),
        rationale: 'Performance profile selected; raising minimum replicas improves cold-start latency.',
        impact: 'increase'
      })
    }

    annotations['autoscaling.knative.dev/minScale'] = String(proposedMin)
    annotations['autoscaling.knative.dev/maxScale'] = String(proposedMax)
  }

  private applyResourceAdjustments(
    container: any,
    telemetry: TelemetrySnapshot,
    profile: RefreshOptions['profile'],
    changes: ManifestChange[]
  ) {
    const limits = container.resources?.limits ?? (container.resources = { limits: {}, requests: {} }).limits
    const requests = container.resources?.requests ?? (container.resources.requests = {})

    const currentCpuLimit = Number(limits.cpu || 1)
    const currentMemLimit = this.parseMemory(limits.memory || '512Mi')

    if (telemetry.cpuUtilization > 0.8) {
      const newCpuLimit = Number((currentCpuLimit * 1.2).toFixed(2))
      changes.push({
        path: 'spec.template.spec.containers[0].resources.limits.cpu',
        before: String(limits.cpu),
        after: String(newCpuLimit),
        rationale: 'CPU saturation observed; increasing limit to avoid throttling.',
        impact: 'increase'
      })
      limits.cpu = String(newCpuLimit)
      requests.cpu = String(Math.max(newCpuLimit * 0.6, Number(requests.cpu || currentCpuLimit * 0.5)).toFixed(2))
    }

    if (telemetry.memoryUtilization > 0.75) {
      const newMemory = `${Math.round((currentMemLimit * 1.25) / 256) * 256}Mi`
      changes.push({
        path: 'spec.template.spec.containers[0].resources.limits.memory',
        before: limits.memory,
        after: newMemory,
        rationale: 'High memory usage; expanding limit keeps pod stable under peak.',
        impact: 'increase'
      })
      limits.memory = newMemory
      requests.memory = `${Math.round((this.parseMemory(requests.memory || '256Mi') * 1.15) / 128) * 128}Mi`
    }

    if (profile === 'cost' && telemetry.cpuUtilization < 0.45) {
      const newCpuLimit = Math.max(0.5, Number((currentCpuLimit * 0.8).toFixed(2)))
      changes.push({
        path: 'spec.template.spec.containers[0].resources.limits.cpu',
        before: String(limits.cpu),
        after: String(newCpuLimit),
        rationale: 'Cost profile and low CPU usage; lowering limit to reduce spend.',
        impact: 'decrease'
      })
      limits.cpu = String(newCpuLimit)
    }
  }

  private applyProbeHardening(container: any, telemetry: TelemetrySnapshot, changes: ManifestChange[]) {
    if (telemetry.errorRate > 0.04) {
      if (!container.readinessProbe) {
        container.readinessProbe = {
          httpGet: { path: '/ready', port: 8080 },
          initialDelaySeconds: 5,
          periodSeconds: 5
        }
        changes.push({
          path: 'spec.template.spec.containers[0].readinessProbe',
          before: null,
          after: container.readinessProbe,
          rationale: 'Elevated error rate; adding readiness probe to prevent bad revisions serving traffic.',
          impact: 'change'
        })
      }
      if (!container.livenessProbe) {
        container.livenessProbe = {
          httpGet: { path: '/health', port: 8080 },
          initialDelaySeconds: 10,
          periodSeconds: 10
        }
        changes.push({
          path: 'spec.template.spec.containers[0].livenessProbe',
          before: null,
          after: container.livenessProbe,
          rationale: 'Elevated error rate; adding liveness probe for self-healing.',
          impact: 'change'
        })
      }
    }
  }

  private calculateDriftScore(telemetry: TelemetrySnapshot): number {
    const cpuComponent = Math.max(0, telemetry.cpuUtilization - 0.6)
    const latencyComponent = Math.max(0, telemetry.p95LatencyMs / 1000 - 0.5)
    const errorComponent = telemetry.errorRate * 2
    const drift = cpuComponent * 0.4 + latencyComponent * 0.3 + errorComponent * 0.3
    return Math.min(1, Number(drift.toFixed(2)))
  }

  private resolveProfile(input?: RefreshOptions['profile']): RefreshProfile {
    if (input && PROFILE_VALUES.includes(input)) {
      return input
    }

    const envProfile = routerConfig.refresher.defaultProfile
    if (PROFILE_VALUES.includes(envProfile as RefreshProfile)) {
      return envProfile as RefreshProfile
    }

    return PROFILE_FALLBACK
  }

  private parseMemory(value: string): number {
    if (value.endsWith('Gi')) {
      return parseFloat(value) * 1024
    }
    if (value.endsWith('Mi')) {
      return parseFloat(value)
    }
    return parseFloat(value)
  }
}

export type { RefreshOptions }
