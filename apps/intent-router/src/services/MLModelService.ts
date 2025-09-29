import type { ServiceRegistry } from './ServiceRegistry'

export interface ClassificationResult {
  [service: string]: number
}

const HEURISTIC_MODEL_ID = 'heuristic-keywords'

interface LLMServiceResponse {
  services?: Array<{
    name: string
    score: number
    reason?: string
  }>
}

export class MLModelService {
  private isInitialized = false
  private activeModelId: string = HEURISTIC_MODEL_ID
  private readonly geminiApiKey = process.env.GEMINI_API_KEY
  private readonly geminiModel = process.env.GEMINI_MODEL || 'models/gemini-2.5-flash'
  private readonly llmProvider = process.env.LLM_PROVIDER || 'gemini'

  constructor(private logger: any, private serviceRegistry: ServiceRegistry) {}

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    if (this.canUseLLM()) {
      this.logger.info({ provider: this.llmProvider, model: this.geminiModel }, 'LLM intent model enabled')
    } else {
      this.logger.info('LLM intent model disabled; using heuristic classifier')
    }

    this.isInitialized = true
  }

  async classify(text: string): Promise<ClassificationResult> {
    if (!text?.trim()) {
      return {}
    }

    if (!this.isInitialized) {
      await this.initialize()
    }

    const trimmed = text.trim()

    if (this.canUseLLM()) {
      const llmScores = await this.classifyWithLLM(trimmed)
      if (llmScores && Object.keys(llmScores).length) {
        this.activeModelId = `${this.llmProvider}:${this.geminiModel}`
        return llmScores
      }
      this.logger.warn('LLM classification failed; falling back to heuristic intent model')
    }

    this.activeModelId = HEURISTIC_MODEL_ID
    return this.classifyWithHeuristics(trimmed)
  }

  getActiveModelId(): string {
    return this.activeModelId
  }

  async train(): Promise<{ version: string }> {
    this.logger.info('LLM training requested (no-op for remote providers)')
    return { version: this.activeModelId }
  }

  private classifyWithHeuristics(text: string): ClassificationResult {
    const cleaned = text.toLowerCase()
    const scores: ClassificationResult = {}

    const keywordBuckets: Record<string, string[]> = {
      'user-authentication-service': ['auth', 'login', 'user', 'session'],
      'payment-processing-service': ['payment', 'invoice', 'billing', 'transaction'],
      'email-notification-service': ['email', 'notification', 'message', 'mail'],
      'image-processing-service': ['image', 'thumbnail', 'picture', 'resize'],
      'data-analytics-service': ['analytics', 'report', 'insight', 'metric'],
      'pdf-generator-service': ['pdf', 'document', 'export', 'report'],
      'websocket-chat-service': ['chat', 'socket', 'realtime', 'ws'],
      'machine-learning-inference-service': ['prediction', 'model', 'inference', 'ml'],
      'scheduled-batch-processor-service': ['batch', 'cron', 'job', 'schedule'],
      'api-gateway-service': ['gateway', 'proxy', 'api', 'edge']
    }

    Object.entries(keywordBuckets).forEach(([service, keywords]) => {
      const matches = keywords.filter(keyword => cleaned.includes(keyword))
      if (matches.length) {
        scores[service] = Math.min(1, matches.length / keywords.length + 0.2)
      }
    })

    if (!Object.keys(scores).length) {
      scores['api-gateway-service'] = 0.4
    }

    return scores
  }

  private async classifyWithLLM(text: string): Promise<ClassificationResult | null> {
    if (!this.canUseLLM()) {
      return null
    }

    try {
      const services = Object.keys(this.serviceRegistry.list())
      const prompt = this.buildGeminiPrompt(text, services)

      this.logger.info({ model: this.geminiModel }, 'Calling Gemini API for intent classification')

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent?key=${this.geminiApiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.2,
            topK: 1,
            topP: 1,
            maxOutputTokens: 1024
          }
        })
      })

      if (!response.ok) {
        const errorBody = await response.text()
        this.logger.error({ status: response.status, errorBody }, 'Gemini classification HTTP error')
        // Fallback to heuristics on API error
        return this.classifyWithHeuristics(text)
      }

      const payload = (await response.json()) as any
      const content: string | undefined = payload?.candidates?.[0]?.content?.parts?.[0]?.text

      if (!content) {
        this.logger.error({ payload }, 'LLM classification missing content')
        return null
      }

      const parsed = this.tryParseContent(content)
      if (!parsed?.services?.length) {
        this.logger.error({ content }, 'LLM classification returned empty services array')
        return null
      }

      const scores: ClassificationResult = {}
      parsed.services.forEach(entry => {
        if (!entry?.name) {
          return
        }
        if (!services.includes(entry.name)) {
          return
        }
        const normalized = this.normalizeScore(entry.score)
        if (normalized > 0) {
          scores[entry.name] = normalized
        }
      })

      return Object.keys(scores).length ? scores : null
    } catch (error) {
      this.logger.error({ error }, 'Gemini classification failed, using heuristics')
      // Fallback to heuristics on error
      return this.classifyWithHeuristics(text)
    }
  }

  private canUseLLM(): boolean {
    return this.llmProvider === 'gemini' && Boolean(this.geminiApiKey)
  }

  private buildGeminiPrompt(text: string, services: string[]): string {
    const serviceList = services.length > 0 ? services : [
      'user-authentication-service',
      'payment-processing-service',
      'email-notification-service',
      'data-analytics-service',
      'api-gateway-service'
    ]

    return [
      'You are an intent routing classifier. Analyze the following user request and classify it into the appropriate backend services.',
      '',
      'Return a JSON response with this exact structure:',
      '{ "services": [ { "name": "service-name", "score": 0.0, "reason": "short explanation" } ] }',
      '',
      'Available services:',
      ...serviceList.map(s => `- ${s}`),
      '',
      'Rules:',
      '1. Score must be between 0 and 1 (higher = more suitable)',
      '2. Include multiple services if the request spans multiple domains',
      '3. Always provide at least one service',
      '4. If uncertain, use api-gateway-service with score 0.5',
      '',
      'User Request: ' + text,
      '',
      'Respond with only the JSON, no additional text.'
    ].join('\n')
  }

  private tryParseContent(content: string): LLMServiceResponse | null {
    const trimmed = content.trim()

    try {
      return JSON.parse(trimmed) as LLMServiceResponse
    } catch (error) {
      const match = trimmed.match(/\{[\s\S]*\}/)
      if (match) {
        try {
          return JSON.parse(match[0]) as LLMServiceResponse
        } catch (innerError) {
          this.logger.error({ innerError }, 'Failed to parse extracted JSON from LLM response')
        }
      } else {
        this.logger.error({ error }, 'Failed to parse LLM response content')
      }
    }

    return null
  }

  private normalizeScore(score: number): number {
    if (typeof score !== 'number' || Number.isNaN(score)) {
      return 0
    }
    if (!Number.isFinite(score)) {
      return 0
    }

    if (score > 1) {
      return 1
    }
    if (score < 0) {
      return 0
    }
    return Number.parseFloat(score.toFixed(4))
  }
}

export type { ClassificationResult as IntentClassificationResult }
