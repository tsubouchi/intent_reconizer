import { Redis } from 'ioredis'
import { createHash } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { Logger } from 'pino'
import * as natural from 'natural'
import {
  IntentRequest,
  IntentResponse,
  MetaRoutingConfig,
  RoutingRule,
  Condition,
  RuleConditions
} from '../types'
import { ServiceRegistry } from './ServiceRegistry'
import { MLModelService } from './MLModelService'
import * as fs from 'fs/promises'
import * as path from 'path'

interface MetricsCollectors {
  cacheHits: any
  cacheMisses: any
}

export class IntentRecognitionEngine {
  private metaRoutingConfig: MetaRoutingConfig | null = null
  private routingRules: { version: string; rules: RoutingRule[] } | null = null
  private tokenizer: natural.TreebankWordTokenizer
  private tfidf: natural.TfIdf
  private classifier: natural.BayesClassifier

  constructor(
    private serviceRegistry: ServiceRegistry,
    private mlModelService: MLModelService,
    private redis: Redis,
    private logger: Logger,
    private metrics: MetricsCollectors
  ) {
    this.tokenizer = new natural.TreebankWordTokenizer()
    this.tfidf = new natural.TfIdf()
    this.classifier = new natural.BayesClassifier()
  }

  async loadConfiguration(): Promise<void> {
    try {
      const configPath = process.env.CONFIG_PATH || '/config'

      const metaRoutingPath = path.join(configPath, 'meta-routing.json')
      const routingRulesPath = path.join(configPath, 'routing-rules.json')

      try {
        const metaRoutingData = await fs.readFile(metaRoutingPath, 'utf-8')
        this.metaRoutingConfig = JSON.parse(metaRoutingData)
      } catch {
        // Fallback to embedded config
        this.metaRoutingConfig = this.getDefaultMetaRoutingConfig()
      }

      try {
        const routingRulesData = await fs.readFile(routingRulesPath, 'utf-8')
        this.routingRules = JSON.parse(routingRulesData)
      } catch {
        // Fallback to embedded config
        this.routingRules = this.getDefaultRoutingRules()
      }

      // Train classifier with intent categories
      if (this.metaRoutingConfig?.intentCategories) {
        for (const [category, config] of Object.entries(this.metaRoutingConfig.intentCategories)) {
          for (const keyword of config.keywords) {
            this.classifier.addDocument(keyword, category)
          }
        }
        this.classifier.train()
      }

      this.logger.info('Configuration loaded successfully')
    } catch (error) {
      this.logger.error('Failed to load configuration:', error)
      throw error
    }
  }

  async classifyIntent(request: IntentRequest): Promise<IntentResponse> {
    const startTime = Date.now()

    // Generate cache key
    const cacheKey = this.generateCacheKey(request)

    // Check cache
    const cached = await this.getFromCache(cacheKey)
    if (cached) {
      this.metrics.cacheHits.inc()
      cached.metadata.cacheHit = true
      return cached
    }

    this.metrics.cacheMisses.inc()

    // Perform intent classification
    const intentScores = await this.calculateIntentScores(request)

    // Apply contextual factors
    const contextualScores = this.applyContextualFactors(request, intentScores)

    // Determine best match
    const bestIntent = this.selectBestIntent(contextualScores)
    const modelId = this.mlModelService.getActiveModelId()

    // Build response
    const response: IntentResponse = {
      intentId: uuidv4(),
      recognizedIntent: {
        category: bestIntent.category,
        confidence: bestIntent.confidence,
        keywords: bestIntent.keywords || [],
        mlModel: modelId
      },
      routing: {
        targetService: bestIntent.targetService,
        priority: bestIntent.priority || 100,
        strategy: this.metaRoutingConfig?.metaRoutingEngine?.algorithmType || 'ml-enhanced',
        timeout: this.serviceRegistry.getServiceConfig(bestIntent.targetService)?.timeout || 30000
      },
      metadata: {
        processingTime: Date.now() - startTime,
        cacheHit: false,
        modelVersion: modelId
      },
      contextualFactors: contextualScores.factors
    }

    // Cache result
    await this.cacheResult(cacheKey, response)

    return response
  }

  getRoutingRules(): { version: string; rules: RoutingRule[] } {
    if (this.routingRules) {
      return this.routingRules
    }
    return this.getDefaultRoutingRules()
  }

  getMetaRoutingConfig(): MetaRoutingConfig {
    if (this.metaRoutingConfig) {
      return this.metaRoutingConfig
    }
    return this.getDefaultMetaRoutingConfig()
  }

  private async calculateIntentScores(request: IntentRequest): Promise<Record<string, any>> {
    const scores: Record<string, any> = {}

    // Text-based classification
    if (request.text) {
      scores.nlp = await this.nlpClassify(request.text)
      scores.ml = await this.mlModelService.classify(request.text)
    }

    // Rule-based classification
    scores.rules = this.applyRoutingRules(request)

    // Pattern matching
    scores.patterns = this.matchPatterns(request)

    return scores
  }

  private async nlpClassify(text: string): Promise<Record<string, number>> {
    const scores: Record<string, number> = {}

    // Use natural language classifier
    const classifications = this.classifier.getClassifications(text)

    for (const classification of classifications) {
      const category = this.metaRoutingConfig?.intentCategories[classification.label]
      if (category) {
        scores[category.targetService] = classification.value
      }
    }

    // TF-IDF analysis
    this.tfidf.addDocument(text)

    if (this.metaRoutingConfig?.intentCategories) {
      for (const [_category, config] of Object.entries(this.metaRoutingConfig.intentCategories)) {
        let score = 0
        for (const keyword of config.keywords) {
          const tfidfScore = this.tfidf.tfidf(keyword, 0)
          score += tfidfScore
        }
        if (score > 0) {
          scores[config.targetService] = Math.max(
            scores[config.targetService] || 0,
            Math.min(score / config.keywords.length, 1)
          )
        }
      }
    }

    return scores
  }

  private applyRoutingRules(request: IntentRequest): Record<string, number> {
    const scores: Record<string, number> = {}

    if (!this.routingRules?.rules) return scores

    for (const rule of this.routingRules.rules) {
      if (this.evaluateRuleConditions(rule.conditions, request)) {
        const service = rule.actions.route
        const priority = rule.actions.priority || 100
        scores[service] = priority / 1000
      }
    }

    return scores
  }

  private matchPatterns(request: IntentRequest): Record<string, number> {
    const scores: Record<string, number> = {}

    if (!this.metaRoutingConfig?.intentCategories) return scores

    for (const [_category, config] of Object.entries(this.metaRoutingConfig.intentCategories)) {
      let score = 0

      // Check keywords in text
      if (request.text && config.keywords) {
        const textLower = request.text.toLowerCase()
        const tokens = this.tokenizer.tokenize(textLower)
        const matchingKeywords = config.keywords.filter(kw =>
          tokens.includes(kw.toLowerCase())
        )
        if (matchingKeywords.length > 0) {
          score = matchingKeywords.length / config.keywords.length
        }
      }

      // Check path patterns
      if (request.path && config.patterns) {
        for (const pattern of config.patterns) {
          const regex = new RegExp(pattern)
          if (regex.test(request.path)) {
            score = Math.max(score, 0.8)
            break
          }
        }
      }

      if (score > 0) {
        scores[config.targetService] = score
      }
    }

    return scores
  }

  private applyContextualFactors(
    request: IntentRequest,
    intentScores: Record<string, any>
  ): { scores: Record<string, number>; factors: Record<string, number> } {
    const factors: Record<string, number> = {}

    if (this.metaRoutingConfig?.contextualFactors) {
      for (const [factorName, factorConfig] of Object.entries(this.metaRoutingConfig.contextualFactors)) {
        factors[factorName] = this.calculateFactorScore(factorName, request, factorConfig)
      }
    }

    const combinedScores = this.combineScores(intentScores, factors)

    return { scores: combinedScores, factors }
  }

  private calculateFactorScore(
    factorName: string,
    request: IntentRequest,
    config: any
  ): number {
    let baseScore = 0.5

    switch (factorName) {
      case 'userProfile':
        if (request.context?.userId) baseScore = 0.7
        break
      case 'requestMetadata':
        if (request.headers && Object.keys(request.headers).length > 0) baseScore = 0.6
        break
      case 'systemState':
        // Check service health
        const healthyServices = this.serviceRegistry.getHealthyServices()
        baseScore = healthyServices.length > 5 ? 0.8 : 0.4
        break
      case 'temporalContext':
        const hour = new Date().getHours()
        baseScore = (hour >= 9 && hour <= 17) ? 0.9 : 0.4 // Business hours
        break
      case 'businessLogic':
        baseScore = 0.75
        break
    }

    return baseScore * (config.weight || 1.0)
  }

  private combineScores(
    intentScores: Record<string, any>,
    factors: Record<string, number>
  ): Record<string, number> {
    const combined: Record<string, number> = {}
    const allServices = new Set<string>()

    // Collect all services
    for (const scores of Object.values(intentScores)) {
      if (typeof scores === 'object') {
        Object.keys(scores).forEach(service => allServices.add(service))
      }
    }

    // Calculate weighted average for each service
    for (const service of allServices) {
      let totalScore = 0
      let totalWeight = 0

      for (const [scoreType, scores] of Object.entries(intentScores)) {
        if (typeof scores === 'object' && service in scores) {
          const weight = scoreType === 'ml' ? 2.0 : 1.0
          totalScore += scores[service] * weight
          totalWeight += weight
        }
      }

      if (totalWeight > 0) {
        const baseScore = totalScore / totalWeight
        const factorMultiplier = this.calculateFactorMultiplier(factors)
        const adjusted = Math.min(1, Math.max(0, baseScore * factorMultiplier))
        combined[service] = adjusted
      }
    }

    return combined
  }

  private calculateFactorMultiplier(factors: Record<string, number>): number {
    const values = Object.values(factors)
    if (!values.length) {
      return 1
    }

    const average = values.reduce((sum, value) => sum + value, 0) / values.length
    const adjustment = (average - 0.5) * 0.4
    return 1 + adjustment
  }

  private selectBestIntent(contextualScores: { scores: Record<string, number>; factors: Record<string, number> }): any {
    const scores = contextualScores.scores

    if (Object.keys(scores).length === 0) {
      // Fallback to API gateway
      return {
        category: 'general',
        confidence: 0.0,
        targetService: 'api-gateway-service',
        priority: 100,
        keywords: []
      }
    }

    // Find service with highest score
    const bestService = Object.entries(scores).reduce((a, b) =>
      a[1] > b[1] ? a : b
    )[0]

    const confidence = scores[bestService]

    // Find category info
    let categoryInfo: any = null
    if (this.metaRoutingConfig?.intentCategories) {
      for (const [category, config] of Object.entries(this.metaRoutingConfig.intentCategories)) {
        if (config.targetService === bestService) {
          categoryInfo = {
            ...config,
            category
          }
          break
        }
      }
    }

    if (!categoryInfo) {
      categoryInfo = {
        category: 'unknown',
        targetService: bestService,
        priority: 100,
        keywords: []
      }
    }

    categoryInfo.confidence = confidence

    return categoryInfo
  }

  private evaluateRuleConditions(conditions: RuleConditions, request: IntentRequest): boolean {
    if (conditions.AND) {
      return conditions.AND.every(cond => this.evaluateCondition(cond, request))
    } else if (conditions.OR) {
      return conditions.OR.some(cond => this.evaluateCondition(cond, request))
    }
    return false
  }

  private evaluateCondition(condition: Condition, request: IntentRequest): boolean {
    const { type, operator, value } = condition

    switch (type) {
      case 'path':
        return this.matchValue(request.path, operator, value)
      case 'method':
        return this.matchValue(request.method, operator, value)
      case 'header':
        const headerValue = request.headers?.[condition.key!]
        return this.matchValue(headerValue, operator, value)
      case 'any':
        return true
      default:
        return false
    }
  }

  private matchValue(actual: any, operator: string, expected: any): boolean {
    if (actual === undefined || actual === null) return false

    switch (operator) {
      case 'equals':
        return actual === expected
      case 'matches':
        return new RegExp(expected).test(String(actual))
      case 'contains':
        return String(actual).includes(expected)
      case 'starts':
        return String(actual).startsWith(expected)
      case 'in':
        return Array.isArray(expected) && expected.includes(actual)
      case 'exists':
        return actual !== undefined && actual !== null
      case 'greater':
        return Number(actual) > Number(expected)
      case 'jsonPath':
        return false
      default:
        return false
    }
  }

  private generateCacheKey(request: IntentRequest): string {
    const keyData = {
      text: request.text,
      path: request.path,
      method: request.method,
      headers: request.headers
    }
    const keyStr = JSON.stringify(keyData)
    return `intent:${createHash('md5').update(keyStr).digest('hex')}`
  }

  private async getFromCache(key: string): Promise<IntentResponse | null> {
    try {
      const data = await this.redis.get(key)
      if (data) {
        return JSON.parse(data)
      }
    } catch (error) {
      this.logger.error('Cache get error:', error)
    }
    return null
  }

  private async cacheResult(key: string, result: IntentResponse): Promise<void> {
    try {
      const ttl = this.metaRoutingConfig?.routingStrategies?.caching?.ttl || 300
      await this.redis.setex(key, ttl, JSON.stringify(result))
    } catch (error) {
      this.logger.error('Cache set error:', error)
    }
  }

  private getDefaultMetaRoutingConfig(): MetaRoutingConfig {
    // Return default config (same as meta-routing.json content)
    return JSON.parse(`{
      "version": "1.0.0",
      "metaRoutingEngine": {
        "enabled": true,
        "algorithmType": "ml-enhanced",
        "confidenceThreshold": 0.85,
        "fallbackStrategy": "round-robin",
        "learningMode": "online"
      },
      "intentCategories": {},
      "contextualFactors": {},
      "routingStrategies": {
        "loadBalancing": {
          "algorithm": "weighted-round-robin",
          "healthCheckInterval": 5000,
          "failoverEnabled": true
        },
        "circuitBreaker": {
          "errorThreshold": 50,
          "timeout": 30000,
          "resetTimeout": 60000
        },
        "retryPolicy": {
          "maxAttempts": 3,
          "backoffMultiplier": 2,
          "initialDelay": 100
        },
        "caching": {
          "enabled": true,
          "ttl": 300,
          "maxSize": "1GB",
          "strategy": "LRU"
        }
      },
      "mlPipeline": {
        "preprocessing": {
          "tokenization": "bert-base",
          "embedding": "sentence-transformers",
          "normalization": true
        },
        "models": [],
        "ensemble": {
          "strategy": "weighted-voting",
          "weights": [0.7, 0.3]
        }
      },
      "monitoring": {
        "metrics": [],
        "alerting": {
          "enabled": true,
          "channels": ["slack", "email"],
          "thresholds": {
            "accuracy": 0.80,
            "latency": 500,
            "errorRate": 0.05
          }
        },
        "logging": {
          "level": "info",
          "format": "json",
          "retention": 30
        }
      }
    }`)
  }

  private getDefaultRoutingRules(): { version: string; rules: RoutingRule[] } {
    return {
      version: "1.0.0",
      rules: []
    }
  }
}
