import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = uuidv4();
  const startTime = Date.now();

  // Add request ID to headers
  res.setHeader('X-Request-Id', requestId);

  // Log request
  console.log({
    type: 'request',
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    headers: {
      'user-agent': req.headers['user-agent'],
      'content-type': req.headers['content-type']
    },
    timestamp: new Date().toISOString()
  });

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log({
      type: 'response',
      requestId,
      statusCode: res.statusCode,
      duration,
      timestamp: new Date().toISOString()
    });
  });

  next();
}