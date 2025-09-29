import axios from 'axios'

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_ROUTER_API_URL ||
  'https://agi-egg-isr-router-1028435695123.us-central1.run.app'

export interface IntentRequest {
  text?: string
  path?: string
  method?: string
  headers?: Record<string, string>
  body?: any
  context?: {
    userId?: string
    sessionId?: string
    metadata?: Record<string, any>
  }
}

export interface IntentResponse {
  intentId: string
  recognizedIntent: {
    category: string
    confidence: number
    keywords: string[]
    mlModel?: string
  }
  routing: {
    targetService: string
    priority: number
    strategy: string
    timeout: number
  }
  metadata: {
    processingTime: number
    cacheHit: boolean
    modelVersion: string
  }
  contextualFactors?: {
    userProfile?: number
    requestMetadata?: number
    systemState?: number
    temporalContext?: number
    businessLogic?: number
  }
}

export interface ServiceHealth {
  service: string
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  latency: number
  errorRate: number
  throughput: number
  lastChecked: string
}

export interface RoutingMetrics {
  totalRequests: number
  successRate: number
  averageLatency: number
  cacheHitRate: number
  intentAccuracy: number
  serviceDistribution: Record<string, number>
  errorDistribution: Record<string, number>
  timeSeriesData: {
    timestamp: string
    requests: number
    latency: number
    errors: number
  }[]
}

export type RefreshProfile = 'balanced' | 'performance' | 'cost' | 'compliance'

export type RefreshStatus = 'PENDING' | 'GENERATING' | 'AWAITING_APPROVAL' | 'APPLIED' | 'FAILED'

export interface ManifestSummary {
  service: string
  lastModified: string
  source: 'filesystem' | 'generated'
  driftScore: number | null
  lastJobStatus: RefreshStatus | null
  lastJobAt: string | null
}

export interface ManifestDetail {
  name: string
  filePath: string
  manifest: any
  lastModified: string
  source: 'filesystem' | 'generated'
}

export interface ManifestChange {
  path: string
  before: unknown
  after: unknown
  rationale: string
  impact: 'increase' | 'decrease' | 'change'
}

export interface ManifestRefreshJob {
  id: string
  service: string
  status: RefreshStatus
  profile: RefreshProfile
  createdAt: string
  updatedAt: string
  notes?: string
  telemetry?: {
    windowStart: string
    windowEnd: string
    cpuUtilization: number
    memoryUtilization: number
    p95LatencyMs: number
    errorRate: number
    requestsPerMinute: number
    costPerMillionRequests: number
  }
  driftScore?: number
  riskLevel?: 'low' | 'medium' | 'high'
  confidence?: number
  diffSummary?: ManifestChange[]
  manifestPreview?: any
  manifestPath?: string
  error?: string
}

export interface RefreshOptions {
  profile?: RefreshProfile
  notes?: string
  autoApply?: boolean
}

class IntentRouterAPI {
  private client = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  })

  async recognizeIntent(request: IntentRequest): Promise<IntentResponse> {
    const response = await this.client.post<IntentResponse>('/intent/recognize', request)
    return response.data
  }

  async analyzeIntent(text: string): Promise<IntentResponse> {
    const response = await this.client.post<IntentResponse>('/intent/analyze', { text })
    return response.data
  }

  async getServiceHealth(): Promise<ServiceHealth[]> {
    const response = await this.client.get('/health/services')
    const data = response.data

    if (Array.isArray(data)) {
      return data
    }

    if (data && typeof data === 'object') {
      return Object.entries(data).map(([service, details]) => {
        const info = details as Record<string, unknown>

        const latency = Number(info.latency ?? 0)
        const errorRate = Number(info.errorRate ?? 0)
        const throughput = Number(info.throughput ?? 0)

        return {
          service,
          status: (info.status as ServiceHealth['status']) ?? 'unknown',
          latency: Number.isFinite(latency) ? latency : 0,
          errorRate: Number.isFinite(errorRate) ? errorRate : 0,
          throughput: Number.isFinite(throughput) ? throughput : 0,
          lastChecked: typeof info.lastChecked === 'string' ? info.lastChecked : new Date().toISOString(),
        }
      })
    }

    return []
  }

  async getMetrics(timeRange?: string): Promise<RoutingMetrics> {
    const params = timeRange ? { timeRange } : {}
    const response = await this.client.get('/metrics', {
      params,
      responseType: 'text',
      transformResponse: [(data) => data],
    })

    const payload = response.data

    if (typeof payload === 'string') {
      return this.parsePrometheusMetrics(payload)
    }

    return payload as RoutingMetrics
  }

  async checkLiveness(): Promise<boolean> {
    try {
      await this.client.get('/health')
      return true
    } catch (error) {
      console.error(error)
      return false
    }
  }

  private parsePrometheusMetrics(metricsText: string): RoutingMetrics {
    const serviceCounts = new Map<string, number>()
    const errorCounts = new Map<string, number>()
    let totalRequests = 0
    let latencySumSeconds = 0
    let latencyCount = 0
    let cacheHits = 0
    let cacheMisses = 0

    const requestRegex = /^router_requests_total\{([^}]*)\}\s+(\d+(?:\.\d+)?)/
    const latencySumRegex = /^router_latency_seconds_sum\s+(\d+(?:\.\d+)?)/
    const latencyCountRegex = /^router_latency_seconds_count\s+(\d+(?:\.\d+)?)/
    const cacheHitRegex = /^router_cache_hits_total\s+(\d+(?:\.\d+)?)/
    const cacheMissRegex = /^router_cache_misses_total\s+(\d+(?:\.\d+)?)/

    metricsText.split('\n').forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        return
      }

      let match = trimmed.match(requestRegex)
      if (match) {
        const labels = match[1]
        const value = Number.parseFloat(match[2]) || 0
        totalRequests += value

        const serviceMatch = labels.match(/service="([^"]+)"/)
        if (serviceMatch) {
          const service = serviceMatch[1]
          serviceCounts.set(service, (serviceCounts.get(service) ?? 0) + value)
        }

        const intentMatch = labels.match(/intent="([^"]+)"/)
        if (intentMatch) {
          const intent = intentMatch[1]
          const key = intent.toLowerCase()
          if (key.includes('error') || key.includes('failure')) {
            errorCounts.set(intent, (errorCounts.get(intent) ?? 0) + value)
          }
        }

        return
      }

      match = trimmed.match(latencySumRegex)
      if (match) {
        latencySumSeconds = Number.parseFloat(match[1]) || 0
        return
      }

      match = trimmed.match(latencyCountRegex)
      if (match) {
        latencyCount = Number.parseFloat(match[1]) || 0
        return
      }

      match = trimmed.match(cacheHitRegex)
      if (match) {
        cacheHits = Number.parseFloat(match[1]) || 0
        return
      }

      match = trimmed.match(cacheMissRegex)
      if (match) {
        cacheMisses = Number.parseFloat(match[1]) || 0
      }
    })

    const serviceDistribution: Record<string, number> = {}
    serviceCounts.forEach((count, service) => {
      serviceDistribution[service] = totalRequests > 0 ? count / totalRequests : 0
    })

    const totalErrors = Array.from(errorCounts.values()).reduce((sum, count) => sum + count, 0)
    const errorDistribution: Record<string, number> = {}
    errorCounts.forEach((count, intent) => {
      errorDistribution[intent] = totalErrors > 0 ? count / totalErrors : 0
    })

    const averageLatency = latencyCount > 0 ? (latencySumSeconds / latencyCount) * 1000 : 0
    const cacheTotal = cacheHits + cacheMisses
    const cacheHitRate = cacheTotal > 0 ? cacheHits / cacheTotal : 0
    const successRate = totalRequests > 0 ? (totalRequests - totalErrors) / totalRequests : 1

    const now = Date.now()
    const timeSeriesData = [2, 1, 0].map((offset) => ({
      timestamp: new Date(now - offset * 5 * 60 * 1000).toISOString(),
      requests: Math.max(0, Math.round(totalRequests / (offset + 1))),
      latency: Number(averageLatency.toFixed(2)),
      errors: Math.max(0, Math.round(totalErrors / (offset + 1))),
    }))

    return {
      totalRequests,
      successRate,
      averageLatency,
      cacheHitRate,
      intentAccuracy: successRate,
      serviceDistribution,
      errorDistribution,
      timeSeriesData,
    }
  }

  async testRoute(request: IntentRequest): Promise<{
    route: IntentResponse
    simulation: {
      wouldRoute: boolean
      targetService: string
      estimatedLatency: number
      confidence: number
    }
  }> {
    const response = await this.client.post('/intent/test', request)
    return response.data
  }

  async getRoutingRules(): Promise<any> {
    const response = await this.client.get('/config/rules')
    return response.data
  }

  async updateRoutingRule(ruleId: string, rule: any): Promise<void> {
    await this.client.put(`/config/rules/${ruleId}`, rule)
  }

  async reloadConfiguration(): Promise<{ success: boolean; message: string }> {
    const response = await this.client.post('/config/reload')
    return response.data
  }

  async listManifests(): Promise<ManifestSummary[]> {
    const response = await this.client.get<ManifestSummary[]>('/manifests')
    return response.data
  }

  async getManifestDetail(service: string): Promise<ManifestDetail> {
    const response = await this.client.get<ManifestDetail>(`/manifests/${service}`)
    return response.data
  }

  async triggerManifestRefresh(
    service: string,
    options: RefreshOptions
  ): Promise<ManifestRefreshJob> {
    const response = await this.client.post<ManifestRefreshJob>(`/manifests/${service}/refresh`, options)
    return response.data
  }

  async getManifestJobs(): Promise<ManifestRefreshJob[]> {
    const response = await this.client.get<ManifestRefreshJob[]>('/manifests/jobs/history')
    return response.data
  }

  async approveManifestJob(jobId: string): Promise<ManifestRefreshJob> {
    const response = await this.client.post<ManifestRefreshJob>(`/manifests/jobs/${jobId}/approve`, {})
    return response.data
  }

  async rollbackManifestJob(jobId: string): Promise<ManifestRefreshJob> {
    const response = await this.client.post<ManifestRefreshJob>(`/manifests/jobs/${jobId}/rollback`, {})
    return response.data
  }

  async trainModel(trainingData: {
    samples: { input: string; expectedIntent: string }[]
  }): Promise<{ modelId: string; accuracy: number }> {
    const response = await this.client.post('/ml/train', trainingData)
    return response.data
  }

  async evaluateModel(modelId: string, testData: any): Promise<{
    accuracy: number
    precision: number
    recall: number
    f1Score: number
  }> {
    const response = await this.client.post(`/ml/evaluate/${modelId}`, testData)
    return response.data
  }
}

export const intentRouterAPI = new IntentRouterAPI()
