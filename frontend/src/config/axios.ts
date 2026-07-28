// src/config/axios.ts
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../features/auth/store/authStore';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

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
  reject: (error: any) => void;
}> = [];

// Función para procesar las peticiones que se quedaron en espera
const processQueue = (error: any, token: string | null = null) => {
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

// 2. INTERCEPTOR DE RESPONSE
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as CustomAxiosRequestConfig;

    // Si el error es 401 y no hemos reintentado esta petición aún
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      
      if (isRefreshing) {
        // Si YA estamos refrescando el token, ponemos esta petición en la cola a esperar
        return new Promise(function (resolve, reject) {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(axiosInstance(originalRequest)); // Reintenta la petición original
            },
            reject: (err: any) => {
              reject(err);
            },
          });
        });
      }

      // Marcamos que ya intentamos refrescar para evitar bucles infinitos
      originalRequest._retry = true;
      isRefreshing = true;

      const { tokens, user, setCredentials, logout } = useAuthStore.getState();
      const refreshToken = tokens?.refresh;

      if (!refreshToken) {
        // Si no hay refresh token, no hay nada que hacer: expulsar.
        logout();
        return Promise.reject(error);
      }

      try {
        // Usamos 'axios.post' nativo y no 'axiosInstance' 
        // para evitar que esta petición pase por los interceptores y cause un bucle
        const refreshResponse = await axios.post(`${BASE_URL}/users/token/refresh/`, {
          refresh: refreshToken,
        });

        // Asumiendo que tu backend devuelve { access: '...', refresh: '...' }
        // Ajusta esto según lo que devuelva exactamente tu API de Django
        const newTokens = refreshResponse.data;

        // 1. Actualizamos Zustand (necesitamos el user que ya teníamos)
        if (user) {
          setCredentials(user, newTokens);
        }

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