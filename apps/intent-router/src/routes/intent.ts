import { Router, Request, Response } from 'express';
import { recognizeIntent } from '../services/gemini';
import { evaluatePolicy } from '../services/policy';
import { saveIntent } from '../services/firestore';
import { z } from 'zod';

const router = Router();

const IntentRequestSchema = z.object({
  sessionId: z.string(),
  text: z.string().min(1).max(1000),
  context: z.object({
    tenantId: z.string().optional(),
    userId: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional()
  }).optional()
});

router.post('/recognize', async (req: Request, res: Response) => {
  try {
    const validated = IntentRequestSchema.parse(req.body);

    // Recognize intent using Gemini
    const intent = await recognizeIntent(validated.text, validated.context);

    // Evaluate policy
    const policyDecision = await evaluatePolicy(intent, validated.context);

    // Save to Firestore
    await saveIntent({
      ...intent,
      sessionId: validated.sessionId,
      policyDecision,
      timestamp: new Date()
    });

    res.json({
      success: true,
      intent,
      policyDecision,
      sessionId: validated.sessionId
    });
  } catch (error) {
    console.error('Intent recognition error:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Intent recognition failed'
    });
  }
});

export default router;