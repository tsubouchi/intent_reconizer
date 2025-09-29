declare module 'express' {
  const express: any
  export type Application = any
  export type Request = any
  export type Response = any
  export type NextFunction = any
  export interface Router extends Record<string, any> {}
  export function Router(): Router
  export function json(...args: any[]): any
  export function urlencoded(...args: any[]): any
  export default express
}

declare module 'cors' {
  const middleware: any
  export default middleware
}

declare module 'socket.io' {
  export const Server: any
}

declare module 'pino' {
  export type Logger = any
  const pino: (...args: any[]) => Logger
  export default pino
}

declare module 'pino-pretty' {
  const pretty: any
  export default pretty
}

declare module 'opossum' {
  const CircuitBreaker: any
  export default CircuitBreaker
}
declare module '@google-cloud/firestore' {
  export default class Firestore {
    constructor(options?: Record<string, any>)
    collection(path: string): any
  }
}

declare module '@google-cloud/secret-manager' {
  export class SecretManagerServiceClient {
    constructor(options?: Record<string, any>)
    accessSecretVersion(request: Record<string, any>): Promise<any>
  }
  export default SecretManagerServiceClient
}
