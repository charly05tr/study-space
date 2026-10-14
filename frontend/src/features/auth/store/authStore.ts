import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, AuthTokens } from '../types';
import { DESKTOP_PLACEHOLDER_USER, IS_DESKTOP } from '../../../config/desktop';

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  
  // Acciones
  setCredentials: (user: User, tokens: AuthTokens) => void;
  /** Refresh sólo renueva el access token; el resto de la sesión sigue igual. */
  setTokens: (tokens: AuthTokens) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: IS_DESKTOP ? { ...DESKTOP_PLACEHOLDER_USER } : null,
      tokens: null,
      isAuthenticated: IS_DESKTOP,

      setCredentials: (user, tokens) =>
        set({ user, tokens, isAuthenticated: true }),

      setTokens: (tokens) => set({ tokens }),


      // Desktop mode has a single permanent local user: there is nothing to leave.
      logout: () => 
        IS_DESKTOP ? undefined : set({ user: null, tokens: null, isAuthenticated: false }),
    }),
    {
      name: 'auth-storage', // Guarda sesión automáticamente en localStorage
    }
  )
);