import { routerConfig } from '../config'

export interface TelemetrySnapshot {
  service: string
  windowStart: string
  windowEnd: string
  cpuUtilization: number
  memoryUtilization: number
  p95LatencyMs: number
  errorRate: number
  requestsPerMinute: number
  costPerMillionRequests: number
}

export class TelemetryService {
  private cache = new Map<string, { snapshot: TelemetrySnapshot; expiresAt: number }>()

  getSnapshot(service: string): TelemetrySnapshot {
    const cached = this.cache.get(service)
    const now = Date.now()
    if (cached && cached.expiresAt > now) {
      return cached.snapshot
    }

    const snapshot = this.buildSyntheticSnapshot(service)
    this.cache.set(service, {
      snapshot,
      expiresAt: now + routerConfig.telemetryCacheTtlMs
    })
    return snapshot
  }

  private buildSyntheticSnapshot(service: string): TelemetrySnapshot {
    const now = Date.now()
    const windowEnd = new Date(now).toISOString()
    const windowStart = new Date(now - 60 * 60 * 1000).toISOString()

    const cpuUtilization = this.seededNumber(service, 0.3, 0.92)
    const memoryUtilization = this.seededNumber(service + '-mem', 0.25, 0.88)
    const p95LatencyMs = this.seededNumber(service + '-lat', 80, 900)
    const errorRate = this.seededNumber(service + '-err', 0.001, 0.08)
    const requestsPerMinute = this.seededNumber(service + '-rpm', 40, 2400)
    const costPerMillionRequests = this.seededNumber(service + '-cost', 8, 26)

    return {
      service,
      windowStart,
      windowEnd,
      cpuUtilization: this.round(cpuUtilization, 2),
      memoryUtilization: this.round(memoryUtilization, 2),
      p95LatencyMs: Math.round(p95LatencyMs),
      errorRate: this.round(errorRate, 3),
      requestsPerMinute: Math.round(requestsPerMinute),
      costPerMillionRequests: this.round(costPerMillionRequests, 2)
    }
  }

  private seededNumber(seed: string, min: number, max: number): number {
    let hash = 0
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash << 5) - hash + seed.charCodeAt(i)
      hash |= 0
    }
    const normalized = (hash >>> 0) / 2 ** 32
    return min + normalized * (max - min)
  }

  private round(value: number, digits: number): number {
    const factor = 10 ** digits
    return Math.round(value * factor) / factor
  }
}

export const telemetryService = new TelemetryService()
