import { NextResponse } from 'next/server'
import { intentRouterAPI } from '@/lib/api/intent-router'

type IntentAnalyzerRequest = {
  input?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as IntentAnalyzerRequest
    const input = body.input?.trim()

    if (!input) {
      return NextResponse.json({ error: 'Input text is required' }, { status: 400 })
    }

    const intent = await intentRouterAPI.analyzeIntent(input)

    const contextualFactors = intent.contextualFactors ?? {}

    return NextResponse.json({
      intent: intent.recognizedIntent.category,
      confidence: intent.recognizedIntent.confidence,
      entities: {
        targetService: intent.routing.targetService,
        routingStrategy: intent.routing.strategy,
        modelVersion: intent.metadata.modelVersion,
        ...contextualFactors,
      },
      suggestedAction: `Route to ${intent.routing.targetService}`,
    })
  } catch (error) {
    console.error('Intent analyzer API error', error)
    return NextResponse.json({ error: 'Failed to analyze intent' }, { status: 500 })
  }
}
