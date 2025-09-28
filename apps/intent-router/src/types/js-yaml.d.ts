declare module 'js-yaml' {
  export function load(str: string, opts?: Record<string, unknown>): any
  export function dump(obj: any, opts?: Record<string, unknown>): string
}
