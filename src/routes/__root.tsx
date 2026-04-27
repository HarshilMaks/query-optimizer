import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Postgres Guardrails — Safe, Provable Performance Platform' },
      { name: 'description', content: 'Detect risky query regressions, validate recommendations, and enforce approval guardrails with immutable audit trails.' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="bg-slate-950 text-white antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  )
}
