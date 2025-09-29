import { Logger } from 'pino'

export interface ModelSelectionCriteria {
  text: string
  complexity?: 'low' | 'medium' | 'high'
  latencyRequirement?: number  // milliseconds
  costBudget?: number
  accuracy?: number
}

export interface ModelSelection {
  model: string
  reason: string
  estimatedLatency: number
  estimatedCost: number
  confidence: number
}

export class IntelligentModelSelector {
  private readonly models = {
    'models/gemini-flash-lite-latest': {
      speed: 10,
      cost: 1,
      accuracy: 0.85,
      maxTokens: 8192
    },
    'models/gemini-2.5-flash': {
      speed: 7,
      cost: 3,
      accuracy: 0.92,
      maxTokens: 32768
    },
    'models/gemini-2.5-pro': {
      speed: 4,
      cost: 8,
      accuracy: 0.98,
      maxTokens: 131072
    }
  }

  constructor(private logger: Logger) {}

  /**
   * Select the optimal Gemini model based on the request characteristics
   */
  selectModel(criteria: ModelSelectionCriteria): ModelSelection {
    const textLength = criteria.text?.length || 0
    const complexity = this.analyzeComplexity(criteria.text)

    // Determine model based on complexity and requirements
    let selectedModel = 'models/gemini-flash-lite-latest'  // Default fast model
    let reason = 'Default selection for quick response'

    // For short, simple queries use the fastest model
    if (textLength < 200 && complexity === 'low') {
      selectedModel = 'models/gemini-flash-lite-latest'
      reason = 'Short, simple query - using fastest lite model'
    }
    // For medium complexity or when accuracy is important
    else if (complexity === 'medium' || (criteria.accuracy && criteria.accuracy > 0.85)) {
      selectedModel = 'models/gemini-2.5-flash'
      reason = 'Medium complexity or moderate accuracy requirement'
    }
    // For complex queries or when highest accuracy is needed
    else if (complexity === 'high' || (criteria.accuracy && criteria.accuracy > 0.92)) {
      selectedModel = 'models/gemini-2.5-pro'
      reason = 'High complexity or maximum accuracy required'
    }
    // For very long text
    else if (textLength > 5000) {
      selectedModel = 'models/gemini-2.5-pro'
      reason = 'Long context requiring larger model'
    }

    // Override based on latency requirements
    if (criteria.latencyRequirement && criteria.latencyRequirement < 500) {
      selectedModel = 'models/gemini-flash-lite-latest'
      reason = 'Strict latency requirement - using fastest lite model'
    }

    // Override based on cost budget
    if (criteria.costBudget && criteria.costBudget < 2) {
      selectedModel = 'models/gemini-flash-lite-latest'
      reason = 'Cost optimization - using most economical model'
    }

    const modelInfo = this.models[selectedModel as keyof typeof this.models]

    this.logger.info({
      selectedModel,
      reason,
      textLength,
      complexity,
      criteria: {
        latency: criteria.latencyRequirement,
        cost: criteria.costBudget,
        accuracy: criteria.accuracy
      }
    }, 'IMS: Model selected')

    return {
      model: selectedModel,
      reason,
      estimatedLatency: this.estimateLatency(textLength, modelInfo.speed),
      estimatedCost: this.estimateCost(textLength, modelInfo.cost),
      confidence: modelInfo.accuracy
    }
  }

  /**
   * Analyze text complexity for model selection
   */
  private analyzeComplexity(text: string): 'low' | 'medium' | 'high' {
    if (!text) return 'low'

    const length = text.length
    const words = text.split(/\s+/).length
    const sentences = text.split(/[.!?]+/).length

    // Check for technical terms
    const technicalTerms = /\b(API|SQL|database|algorithm|authentication|encryption|deployment|infrastructure|microservice|kubernetes)\b/gi
    const technicalMatches = text.match(technicalTerms) || []

    // Check for multiple requirements
    const requirementIndicators = /\b(and|also|additionally|furthermore|moreover|plus)\b/gi
    const requirementMatches = text.match(requirementIndicators) || []

    let complexityScore = 0

    // Length-based scoring
    if (length > 500) complexityScore += 2
    else if (length > 200) complexityScore += 1

    // Word count
    if (words > 100) complexityScore += 2
    else if (words > 50) complexityScore += 1

    // Technical complexity
    if (technicalMatches.length > 5) complexityScore += 3
    else if (technicalMatches.length > 2) complexityScore += 2
    else if (technicalMatches.length > 0) complexityScore += 1

    // Multiple requirements
    if (requirementMatches.length > 3) complexityScore += 2
    else if (requirementMatches.length > 1) complexityScore += 1

    // Average sentence length
    const avgWordsPerSentence = words / Math.max(sentences, 1)
    if (avgWordsPerSentence > 20) complexityScore += 1

    // Determine complexity level
    if (complexityScore >= 7) return 'high'
    if (complexityScore >= 3) return 'medium'
    return 'low'
  }

  /**
   * Estimate processing latency
   */
  private estimateLatency(textLength: number, speed: number): number {
    // Base latency + length-dependent latency
    const baseLatency = 100  // milliseconds
    const perCharLatency = 0.05  // milliseconds per character
    const speedFactor = 11 - speed  // Inverse speed (1-10 scale)

    return Math.round(baseLatency + (textLength * perCharLatency * speedFactor))
  }

  /**
   * Estimate processing cost
   */
  private estimateCost(textLength: number, costFactor: number): number {
    // Simple cost estimation based on text length and model cost factor
    const tokensEstimate = textLength / 4  // Rough token estimation
    const costPerThousandTokens = costFactor * 0.001  // Example pricing

    return tokensEstimate * costPerThousandTokens / 1000
  }

  /**
   * Get model statistics for monitoring
   */
  getModelStats(): Record<string, any> {
    return {
      availableModels: Object.keys(this.models),
      modelCapabilities: this.models,
      selectionStrategy: 'complexity-based with overrides'
    }
  }
}