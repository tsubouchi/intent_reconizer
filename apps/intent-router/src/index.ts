import path from 'path'
import { config as loadEnv } from 'dotenv'
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

const envFiles = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '..', '.env.local'),
  path.resolve(__dirname, '..', '..', '.env'),
  path.resolve(__dirname, '..', '..', '.env.local')
]

for (const envPath of [...new Set(envFiles)]) {
  loadEnv({ path: envPath, override: false })
}

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

type RedisClient = {
  get(key: string): Promise<string | null>
  setex(key: string, ttl: number, value: string): Promise<'OK'>
  disconnect(): void
  on(event: string, handler: (...args: any[]) => void): void
  status?: string
}

const redisRetryStrategy = (attempts: number): number => Math.min(attempts * 50, 2000)
const redisConnectTimeoutMs = Number.parseInt(process.env.REDIS_CONNECT_TIMEOUT ?? '2000', 10)
const redisCommandTimeoutMs = Number.parseInt(process.env.REDIS_COMMAND_TIMEOUT ?? '1000', 10)

const createInMemoryRedis = (): RedisClient => {
  const store = new Map<string, { value: string; expiresAt: number | null }>()

  return {
    status: 'ready',
    async get(key: string): Promise<string | null> {
      const entry = store.get(key)
      if (!entry) return null

      if (entry.expiresAt && entry.expiresAt < Date.now()) {
        store.delete(key)
        return null
      }

      return entry.value
    },
    async setex(key: string, ttl: number, value: string): Promise<'OK'> {
      const expiresAt = ttl > 0 ? Date.now() + ttl * 1000 : null
      store.set(key, { value, expiresAt })
      return 'OK'
    },
    disconnect(): void {
      store.clear()
    },
    on(): void {
      // in-memory fallback does not emit events
    }
  }
}

// Initialize services
const defaultRedisHost = 'redis-13585.c274.us-east-1-3.ec2.redns.redis-cloud.com'
const defaultRedisPort = 13585
const defaultRedisPassword = 'A30toc6b3f4yb5ug5avuawckd7j9zf5ghp4z43bie5klxrh6wrq'

const redisConnectionString =
  process.env.REDIS_URL || process.env.REDIS_CLUSTER || process.env.REDIS_CLUSTER_ENDPOINT

const redisHost = process.env.REDIS_HOST ?? defaultRedisHost
const redisPort = Number.parseInt(process.env.REDIS_PORT ?? `${defaultRedisPort}`, 10)
const redisPassword =
  process.env.REDIS_PASSWORD ?? process.env.REDIS_API_KEY ?? defaultRedisPassword

const redisTlsOptions = (() => {
  if (process.env.REDIS_TLS === 'true') {
    return {
      tls: {
        rejectUnauthorized: process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== 'false'
      }
    }
  }

  if (process.env.REDIS_TLS === 'false') {
    return undefined
  }

  if (redisConnectionString?.trim().startsWith('rediss://')) {
    return {
      tls: {
        rejectUnauthorized: process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== 'false'
      }
    }
  }

  if ((process.env.REDIS_HOST ?? defaultRedisHost) === defaultRedisHost) {
    return {
      tls: {
        rejectUnauthorized: process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== 'false'
      }
    }
  }

  return undefined
})()

const redisBaseOptions: Record<string, unknown> = {
  retryStrategy: redisRetryStrategy,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  connectTimeout: redisConnectTimeoutMs,
  commandTimeout: redisCommandTimeoutMs,
  ...(redisTlsOptions ?? {})
}

const createRedisClient = (): { client: RedisClient; inMemory: boolean } => {
  if (process.env.REDIS_DISABLED === 'true') {
    logger.warn('REDIS_DISABLED=true; using in-memory cache only')
    return { client: createInMemoryRedis(), inMemory: true }
  }

  try {
    if (redisConnectionString) {
      return {
        client: new Redis(redisConnectionString, redisBaseOptions),
        inMemory: false
      }
    }

    return {
      client: new Redis({
        ...redisBaseOptions,
        host: redisHost,
        port: redisPort,
        password: redisPassword
      }),
      inMemory: false
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize Redis client; using in-memory cache')
    return { client: createInMemoryRedis(), inMemory: true }
  }
}

const { client: redis, inMemory: redisInMemory } = createRedisClient()

if (!redisInMemory) {
  redis.on('error', (error: Error) => {
    logger.error({ err: error }, 'Redis connection error')
  })

  redis.on('ready', () => {
    logger.info('Connected to Redis cache')
  })
} else {
  logger.warn('Redis unavailable; caching will run in in-memory fallback mode')
}

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
