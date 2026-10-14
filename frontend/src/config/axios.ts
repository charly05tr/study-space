// src/config/axios.ts
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../features/auth/store/authStore';
import type { AuthTokens } from '../features/auth/types';
import { IS_DESKTOP } from './desktop';

const BASE_URL = IS_DESKTOP ? '/api' : import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Variables para manejar la concurrencia del Refresh Token
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

// Función para procesar las peticiones que se quedaron en espera
const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// 1. INTERCEPTOR DE REQUEST
axiosInstance.interceptors.request.use(
  (config) => {
    // Desktop mode: the backend authenticates the local user on its own.
    if (IS_DESKTOP) return config;
    const { tokens } = useAuthStore.getState();
    if (tokens?.access) {
      config.headers.Authorization = `Bearer ${tokens.access}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Extender la interfaz de config para agregar nuestra bandera personalizada
interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

/**
 * ¿Este error significa "tu access token venció" y no "no tenés permiso"?
 *
 * Lo correcto es un 401, pero DRF arma el header WWW-Authenticate con la
 * PRIMERA clase de DEFAULT_AUTHENTICATION_CLASSES y, si esa no aporta ninguno,
 * degrada el 401 a 403. SimpleJWT manda `code: "token_not_valid"` en las dos
 * variantes, así que se mira el cuerpo y el refresh sobrevive a esa diferencia
 * de configuración del backend.
 */
const isExpiredToken = (error: AxiosError): boolean => {
  const status = error.response?.status;
  if (status === 401) return true;

  const code = (error.response?.data as { code?: string } | undefined)?.code;
  return status === 403 && code === 'token_not_valid';
};

// 2. INTERCEPTOR DE RESPONSE
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as CustomAxiosRequestConfig;

    // Si el token venció y no hemos reintentado esta petición aún
    if (!IS_DESKTOP && isExpiredToken(error) && originalRequest && !originalRequest._retry) {

      if (isRefreshing) {
        // Si YA estamos refrescando el token, ponemos esta petición en la cola a esperar
        // La marcamos igual: si el reintento vuelve a fallar, se rechaza en vez
        // de disparar una segunda ronda de refresh.
        originalRequest._retry = true;
        return new Promise(function (resolve, reject) {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(axiosInstance(originalRequest)); // Reintenta la petición original
            },
            reject: (err: unknown) => {
              reject(err);
            },
          });
        });
      }

      // Marcamos que ya intentamos refrescar para evitar bucles infinitos
      originalRequest._retry = true;
      isRefreshing = true;

      const { tokens, setTokens, logout } = useAuthStore.getState();
      const refreshToken = tokens?.refresh;

      if (!refreshToken) {
        // Si no hay refresh token, no hay nada que hacer: expulsar.
        logout();
        return Promise.reject(error);
      }

      try {
        // Usamos 'axios.post' nativo y no 'axiosInstance' 
        // para evitar que esta petición pase por los interceptores y cause un bucle
        // La ruta real es /api/auth/refresh/ (config/urls.py), no /api/users/token/refresh/
        const refreshResponse = await axios.post(`${BASE_URL}/auth/refresh/`, {
          refresh: refreshToken,
        });

        // TokenRefreshView devuelve SÓLO { access }: ROTATE_REFRESH_TOKENS no
        // está activado en el backend. Se parte del refresh token actual porque
        // guardar la respuesta tal cual lo borraba del store, y la sesión moría
        // en el siguiente vencimiento. El spread respeta una eventual rotación.
        const newTokens: AuthTokens = {
          refresh: refreshToken,
          ...(refreshResponse.data as Partial<AuthTokens>),
        } as AuthTokens;

        // 1. Actualizamos Zustand. Sin tocar el user: renovar el access token
        //    no es un login, y depender de él dejaba la sesión sin guardar
        //    cuando el store tenía tokens pero todavía no el perfil.
        setTokens(newTokens);

        // 2. Procesamos la cola: le damos el nuevo token a las peticiones en espera
        processQueue(null, newTokens.access);

        // 3. Reintentamos la petición original que disparó el error
        originalRequest.headers.Authorization = `Bearer ${newTokens.access}`;
        return axiosInstance(originalRequest);

      } catch (refreshError) {
        // Si el refresh token también falló (expiró o es inválido)
        processQueue(refreshError, null);
        logout(); // Ahora sí, matamos la sesión
        return Promise.reject(refreshError);
      } finally {
        // Pase lo que pase, liberamos el bloqueo
        isRefreshing = false;
      }
    }

    // Si es cualquier otro error (400, 404, 500) o si ya se reintentó, lo dejamos pasar
    return Promise.reject(error);
  }
);

export default axiosInstance;