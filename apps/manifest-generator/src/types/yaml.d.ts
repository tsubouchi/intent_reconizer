declare module 'yaml' {
  export type ParseOptions = Record<string, unknown>
  export type StringifyOptions = Record<string, unknown>

  export function parse<T = any>(source: string, options?: ParseOptions): T
  export function stringify(value: unknown, options?: StringifyOptions): string

  const YAML: {
    parse<T = any>(source: string, options?: ParseOptions): T
    stringify(value: unknown, options?: StringifyOptions): string
  }

  export default YAML
}
