/**
 * Intelligent Model Selector (IMS)
 * Dynamically selects optimal Gemini model based on context and requirements
 */

import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai'

export interface ModelSelectionCriteria {
  complexity: 'low' | 'medium' | 'high'
  latencyRequirement: 'realtime' | 'near-realtime' | 'batch'
  costSensitivity: 'low' | 'medium' | 'high'
  accuracy: 'standard' | 'high' | 'maximum'
  context: {
    tokenCount: number
    hasMultimodal: boolean
    requiresReasoning: boolean
    needsFunctionCalling: boolean
  }
  tenant: {
    tier: 'free' | 'standard' | 'premium' | 'enterprise'
    budget: {
      daily: number
      used: number
    }
    preferences?: {
      preferredModel?: string
      maxLatency?: number
      minAccuracy?: number
    }
  }
}

export interface ModelDecision {
  selectedModel: string
  modelVersion: string
  reasoning: string[]
  estimatedCost: number
  estimatedLatency: number
  confidence: number
  alternatives: Array<{
    model: string
    score: number
    reason: string
  }>
  metadata: {
    timestamp: number
    criteriaHash: string
    cacheHit: boolean
  }
}

export interface ModelPerformance {
  model: string
  metrics: {
    avgLatency: number
    p95Latency: number
    p99Latency: number
    errorRate: number
    avgTokensPerSecond: number
    costPerKToken: number
  }
  history: Array<{
    timestamp: number
    latency: number
    tokens: number
    success: boolean
  }>
}

export class ModelSelector {
  private genAI: GoogleGenerativeAI
  private models: Map<string, GenerativeModel> = new Map()
  private performanceCache: Map<string, ModelPerformance> = new Map()
  private decisionCache: Map<string, ModelDecision> = new Map()

  // Model configurations based on SOW v3.1
  private readonly MODEL_CONFIGS = {
    'gemini-2.0-flash-exp': {
      name: 'Gemini 2.0 Flash Experimental',
      tier: 'ultra-fast',
      capabilities: {
        speed: 10,
        accuracy: 7,
        cost: 10,
        multimodal: true,
        functionCalling: true,
        reasoning: 6,
        contextWindow: 32768,
      },
      use_cases: ['realtime', 'simple-intent', 'high-volume'],
      cost_per_1k_tokens: { input: 0.00015, output: 0.0006 },
    },
    'gemini-1.5-flash-8b': {
      name: 'Gemini 1.5 Flash 8B',
      tier: 'fast',
      capabilities: {
        speed: 9,
        accuracy: 8,
        cost: 9,
        multimodal: true,
        functionCalling: true,
        reasoning: 7,
        contextWindow: 1000000,
      },
      use_cases: ['near-realtime', 'moderate-complexity', 'cost-sensitive'],
      cost_per_1k_tokens: { input: 0.00037, output: 0.0015 },
    },
    'gemini-1.5-pro': {
      name: 'Gemini 1.5 Pro',
      tier: 'balanced',
      capabilities: {
        speed: 6,
        accuracy: 9,
        cost: 5,
        multimodal: true,
        functionCalling: true,
        reasoning: 9,
        contextWindow: 2000000,
      },
      use_cases: ['complex-intent', 'high-accuracy', 'reasoning-heavy'],
      cost_per_1k_tokens: { input: 0.00125, output: 0.005 },
    },
  }

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey)
    this.initializeModels()
  }

  /**
   * Initialize all available models
   */
  private initializeModels(): void {
    Object.keys(this.MODEL_CONFIGS).forEach(modelName => {
      const model = this.genAI.getGenerativeModel({ model: modelName })
      this.models.set(modelName, model)

      // Initialize performance tracking
      this.performanceCache.set(modelName, {
        model: modelName,
        metrics: {
          avgLatency: 0,
          p95Latency: 0,
          p99Latency: 0,
          errorRate: 0,
          avgTokensPerSecond: 0,
          costPerKToken: this.MODEL_CONFIGS[modelName as keyof typeof this.MODEL_CONFIGS].cost_per_1k_tokens.input,
        },
        history: [],
      })
    })
  }

  /**
   * Select optimal model based on criteria
   */
  async selectModel(criteria: ModelSelectionCriteria): Promise<ModelDecision> {
    const startTime = Date.now()
    const criteriaHash = this.hashCriteria(criteria)

    // Check cache
    const cached = this.decisionCache.get(criteriaHash)
    if (cached && (Date.now() - cached.metadata.timestamp < 60000)) { // 1 minute cache
      return { ...cached, metadata: { ...cached.metadata, cacheHit: true } }
    }

    // Score each model
    const scores = this.scoreModels(criteria)

    // Select best model
    const sortedModels = Array.from(scores.entries()).sort((a, b) => b[1].score - a[1].score)
    const [selectedModel, bestScore] = sortedModels[0]

    // Build decision
    const decision: ModelDecision = {
      selectedModel,
      modelVersion: this.MODEL_CONFIGS[selectedModel as keyof typeof this.MODEL_CONFIGS].name,
      reasoning: bestScore.reasons,
      estimatedCost: this.estimateCost(selectedModel, criteria),
      estimatedLatency: this.estimateLatency(selectedModel, criteria),
      confidence: bestScore.score / 100,
      alternatives: sortedModels.slice(1, 3).map(([model, score]) => ({
        model,
        score: score.score,
        reason: score.reasons[0] || 'Alternative option',
      })),
      metadata: {
        timestamp: Date.now(),
        criteriaHash,
        cacheHit: false,
      },
    }

    // Cache decision
    this.decisionCache.set(criteriaHash, decision)

    // Log decision time
    console.log(`Model selection took ${Date.now() - startTime}ms`)

    return decision
  }

  /**
   * Score models based on criteria
   */
  private scoreModels(criteria: ModelSelectionCriteria): Map<string, { score: number; reasons: string[] }> {
    const scores = new Map<string, { score: number; reasons: string[] }>()

    for (const [modelName, config] of Object.entries(this.MODEL_CONFIGS)) {
      let score = 0
      const reasons: string[] = []

      // Speed vs Latency requirement
      if (criteria.latencyRequirement === 'realtime') {
        score += config.capabilities.speed * 3
        if (config.capabilities.speed >= 9) {
          reasons.push('Excellent for realtime requirements')
        }
      } else if (criteria.latencyRequirement === 'near-realtime') {
        score += config.capabilities.speed * 2
      } else {
        score += config.capabilities.speed
      }

      // Accuracy requirement
      if (criteria.accuracy === 'maximum') {
        score += config.capabilities.accuracy * 3
        if (config.capabilities.accuracy >= 9) {
          reasons.push('Maximum accuracy capability')
        }
      } else if (criteria.accuracy === 'high') {
        score += config.capabilities.accuracy * 2
      } else {
        score += config.capabilities.accuracy
      }

      // Cost sensitivity
      if (criteria.costSensitivity === 'high') {
        score += config.capabilities.cost * 3
        if (config.capabilities.cost >= 9) {
          reasons.push('Very cost-effective')
        }
      } else if (criteria.costSensitivity === 'medium') {
        score += config.capabilities.cost * 2
      } else {
        score += config.capabilities.cost
      }

      // Complexity matching
      if (criteria.complexity === 'high' && config.capabilities.reasoning >= 8) {
        score += 10
        reasons.push('Strong reasoning for complex tasks')
      } else if (criteria.complexity === 'low' && config.capabilities.speed >= 9) {
        score += 10
        reasons.push('Fast processing for simple tasks')
      }

      // Context requirements
      if (criteria.context.hasMultimodal && config.capabilities.multimodal) {
        score += 5
      }
      if (criteria.context.needsFunctionCalling && config.capabilities.functionCalling) {
        score += 5
      }
      if (criteria.context.requiresReasoning && config.capabilities.reasoning >= 8) {
        score += 10
        reasons.push('Advanced reasoning capabilities')
      }

      // Token count consideration
      if (criteria.context.tokenCount > 100000 && config.capabilities.contextWindow >= 1000000) {
        score += 10
        reasons.push('Large context window support')
      }

      // Tenant tier adjustments
      if (criteria.tenant.tier === 'enterprise') {
        if (config.tier === 'balanced' || config.tier === 'ultra-fast') {
          score += 5
          reasons.push('Suitable for enterprise tier')
        }
      } else if (criteria.tenant.tier === 'free' && config.capabilities.cost >= 9) {
        score += 15
        reasons.push('Optimized for free tier')
      }

      // Budget constraints
      const dailyBudgetRemaining = criteria.tenant.budget.daily - criteria.tenant.budget.used
      const estimatedCost = this.estimateCost(modelName, criteria)
      if (estimatedCost > dailyBudgetRemaining * 0.1) { // Don't use more than 10% of remaining budget
        score -= 20
        reasons.push('May exceed budget constraints')
      }

      scores.set(modelName, { score, reasons })
    }

    return scores
  }

  /**
   * Estimate cost for a model selection
   */
  private estimateCost(modelName: string, criteria: ModelSelectionCriteria): number {
    const config = this.MODEL_CONFIGS[modelName as keyof typeof this.MODEL_CONFIGS]
    if (!config) return 0

    const estimatedInputTokens = criteria.context.tokenCount || 1000
    const estimatedOutputTokens = 500 // Rough estimate

    const inputCost = (estimatedInputTokens / 1000) * config.cost_per_1k_tokens.input
    const outputCost = (estimatedOutputTokens / 1000) * config.cost_per_1k_tokens.output

    return inputCost + outputCost
  }

  /**
   * Estimate latency for a model selection
   */
  private estimateLatency(modelName: string, criteria: ModelSelectionCriteria): number {
    const config = this.MODEL_CONFIGS[modelName as keyof typeof this.MODEL_CONFIGS]
    if (!config) return 1000

    // Base latency estimation (in ms)
    let baseLatency = 1000 / config.capabilities.speed

    // Adjust for token count
    const tokenFactor = Math.log10(criteria.context.tokenCount || 100) / 2
    baseLatency *= tokenFactor

    // Adjust for complexity
    if (criteria.complexity === 'high') {
      baseLatency *= 1.5
    } else if (criteria.complexity === 'low') {
      baseLatency *= 0.7
    }

    // Get historical performance if available
    const performance = this.performanceCache.get(modelName)
    if (performance && performance.history.length > 0) {
      const recentAvg = performance.metrics.avgLatency
      if (recentAvg > 0) {
        // Blend estimate with historical data
        baseLatency = (baseLatency + recentAvg) / 2
      }
    }

    return Math.round(baseLatency)
  }

  /**
   * Hash criteria for caching
   */
  private hashCriteria(criteria: ModelSelectionCriteria): string {
    const key = JSON.stringify({
      complexity: criteria.complexity,
      latency: criteria.latencyRequirement,
      cost: criteria.costSensitivity,
      accuracy: criteria.accuracy,
      tokens: Math.floor(criteria.context.tokenCount / 1000),
      tier: criteria.tenant.tier,
    })
    return Buffer.from(key).toString('base64')
  }

  /**
   * Get selected model instance
   */
  getModel(modelName: string): GenerativeModel | undefined {
    return this.models.get(modelName)
  }

  /**
   * Record model performance
   */
  recordPerformance(modelName: string, latency: number, tokens: number, success: boolean): void {
    const performance = this.performanceCache.get(modelName)
    if (!performance) return

    // Add to history
    performance.history.push({
      timestamp: Date.now(),
      latency,
      tokens,
      success,
    })

    // Keep only last 100 entries
    if (performance.history.length > 100) {
      performance.history = performance.history.slice(-100)
    }

    // Update metrics
    const successfulRuns = performance.history.filter(h => h.success)
    if (successfulRuns.length > 0) {
      const latencies = successfulRuns.map(h => h.latency).sort((a, b) => a - b)

      performance.metrics.avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length
      performance.metrics.p95Latency = latencies[Math.floor(latencies.length * 0.95)] || 0
      performance.metrics.p99Latency = latencies[Math.floor(latencies.length * 0.99)] || 0

      const avgTokens = successfulRuns.reduce((a, h) => a + h.tokens, 0) / successfulRuns.length
      performance.metrics.avgTokensPerSecond = avgTokens / (performance.metrics.avgLatency / 1000)
    }

    performance.metrics.errorRate = performance.history.filter(h => !h.success).length / performance.history.length
  }

  /**
   * Get performance metrics for all models
   */
  getPerformanceMetrics(): Map<string, ModelPerformance> {
    return new Map(this.performanceCache)
  }
}