import express from 'express'
import { ManifestRefresherService } from '../services/ManifestRefresher'

type ExpressRouter = ReturnType<typeof express.Router>

export function manifestsRouter(refresher: ManifestRefresherService): ExpressRouter {
  const router = express.Router()

  router.get('/', async (_req, res) => {
    const manifests = await refresher.listManifests()
    const jobs = await refresher.listJobs()
    const lastRuns = jobs.reduce<Record<string, { driftScore?: number; status: string; updatedAt: string }>>(
      (acc, job) => {
        const previous = acc[job.service]
        if (!previous || previous.updatedAt < job.updatedAt) {
          acc[job.service] = {
            driftScore: job.driftScore,
            status: job.status,
            updatedAt: job.updatedAt
          }
        }
        return acc
      },
      {}
    )

    res.json(
      manifests.map((manifest) => ({
        service: manifest.name,
        lastModified: manifest.lastModified,
        source: manifest.source,
        driftScore: lastRuns[manifest.name]?.driftScore ?? null,
        lastJobStatus: lastRuns[manifest.name]?.status ?? null,
        lastJobAt: lastRuns[manifest.name]?.updatedAt ?? null
      }))
    )
  })

  router.get('/jobs/history', async (_req, res) => {
    const jobs = await refresher.listJobs()
    res.json(jobs)
  })

  router.post('/jobs/:jobId/approve', async (req, res) => {
    try {
      const job = await refresher.approve(req.params.jobId)
      res.json(job)
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  router.post('/jobs/:jobId/rollback', async (req, res) => {
    try {
      const job = await refresher.rollback(req.params.jobId)
      res.json(job)
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  router.get('/:service', async (req, res) => {
    const manifest = await refresher.getManifest(req.params.service)
    if (!manifest) {
      res.status(404).json({ error: 'Manifest not found' })
      return
    }

    res.json(manifest)
  })

  router.post('/:service/refresh', async (req, res) => {
    try {
      const job = await refresher.triggerRefresh(req.params.service, req.body)
      res.status(202).json(job)
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  return router
}
