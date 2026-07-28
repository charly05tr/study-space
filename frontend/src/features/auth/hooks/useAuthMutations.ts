// src/features/auth/hooks/useAuthMutations.ts
import { useMutation } from '@tanstack/react-query';
import { authApi } from '../api/auth.api';
import { useAuthStore } from '../store/authStore';
import type { LoginPayload, RegisterPayload, ActivatePayload } from '../types';

export const useLoginMutation = () => {
  const setCredentials = useAuthStore((state) => state.setCredentials);

  return useMutation({
    mutationFn: (credentials: LoginPayload) => authApi.login(credentials),
    onSuccess: (data) => {
      // Si el login es exitoso, guardamos el usuario y los tokens en Zustand
      setCredentials(data.user, data.tokens);
    },
  });
};

export const useRegisterMutation = () => {
  return useMutation({
    mutationFn: (userData: RegisterPayload) => authApi.register(userData),
    // onSuccess: No seteamos credenciales aquí porque tu backend no devuelve tokens
    // en el registro. El componente UI usará el éxito para redirigir.
  });
};

export const useActivateMutation = () => {
  const setCredentials = useAuthStore((state) => state.setCredentials);

  return useMutation({
    mutationFn: (payload: ActivatePayload) => authApi.activate(payload),
    onSuccess: (data) => {
      // Tu backend devuelve tokens al activar exitosamente. Iniciamos sesión.
      setCredentials(data.user, data.tokens);
    },
  });
};

export const useResendCodeMutation = () => {
  return useMutation({
    mutationFn: (email: string) => authApi.resendVerificationCode(email),
  });
};
