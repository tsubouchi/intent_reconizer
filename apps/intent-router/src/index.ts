import express, { type Application } from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'
import Redis from 'ioredis'
import pino from 'pino'
import { Counter, Histogram, Gauge } from 'prom-client'
import CircuitBreaker from 'opossum'
import { IntentRecognitionEngine } from './services/IntentRecognitionEngine'
import { ServiceRegistry } from './services/ServiceRegistry'
import { MetaRouter } from './services/MetaRouter'
import { MLModelService } from './services/MLModelService'
import { IntentRequest } from './types'
import { healthRouter } from './routes/health'
import { metricsRouter } from './routes/metrics'
import { configRouter } from './routes/config'
import { manifestsRouter } from './routes/manifests'
import { ManifestRefresherService } from './services/ManifestRefresher'

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
})

const app: Application = express()
const server = createServer(app)
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

// Middleware
app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true }))

// Metrics
const requestCounter = new Counter({
  name: 'router_requests_total',
  help: 'Total requests',
  labelNames: ['service', 'intent', 'status']
})

const latencyHistogram = new Histogram({
  name: 'router_latency_seconds',
  help: 'Request latency',
  labelNames: ['service', 'intent']
})

const cacheHits = new Counter({
  name: 'router_cache_hits_total',
  help: 'Cache hits'
})

const cacheMisses = new Counter({
  name: 'router_cache_misses_total',
  help: 'Cache misses'
})

const activeConnections = new Gauge({
  name: 'router_active_connections',
  help: 'Active connections'
})

// Initialize services
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times: number) => Math.min(times * 50, 2000)
})

const serviceRegistry = new ServiceRegistry(logger)
const mlModelService = new MLModelService(logger, serviceRegistry)
const intentEngine = new IntentRecognitionEngine(
  serviceRegistry,
  mlModelService,
  redis,
  logger,
  { cacheHits, cacheMisses }
)
const metaRouter = new MetaRouter(serviceRegistry, intentEngine, logger)
const manifestRefresher = new ManifestRefresherService(logger)

// Circuit breaker for routing
const routingCircuitBreaker = new CircuitBreaker(
  async (request: IntentRequest) => {
    return await metaRouter.route(request)
  },
  {
    timeout: 30000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000
  }
)

routingCircuitBreaker.on('open', () => {
  logger.warn('Circuit breaker opened')
})

routingCircuitBreaker.on('halfOpen', () => {
  logger.info('Circuit breaker half-open')
})

routingCircuitBreaker.on('close', () => {
  logger.info('Circuit breaker closed')
})

// Routes
app.use('/health', healthRouter(serviceRegistry))
app.use('/metrics', metricsRouter(metaRouter))
app.use('/config', configRouter(intentEngine, metaRouter))
app.use('/manifests', manifestsRouter(manifestRefresher))

// Main routing endpoints
app.post('/intent/recognize', async (req, res) => {
  const startTime = Date.now()
  activeConnections.inc()

  try {
    const request: IntentRequest = req.body
    const response = await intentEngine.classifyIntent(request)

    requestCounter.inc({
      service: response.routing.targetService,
      intent: response.recognizedIntent.category,
      status: 'success'
    })

    latencyHistogram.observe(
      {
        service: response.routing.targetService,
        intent: response.recognizedIntent.category
      },
      (Date.now() - startTime) / 1000
    )

    res.json(response)
  } catch (error) {
    logger.error('Error recognizing intent:', error)
    requestCounter.inc({
      service: 'unknown',
      intent: 'unknown',
      status: 'error'
    })
    res.status(500).json({ error: 'Failed to recognize intent' })
  } finally {
    activeConnections.dec()
  }
})

app.post('/intent/analyze', async (req, res) => {
  try {
    const { text } = req.body
    const request: IntentRequest = { text }
    const response = await intentEngine.classifyIntent(request)
    res.json(response)
  } catch (error) {
    logger.error('Error analyzing intent:', error)
    res.status(500).json({ error: 'Failed to analyze intent' })
  }
})

app.post('/intent/test', async (req, res) => {
  try {
    const request: IntentRequest = req.body
    const route = await intentEngine.classifyIntent(request)

    const simulation = {
      wouldRoute: route.recognizedIntent.confidence >= 0.7,
      targetService: route.routing.targetService,
      estimatedLatency: route.routing.timeout * 0.1,
      confidence: route.recognizedIntent.confidence
    }

    res.json({ route, simulation })
  } catch (error) {
    logger.error('Error testing route:', error)
    res.status(500).json({ error: 'Failed to test route' })
  }
})

app.post('/route', async (req, res) => {
  try {
    const request: IntentRequest = {
      path: req.path,
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: req.body,
      context: {
        ip: req.ip,
        userAgent: req.get('user-agent')
      }
    }

    const result = await routingCircuitBreaker.fire(request)
    res.status(result.status).set(result.headers).send(result.body)
  } catch (error) {
    logger.error('Error routing request:', error)
    res.status(503).json({ error: 'Service temporarily unavailable' })
  }
})

// WebSocket for real-time monitoring
io.on('connection', (socket) => {
  logger.info('WebSocket client connected')

  socket.on('subscribe:metrics', () => {
    const interval = setInterval(async () => {
      const metrics = await metaRouter.getMetrics()
      socket.emit('metrics:update', metrics)
    }, 5000)

    socket.on('disconnect', () => {
      clearInterval(interval)
    })
  })

  socket.on('subscribe:health', () => {
    const interval = setInterval(async () => {
      const health = await serviceRegistry.getAllHealthStatus()
      socket.emit('health:update', health)
    }, 10000)

    socket.on('disconnect', () => {
      clearInterval(interval)
    })
  })
})

// Initialize services on startup
async function initialize() {
  try {
    // Load configurations
    await intentEngine.loadConfiguration()
    await metaRouter.loadRoutingRules()

    // Initialize ML models
    await mlModelService.initialize()

    // Start health check loop
    setInterval(async () => {
      await serviceRegistry.updateAllHealthStatus()
    }, 30000)

    // Initial health check
    await serviceRegistry.updateAllHealthStatus()

    logger.info('Services initialized successfully')
  } catch (error) {
    logger.error('Failed to initialize services:', error)
    process.exit(1)
  }
}

// Start server
const PORT = parseInt(process.env.PORT || '8080')

initialize().then(() => {
  server.listen(PORT, () => {
    logger.info(`Intent Recognition Router running on port ${PORT}`)
  })
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully')

  server.close(() => {
    redis.disconnect()
    process.exit(0)
  })
})

export { app, server }
