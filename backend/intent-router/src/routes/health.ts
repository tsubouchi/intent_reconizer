import express from 'express'
import { ServiceRegistry } from '../services/ServiceRegistry'

type ExpressRouter = ReturnType<typeof express.Router>

export function healthRouter(serviceRegistry: ServiceRegistry): ExpressRouter {
  const router = express.Router()

  router.get('/', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  router.get('/services', async (_req, res) => {
    const health = await serviceRegistry.getAllHealthStatus()
    res.json(health)
  })

  return router
}
