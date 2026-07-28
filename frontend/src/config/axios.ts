// src/config/axios.ts
import axios from 'axios';
import { useAuthStore } from '../features/auth/store/authStore';

// Es buena práctica usar variables de entorno para la URL de tu API
// En Vite se usa import.meta.env en lugar de process.env
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Opcional: timeout de 10 segundos para abortar peticiones colgadas
  timeout: 10000, 
});

/* 
 * 1. INTERCEPTOR DE PETICIONES (REQUEST)
 * Se ejecuta justo ANTES de que la petición salga hacia tu backend Django.
 */
axiosInstance.interceptors.request.use(
  (config) => {
    // TRUCO CLAVE: Como estamos fuera de un componente de React, 
    // no podemos usar `useAuthStore()` como hook. 
    // Usamos `.getState()` para leer el estado de Zustand directamente.
    const { tokens } = useAuthStore.getState();

    if (tokens?.access) {
      // Si existe el token, lo inyectamos en el header Authorization
      // Ajusta 'Bearer' si tu backend en Django usa otro prefijo (ej. 'JWT')
      config.headers.Authorization = `Bearer ${tokens.access}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/* 
 * 2. INTERCEPTOR DE RESPUESTAS (RESPONSE)
 * Se ejecuta cuando tu backend Django responde, ANTES de llegar a tus mutations.
 */
axiosInstance.interceptors.response.use(
  (response) => {
    // Si todo salió bien (status 2xx), dejamos pasar la respuesta intacta
    return response;
  },
  (error) => {
    // Si el servidor responde con error
    if (error.response) {
      // Detectamos error 401 (Unauthorized) - El token expiró o es inválido
      if (error.response.status === 401) {
        
        // Ejecutamos el logout en Zustand para limpiar los tokens locales
        useAuthStore.getState().logout();
        
        // Opcional: Forzar recarga o redirección al login 
        // (Aunque normalmente tu UI ya reaccionará al cambio de estado de Zustand)
        // window.location.href = '/login';
      }
    }
    
    // Devolvemos el error para que TanStack Query lo procese (isError: true)
    return Promise.reject(error);
  }
);

export default axiosInstance;