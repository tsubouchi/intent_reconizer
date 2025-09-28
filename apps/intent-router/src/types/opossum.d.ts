declare module 'opossum' {
  import { EventEmitter } from 'events'

  interface CircuitBreakerOptions {
    timeout?: number
    errorThresholdPercentage?: number
    resetTimeout?: number
  }

  export default class CircuitBreaker<T = unknown, R = unknown> extends EventEmitter {
    constructor(action: (input: T) => Promise<R>, options?: CircuitBreakerOptions)
    fire(args: T): Promise<R>
    fallback(handler: (error: Error) => R): void
    close(): void
    open(): void
    halfOpen(): void
  }
}
