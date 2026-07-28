import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, AuthTokens } from '../types';

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  
  // Acciones
  setCredentials: (user: User, tokens: AuthTokens) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      isAuthenticated: false,

      setCredentials: (user, tokens) => 
        set({ user, tokens, isAuthenticated: true }),
        
      logout: () => 
        set({ user: null, tokens: null, isAuthenticated: false }),
    }),
    {
      name: 'auth-storage', // Guarda sesión automáticamente en localStorage
    }
  )
);