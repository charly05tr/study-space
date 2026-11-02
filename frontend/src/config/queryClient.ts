import { QueryClient } from '@tanstack/react-query';

// Exported, not private to `main.tsx`: background AI review runs outlive the
// components that started them, so they invalidate queries through this client.
export const queryClient = new QueryClient({
  defaultOptions: {
    // Auth mutations surface their own errors; do not silently retry a bad login.
    mutations: { retry: false },
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});
