import { Router } from 'express'
import { register } from 'prom-client'
import { MetaRouter } from '../services/MetaRouter'

export function metricsRouter(metaRouter?: MetaRouter): Router {
  const router = Router()

  router.get('/', async (_req, res) => {
    res.set('Content-Type', register.contentType)
    res.send(await register.metrics())
  })

  router.get('/summary', async (_req, res) => {
    if (!metaRouter) {
      res.json({})
      return
    }

    const metrics = await metaRouter.getMetrics()
    res.json(metrics)
  })

  return router
}
