import {
  IntentProfile,
  ManifestGenerationRequest,
  RequirementSpecification,
  ResourceRequirements
} from '../types'
import { countKeywordMatches, tokenize, uniqueTokens } from '../utils/text'

interface IntentClassifierOptions {
  endpoint?: string
  apiKey?: string
  timeoutMs?: number
}

interface IntentRouterResponse {
  recognizedIntent?: {
    category?: string
    confidence?: number
    keywords?: string[]
  }
  routing?: {
    targetService?: string
    timeout?: number
  }
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  auth: ['auth', 'authentication', 'login', 'oauth', 'jwt', 'user', 'session'],
  payment: ['payment', 'billing', 'invoice', 'stripe', 'checkout', 'refund'],
  email: ['email', 'smtp', 'mail', 'sendgrid', 'postmark', 'mailgun'],
  ml: ['ml', 'model', 'inference', 'prediction', 'ai', 'nlp', 'vision'],
  analytics: ['analytics', 'metrics', 'report', 'insight', 'dashboard', 'bigquery'],
  media: ['image', 'media', 'video', 'cdn', 'upload', 'processing'],
  api: ['api', 'gateway', 'graphql', 'rest', 'endpoint', 'service'],
  realtime: ['realtime', 'websocket', 'socket', 'stream'],
  batch: ['batch', 'cron', 'job', 'worker'],
  general: []
}

const CATEGORY_RESOURCE_HINTS: Record<string, { cpu: string; memory: string }> = {
  auth: { cpu: '2', memory: '2Gi' },
  payment: { cpu: '2', memory: '4Gi' },
  email: { cpu: '1', memory: '1Gi' },
  ml: { cpu: '4', memory: '8Gi' },
  analytics: { cpu: '2', memory: '4Gi' },
  media: { cpu: '2', memory: '4Gi' },
  api: { cpu: '1', memory: '1Gi' },
  realtime: { cpu: '2', memory: '2Gi' },
  batch: { cpu: '1', memory: '2Gi' },
  general: { cpu: '1', memory: '512Mi' }
}

const TRAFFIC_THRESHOLDS = [
  { tier: 'low' as const, max: 100 },
  { tier: 'medium' as const, max: 500 },
  { tier: 'high' as const, max: 2000 }
]

function deriveTrafficTier(expectedRPS: number): IntentProfile['trafficTier'] {
  for (const definition of TRAFFIC_THRESHOLDS) {
    if (expectedRPS <= definition.max) {
      return definition.tier
    }
  }
  return 'extreme'
}

function enrichTokensWithRequirements(tokens: string[], requirements?: RequirementSpecification): string[] {
  if (!requirements) {
    return tokens
  }

  const enriched = [...tokens]

  if (requirements.language) {
    enriched.push(requirements.language.toLowerCase())
  }
  if (requirements.framework) {
    enriched.push(requirements.framework.toLowerCase())
  }
  if (requirements.dependencies?.length) {
    enriched.push(...requirements.dependencies.map((dep) => dep.toLowerCase()))
  }
  if (requirements.integration?.databases?.length) {
    enriched.push(...requirements.integration.databases.map((db) => db.toLowerCase()))
  }
  if (requirements.integration?.apis?.length) {
    enriched.push(...requirements.integration.apis.map((api) => api.toLowerCase()))
  }
  if (requirements.integration?.messaging?.length) {
    enriched.push(...requirements.integration.messaging.map((item) => item.toLowerCase()))
  }

  return enriched
}

export class IntentClassifier {
  constructor(private readonly options: IntentClassifierOptions = {}) {}

  async classify(request: ManifestGenerationRequest): Promise<IntentProfile> {
    const baseText = this.buildBaseText(request)
    const heuristic = this.buildHeuristicProfile(request, baseText)

    if (!this.options.endpoint) {
      return heuristic
    }

    const remote = await this.tryRemoteClassification(request, baseText)
    if (remote) {
      const category = remote.recognizedIntent?.category
      if (category) {
        heuristic.category = category
      }

      const remoteConfidence = remote.recognizedIntent?.confidence
      if (typeof remoteConfidence === 'number' && Number.isFinite(remoteConfidence)) {
        const bounded = Math.max(0, Math.min(remoteConfidence, 1))
        heuristic.confidence = parseFloat(Math.max(heuristic.confidence, bounded).toFixed(2))
      }

      if (remote.recognizedIntent?.keywords?.length) {
        heuristic.keywords = remote.recognizedIntent.keywords
      }

      if (remote.routing?.timeout && remote.routing.timeout > 0) {
        heuristic.responseTimeMs = remote.routing.timeout
      }
    }

    return heuristic
  }

  private buildBaseText(request: ManifestGenerationRequest): string {
    return [
      request.serviceName,
      request.description,
      request.intent ?? ''
    ]
      .filter(Boolean)
      .join(' ')
  }

  private buildHeuristicProfile(
    request: ManifestGenerationRequest,
    baseText: string
  ): IntentProfile {
    let tokens = tokenize(baseText)
    tokens = enrichTokensWithRequirements(tokens, request.requirements)
    const unique = uniqueTokens(tokens)

    const categoryScores = this.scoreCategories(unique)
    const { category, score } = this.selectCategory(categoryScores)

    const expectedRPS = this.estimateRPS(request)
    const resourceHints = this.deriveResourceHints(request, category)
    const responseTime = request.requirements?.performance?.responseTimeMs

    const confidence = this.calculateConfidence(score, unique.length)

    return {
      category,
      confidence,
      keywords: unique.slice(0, 20),
      trafficTier: deriveTrafficTier(expectedRPS),
      expectedRPS,
      responseTimeMs: responseTime,
      resourceHints,
      rawText: baseText
    }
  }

  private scoreCategories(tokens: string[]): Array<{ category: string; score: number }> {
    return Object.entries(CATEGORY_KEYWORDS).map(([category, keywords]) => {
      const score = keywords.length ? countKeywordMatches(tokens, keywords) : 0
      return { category, score }
    })
  }

  private selectCategory(scores: Array<{ category: string; score: number }>): {
    category: string
    score: number
  } {
    const sorted = scores.sort((a, b) => b.score - a.score)
    const best = sorted[0]

    if (!best || best.score === 0) {
      return { category: 'general', score: 0 }
    }

    const contenders = sorted.filter((item) => item.score === best.score)
    const nonGeneral = contenders.find((item) => item.category !== 'general')
    return nonGeneral ?? best
  }

  private estimateRPS(request: ManifestGenerationRequest): number {
    const explicit = request.requirements?.performance?.expectedRPS
    if (explicit && explicit > 0) {
      return explicit
    }

    const text = `${request.description} ${request.intent ?? ''}`.toLowerCase()
    if (text.includes('realtime') || text.includes('stream')) {
      return 2000
    }
    if (text.includes('api') || text.includes('mobile')) {
      return 500
    }
    if (text.includes('internal') || text.includes('ops')) {
      return 100
    }

    return 200
  }

  private deriveResourceHints(
    request: ManifestGenerationRequest,
    category: string
  ): ResourceRequirements {
    const explicit = request.requirements?.resources
    if (explicit && (explicit.cpu || explicit.memory || explicit.gpu)) {
      return { ...explicit }
    }

    const fallback = CATEGORY_RESOURCE_HINTS[category] ?? CATEGORY_RESOURCE_HINTS.general
    return {
      cpu: fallback.cpu,
      memory: fallback.memory
    }
  }

  private calculateConfidence(score: number, tokenCount: number): number {
    if (!score) {
      return 0.45
    }
    const base = Math.min(0.6 + score * 0.1, 0.95)
    const tokenBonus = Math.min(tokenCount / 50, 0.2)
    return parseFloat((base + tokenBonus).toFixed(2))
  }

  private buildIntentEndpoint(): string {
    const endpoint = this.options.endpoint ?? ''
    try {
      const url = new URL(endpoint)
      const pathname = url.pathname.endsWith('/intent/analyze')
        ? url.pathname
        : `${url.pathname.replace(/\/$/, '')}/intent/analyze`
      url.pathname = pathname
      return url.toString()
    } catch {
      return endpoint
    }
  }

  private async tryRemoteClassification(
    request: ManifestGenerationRequest,
    baseText: string
  ): Promise<IntentRouterResponse | null> {
    const endpoint = this.buildIntentEndpoint()
    if (!endpoint) {
      return null
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 5000)

    const headers: Record<string, string> = {
      'content-type': 'application/json'
    }
    if (this.options.apiKey) {
      headers['authorization'] = this.options.apiKey.startsWith('Bearer ')
        ? this.options.apiKey
        : `Bearer ${this.options.apiKey}`
      headers['x-api-key'] = this.options.apiKey
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: baseText,
          context: {
            metadata: {
              serviceName: request.serviceName,
              intent: request.intent
            }
          }
        }),
        signal: controller.signal
      })
      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const payload = (await response.json()) as IntentRouterResponse
      return payload
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`Remote intent classification failed (${message}). Falling back to heuristics.`)
      return null
    } finally {
      clearTimeout(timeout)
    }
  }
}
