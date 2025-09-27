declare module 'express' {
  const express: any
  export const Router: any
  export const json: any
  export const urlencoded: any
  export type Application = any
  export type Request = any
  export type Response = any
  export type NextFunction = any
  export default express
}

declare module 'cors' {
  const middleware: any
  export default middleware
}

declare module 'socket.io' {
  export const Server: any
}

declare module 'ioredis' {
  const Redis: any
  export default Redis
}

declare module 'pino' {
  const pino: any
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
