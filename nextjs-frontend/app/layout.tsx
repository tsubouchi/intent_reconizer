import type { ReactNode } from 'react'
import './globals.css'
import './matrix.css'
import { Providers } from './providers'
import { Navigation } from '@/components/layout/Navigation'
import { IntentMonitor } from '@/components/monitoring/IntentMonitor'

export const metadata = {
  title: '[SYSTEM] Neural Router v1.0',
  description: 'Matrix Neural Network Routing System',
}

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="scanline"></div>
          <div className="min-h-screen relative" style={{zIndex: 10}}>
            <Navigation />
            <main className="container mx-auto px-4 py-8">
              {children}
            </main>
            <IntentMonitor />
          </div>
        </Providers>
      </body>
    </html>
  )
}
