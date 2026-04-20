import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'QuerySage — AI-Powered Postgres Query Optimizer' },
      { name: 'description', content: 'Connect your Postgres database and get AI-generated index recommendations in 60 seconds.' },
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
