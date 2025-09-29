import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createSession, getSession } from '../services/firestore';
import { z } from 'zod';

const router = Router();

const CreateSessionSchema = z.object({
  tenantId: z.string().optional(),
  userId: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional()
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const validated = CreateSessionSchema.parse(req.body);
    const sessionId = uuidv4();

    const session = {
      id: sessionId,
      ...validated,
      createdAt: new Date(),
      status: 'active' as const
    };

    await createSession(session);

    res.json({
      success: true,
      sessionId,
      session
    });
  } catch (error) {
    console.error('Session creation error:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Session creation failed'
    });
  }
});

router.get('/:sessionId', async (req: Request, res: Response) => {
  try {
    const session = await getSession(req.params.sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      session
    });
  } catch (error) {
    console.error('Session fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch session'
    });
  }
});

export default router;