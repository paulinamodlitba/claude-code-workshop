import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Boka Claude Code-workshop',
  description: 'Välj datum och boka din plats, eller anmäl intresse',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  )
}
