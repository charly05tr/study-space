import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
// KaTeX's own stylesheet, and it is not optional: without it every formula
// renders as a vertical pile of unpositioned spans. Imported before index.css so
// the note's own math rules land after it and win — see the block-math styles.
import 'katex/dist/katex.min.css'
import './index.css'
import { router } from './routes/AppRouter'
import { NotificationProvider } from './components/ui'
import { ThemeSync } from './components/ThemeSync'

const queryClient = new QueryClient({
  defaultOptions: {
    // Auth mutations surface their own errors; do not silently retry a bad login.
    mutations: { retry: false },
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <ThemeSync />
        <RouterProvider router={router} />
      </NotificationProvider>
    </QueryClientProvider>
  </StrictMode>,
)
