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
  private readonly openAIApiKey = process.env.OPENAI_API_KEY
  private readonly openAIModel = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  private readonly llmProvider = process.env.LLM_PROVIDER || 'openai'

  constructor(private logger: any, private serviceRegistry: ServiceRegistry) {}

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    if (this.canUseLLM()) {
      this.logger.info({ provider: this.llmProvider, model: this.openAIModel }, 'LLM intent model enabled')
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
        this.activeModelId = `${this.llmProvider}:${this.openAIModel}`
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
      const prompt = this.buildPrompt(text, services)

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.openAIApiKey}`
        },
        body: JSON.stringify({
          model: this.openAIModel,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You are an intent routing classifier. Given a user request, return JSON with scores between 0 and 1 for each known service.'
            },
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      })

      if (!response.ok) {
        const errorBody = await response.text()
        this.logger.error({ status: response.status, errorBody }, 'LLM classification HTTP error')
        return null
      }

      const payload = (await response.json()) as any
      const content: string | undefined = payload?.choices?.[0]?.message?.content

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
      this.logger.error({ error }, 'LLM classification failed')
      return null
    }
  }

  private canUseLLM(): boolean {
    return this.llmProvider === 'openai' && Boolean(this.openAIApiKey)
  }

  private buildPrompt(text: string, services: string[]): string {
    return [
      'Classify the following request into the available backend services.',
      'Return JSON with this shape:',
      '{ "services": [ { "name": "service-name", "score": 0.0, "reason": "short rationale" } ] }',
      'Rules:',
      '- Only include services from this list: ' + services.join(', '),
      '- Score must be between 0 and 1 (higher means more suitable).',
      '- You may include multiple services when relevant.',
      '- If you are uncertain, include api-gateway-service with a low score.',
      '',
      'Request:',
      text
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
