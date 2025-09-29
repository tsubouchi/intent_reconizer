/**
 * Intelligent Streaming Recognizer (ISR) Core
 * Implements real-time intent recognition with chunking and summarization
 */

import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'

export interface StreamChunk {
  id: string
  sessionId: string
  timestamp: number
  content: string
  type: 'audio' | 'text' | 'transcript'
  metadata: {
    sequence: number
    isFinal: boolean
    confidence?: number
    language?: string
  }
}

export interface RollingSummary {
  sessionId: string
  timestamp: number
  summary: string
  keyPoints: string[]
  entities: Array<{
    type: string
    value: string
    confidence: number
  }>
  sentiment: {
    score: number
    label: 'positive' | 'neutral' | 'negative'
  }
  chunkCount: number
}

export interface IntentRecognition {
  id: string
  sessionId: string
  timestamp: number
  intent: {
    primary: string
    confidence: number
    secondary?: string
    secondaryConfidence?: number
  }
  entities: Record<string, any>
  context: {
    previousIntents: string[]
    sessionDuration: number
    interactionCount: number
  }
  summary: RollingSummary
  suggestedAction?: string
}

export class StreamingRecognizer extends EventEmitter {
  private sessions: Map<string, {
    chunks: StreamChunk[]
    summary: RollingSummary
    lastActivity: number
  }> = new Map()

  // private readonly CHUNK_SIZE = 500 // characters - Currently unused but may be needed for future chunking logic
  private readonly SUMMARY_UPDATE_INTERVAL = 5 // chunks
  private readonly SESSION_TIMEOUT = 300000 // 5 minutes

  constructor() {
    super()
    this.startSessionCleanup()
  }

  /**
   * Process incoming stream chunk
   */
  async processChunk(chunk: StreamChunk): Promise<void> {
    // Get or create session
    let session = this.sessions.get(chunk.sessionId)
    if (!session) {
      session = {
        chunks: [],
        summary: this.initializeSummary(chunk.sessionId),
        lastActivity: Date.now(),
      }
      this.sessions.set(chunk.sessionId, session)
      this.emit('session:started', chunk.sessionId)
    }

    // Add chunk to session
    session.chunks.push(chunk)
    session.lastActivity = Date.now()

    // Update rolling summary if needed
    if (session.chunks.length % this.SUMMARY_UPDATE_INTERVAL === 0) {
      await this.updateRollingSummary(chunk.sessionId)
    }

    // Emit chunk event
    this.emit('chunk:processed', {
      sessionId: chunk.sessionId,
      chunkId: chunk.id,
      chunkCount: session.chunks.length,
    })

    // Check for intent recognition trigger
    if (this.shouldRecognizeIntent(session)) {
      await this.recognizeIntent(chunk.sessionId)
    }
  }

  /**
   * Initialize a new summary
   */
  private initializeSummary(sessionId: string): RollingSummary {
    return {
      sessionId,
      timestamp: Date.now(),
      summary: '',
      keyPoints: [],
      entities: [],
      sentiment: {
        score: 0,
        label: 'neutral',
      },
      chunkCount: 0,
    }
  }

  /**
   * Update the rolling summary for a session
   */
  private async updateRollingSummary(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    // Get recent chunks for summarization
    const recentChunks = session.chunks.slice(-this.SUMMARY_UPDATE_INTERVAL)
    const text = recentChunks.map(c => c.content).join(' ')

    // TODO: Call Gemini for summarization
    // For now, use a simple implementation
    session.summary = {
      ...session.summary,
      timestamp: Date.now(),
      summary: text.substring(0, 200) + '...',
      keyPoints: this.extractKeyPoints(text),
      entities: this.extractEntities(text),
      sentiment: this.analyzeSentiment(text),
      chunkCount: session.chunks.length,
    }

    this.emit('summary:updated', session.summary)
  }

  /**
   * Check if we should trigger intent recognition
   */
  private shouldRecognizeIntent(session: any): boolean {
    // Trigger on every 3 chunks or if final chunk
    const lastChunk = session.chunks[session.chunks.length - 1]
    return (
      session.chunks.length % 3 === 0 ||
      lastChunk.metadata.isFinal
    )
  }

  /**
   * Recognize intent from session chunks
   */
  private async recognizeIntent(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    // Prepare context from session
    const context = session.chunks.map(c => c.content).join(' ')

    // TODO: Call IMS-selected Gemini model for intent recognition
    // For now, use mock data
    const recognition: IntentRecognition = {
      id: uuidv4(),
      sessionId,
      timestamp: Date.now(),
      intent: {
        primary: this.detectPrimaryIntent(context),
        confidence: 0.85,
      },
      entities: this.extractEntities(context),
      context: {
        previousIntents: [],
        sessionDuration: Date.now() - session.chunks[0].timestamp,
        interactionCount: session.chunks.length,
      },
      summary: session.summary,
      suggestedAction: this.suggestAction(context),
    }

    this.emit('intent:recognized', recognition)
  }

  /**
   * Extract key points from text (simplified)
   */
  private extractKeyPoints(text: string): string[] {
    const sentences = text.split(/[.!?]+/)
    return sentences
      .filter(s => s.length > 20)
      .slice(0, 3)
      .map(s => s.trim())
  }

  /**
   * Extract entities from text (simplified)
   */
  private extractEntities(text: string): any[] {
    const entities = []

    // Extract email patterns
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
    const emails = text.match(emailRegex)
    if (emails) {
      emails.forEach(email => {
        entities.push({
          type: 'email',
          value: email,
          confidence: 0.95,
        })
      })
    }

    // Extract potential service names
    const services = ['authentication', 'payment', 'email', 'image', 'analytics']
    services.forEach(service => {
      if (text.toLowerCase().includes(service)) {
        entities.push({
          type: 'service',
          value: service,
          confidence: 0.8,
        })
      }
    })

    return entities
  }

  /**
   * Analyze sentiment (simplified)
   */
  private analyzeSentiment(text: string): { score: number; label: 'positive' | 'neutral' | 'negative' } {
    const positive = ['good', 'great', 'excellent', 'happy', 'success']
    const negative = ['bad', 'poor', 'failure', 'error', 'problem']

    let score = 0
    const lower = text.toLowerCase()

    positive.forEach(word => {
      if (lower.includes(word)) score += 0.2
    })

    negative.forEach(word => {
      if (lower.includes(word)) score -= 0.2
    })

    return {
      score: Math.max(-1, Math.min(1, score)),
      label: score > 0.1 ? 'positive' : score < -0.1 ? 'negative' : 'neutral',
    }
  }

  /**
   * Detect primary intent (simplified)
   */
  private detectPrimaryIntent(text: string): string {
    const lower = text.toLowerCase()

    if (lower.includes('reset') && lower.includes('password')) {
      return 'password_reset'
    }
    if (lower.includes('pay') || lower.includes('charge') || lower.includes('bill')) {
      return 'payment_inquiry'
    }
    if (lower.includes('help') || lower.includes('support')) {
      return 'support_request'
    }
    if (lower.includes('cancel') || lower.includes('delete')) {
      return 'cancellation'
    }

    return 'general_inquiry'
  }

  /**
   * Suggest action based on context (simplified)
   */
  private suggestAction(text: string): string {
    const intent = this.detectPrimaryIntent(text)

    const actions: Record<string, string> = {
      password_reset: 'route_to_auth_service',
      payment_inquiry: 'route_to_payment_service',
      support_request: 'create_support_ticket',
      cancellation: 'initiate_cancellation_flow',
      general_inquiry: 'route_to_general_support',
    }

    return actions[intent] || 'route_to_general_support'
  }

  /**
   * Clean up inactive sessions
   */
  private startSessionCleanup(): void {
    setInterval(() => {
      const now = Date.now()
      for (const [sessionId, session] of this.sessions.entries()) {
        if (now - session.lastActivity > this.SESSION_TIMEOUT) {
          this.sessions.delete(sessionId)
          this.emit('session:expired', sessionId)
        }
      }
    }, 60000) // Check every minute
  }

  /**
   * Get session info
   */
  getSession(sessionId: string) {
    return this.sessions.get(sessionId)
  }

  /**
   * End a session explicitly
   */
  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      this.emit('session:ended', {
        sessionId,
        duration: Date.now() - session.chunks[0]?.timestamp || 0,
        chunkCount: session.chunks.length,
      })
      this.sessions.delete(sessionId)
    }
  }
}