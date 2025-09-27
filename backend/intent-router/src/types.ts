export interface IntentRequest {
  text?: string
  path?: string
  method?: string
  headers?: Record<string, string>
  body?: any
  context?: {
    userId?: string
    sessionId?: string
    ip?: string
    userAgent?: string
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
  contextualFactors?: Record<string, number>
}

export interface ServiceConfig {
  url: string
  health: string
  timeout: number
  retryPolicy?: {
    maxAttempts: number
    backoffMultiplier: number
    initialDelay: number
  }
}

export interface ServiceHealth {
  service: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  latency: number
  errorRate: number
  throughput: number
  lastChecked: string
}

export interface RoutingRule {
  ruleId: string
  name: string
  conditions: RuleConditions
  actions: RuleActions
}

export interface RuleConditions {
  AND?: Condition[]
  OR?: Condition[]
}

export interface Condition {
  type: 'path' | 'method' | 'header' | 'body' | 'bodySize' | 'query' | 'any'
  operator: 'equals' | 'matches' | 'contains' | 'starts' | 'in' | 'exists' | 'greater' | 'jsonPath'
  key?: string
  path?: string
  value?: any
}

export interface RuleActions {
  route: string
  priority: number
  timeout?: number
  retryable?: boolean
  requiresAuth?: boolean
  sticky?: boolean
  sessionAffinity?: boolean
  async?: boolean
  callback?: string
  idempotent?: boolean
  fallback?: boolean
  cache?: {
    enabled: boolean
    ttl: number
    key: string
  }
  rateLimit?: {
    requests: number
    window: number
  }
  maxBodySize?: string
}

export interface MetaRoutingConfig {
  version: string
  metaRoutingEngine: {
    enabled: boolean
    algorithmType: string
    confidenceThreshold: number
    fallbackStrategy: string
    learningMode: string
  }
  intentCategories: Record<string, IntentCategory>
  contextualFactors: Record<string, ContextualFactor>
  routingStrategies: RoutingStrategies
  mlPipeline: MLPipeline
  monitoring: MonitoringConfig
}

export interface IntentCategory {
  keywords: string[]
  patterns: string[]
  mlModelId: string
  priority: number
  targetService: string
}

export interface ContextualFactor {
  weight: number
  factors: string[]
}

export interface RoutingStrategies {
  loadBalancing: {
    algorithm: string
    healthCheckInterval: number
    failoverEnabled: boolean
  }
  circuitBreaker: {
    errorThreshold: number
    timeout: number
    resetTimeout: number
  }
  retryPolicy: {
    maxAttempts: number
    backoffMultiplier: number
    initialDelay: number
  }
  caching: {
    enabled: boolean
    ttl: number
    maxSize: string
    strategy: string
  }
}

export interface MLPipeline {
  preprocessing: {
    tokenization: string
    embedding: string
    normalization: boolean
  }
  models: MLModel[]
  ensemble: {
    strategy: string
    weights: number[]
  }
}

export interface MLModel {
  id: string
  type: string
  version: string
  threshold: number
}

export interface MonitoringConfig {
  metrics: string[]
  alerting: {
    enabled: boolean
    channels: string[]
    thresholds: Record<string, number>
  }
  logging: {
    level: string
    format: string
    retention: number
  }
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