import axios, { AxiosRequestConfig } from 'axios'
import { IntentRequest } from '../types'
import { ServiceRegistry } from './ServiceRegistry'
import { IntentRecognitionEngine } from './IntentRecognitionEngine'
import { routerConfig } from '../config'

interface RoutingResult {
  status: number
  headers: Record<string, string>
  body: unknown
}

interface RoutingMetrics {
  totalRequests: number
  byService: Record<string, number>
  averageLatencyMs: number
  cacheHitRate: number
  confidenceHistogram: Record<string, number>
}

export class MetaRouter {
  private routingMetrics: RoutingMetrics = {
    totalRequests: 0,
    byService: {},
    averageLatencyMs: 120,
    cacheHitRate: 0.82,
    confidenceHistogram: {
      low: 0,
      medium: 0,
      high: 0
    }
  }

  private routingRules: Record<string, unknown> = {}

  constructor(
    private serviceRegistry: ServiceRegistry,
    private intentEngine: IntentRecognitionEngine,
    private logger: any
  ) {}

  async loadRoutingRules(): Promise<void> {
    try {
      this.logger.info('Loading routing rules for meta router')
      const rules = await this.intentEngine.getRoutingRules()
      this.routingRules = rules
    } catch (error) {
      this.logger.error({ error }, 'Failed loading routing rules')
      this.routingRules = {}
    }
  }

  async route(request: IntentRequest): Promise<RoutingResult> {
    const start = Date.now()
    const classification = await this.intentEngine.classifyIntent(request)
    const targetService = classification.routing.targetService

    const latency = Date.now() - start
    this.updateMetrics(targetService, classification.recognizedIntent.confidence, latency)

    const serviceConfig = this.serviceRegistry.getServiceConfig(targetService)
    if (!serviceConfig) {
      this.logger.warn({ targetService }, 'No service config found; returning simulated response')
      return {
        status: 502,
        headers: { 'content-type': 'application/json' },
        body: {
          error: 'Target service configuration missing',
          intent: classification
        }
      }
    }

    if (process.env.ROUTER_FORWARD_ENABLED === 'true') {
      try {
        const payload: AxiosRequestConfig = {
          url: serviceConfig.url,
          method: request.method || 'POST',
          timeout: serviceConfig.timeout,
          data: request.body,
          headers: request.headers
        }
        const response = await axios(payload)
        const responseHeaders: Record<string, string> = {}
        Object.entries(response.headers || {}).forEach(([key, value]) => {
          if (typeof value === 'string') {
            responseHeaders[key] = value
          }
        })
        return {
          status: response.status,
          headers: responseHeaders,
          body: response.data
        }
      } catch (error) {
        this.logger.error({ error, targetService }, 'Downstream request failed')
        return {
          status: 504,
          headers: { 'content-type': 'application/json' },
          body: {
            error: 'Failed to reach downstream service',
            targetService
          }
        }
      }
    }

    return {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: {
        message: 'Simulated routing response',
        targetService,
        confidence: classification.recognizedIntent.confidence,
        metadata: classification.metadata,
        contextualFactors: classification.contextualFactors,
        routingRulesVersion: (this.routingRules as { version?: string })?.version || 'unknown'
      }
    }
  }

  async getMetrics(): Promise<RoutingMetrics & { confidenceThreshold: number }> {
    return {
      ...this.routingMetrics,
      confidenceThreshold: routerConfig.defaultConfidenceThreshold
    }
  }

  getRoutingRules(): Record<string, unknown> {
    return this.routingRules
  }

  private updateMetrics(service: string, confidence: number, latency: number): void {
    this.routingMetrics.totalRequests += 1
    this.routingMetrics.byService[service] = (this.routingMetrics.byService[service] || 0) + 1
    this.routingMetrics.averageLatencyMs =
      (this.routingMetrics.averageLatencyMs * 0.9 + latency * 0.1)

    const bucket = confidence >= 0.85 ? 'high' : confidence >= 0.6 ? 'medium' : 'low'
    this.routingMetrics.confidenceHistogram[bucket] += 1
  }
}

export type { RoutingResult, RoutingMetrics }
