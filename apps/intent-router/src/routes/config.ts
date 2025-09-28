import express from 'express'
import { IntentRecognitionEngine } from '../services/IntentRecognitionEngine'
import { MetaRouter } from '../services/MetaRouter'

type ExpressRouter = ReturnType<typeof express.Router>

export function configRouter(
  intentEngine: IntentRecognitionEngine,
  metaRouter: MetaRouter
): ExpressRouter {
  const router = express.Router()

  router.get('/rules', (_req, res) => {
    const rules = intentEngine.getRoutingRules()
    res.json(rules)
  })

  router.post('/reload', async (_req, res) => {
    await intentEngine.loadConfiguration()
    await metaRouter.loadRoutingRules()
    res.json({ success: true, message: 'Configuration reloaded' })
  })

  return router
}
