'use client'

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '#services', label: 'Services' },
  { href: '#analytics', label: 'Analytics' },
  { href: '#manifest', label: 'Manifest' },
]

export function Navigation() {
  return (
    <header className="relative z-10">
      <nav className="container mx-auto px-6 pt-8">
        <div className="glass-card glass-outline flex flex-col gap-4 rounded-2xl px-6 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-[var(--text-soft)]">
              <span className="status-dot" />
              Neural Router Control Plane
            </div>
            <h1 className="mt-2 text-2xl font-semibold leading-tight text-[var(--text-primary)] md:text-3xl">
              Intent Operations Console
            </h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Endpoint:&nbsp;
              <span className="font-mono text-[var(--text-primary)]">
                {process.env.NEXT_PUBLIC_ROUTER_API_URL ?? 'http://localhost:8080'}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-soft)]">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-full border border-[rgba(255,255,255,0.12)] px-4 py-2 transition hover:border-[rgba(34,197,94,0.45)] hover:text-[var(--text-primary)]"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </nav>
    </header>
  )
}
