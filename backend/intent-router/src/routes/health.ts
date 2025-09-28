import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'intent-router',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

router.get('/ready', (_req: Request, res: Response) => {
  // Check dependencies here (Firestore, Gemini API, etc.)
  res.json({
    status: 'ready',
    service: 'intent-router',
    timestamp: new Date().toISOString()
  });
});

export default router;