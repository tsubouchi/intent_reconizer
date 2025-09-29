declare module 'next/navigation' {
  export function redirect(path: string): never
  export function usePathname(): string | null
}

declare module 'next/link' {
  import type { AnchorHTMLAttributes, DetailedHTMLProps, ReactNode } from 'react'
  type LinkProps = DetailedHTMLProps<AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement> & {
    href: string
    children?: ReactNode
    prefetch?: boolean
  }
  const Link: (props: LinkProps) => JSX.Element
  export default Link
}
