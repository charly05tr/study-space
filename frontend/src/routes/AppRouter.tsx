// src/routes/AppRouter.tsx
import { createBrowserRouter, Navigate } from 'react-router-dom';

// Importamos los Layouts
import { AuthLayout } from '../layouts/AuthLayout';
import { AppLayout } from '../layouts/AppLayout';
import { ReaderLayout } from '../layouts/ReaderLayout';

// Importamos los Guardianes
import { ProtectedRoute, PublicRoute } from './Guards';

const DummyPage = ({ title }: { title: string }) => <h1>{title}</h1>;

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/studyspaces" replace />,
  },
  
  // ==========================================
  // RUTAS PÚBLICAS (Envueltas por PublicRoute y AuthLayout)
  // ==========================================
  {
    element: <PublicRoute />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: '/login', element: <DummyPage title="Login page" /> },
          { path: '/register', element: <DummyPage title="Login Page" /> },
          // { path: '/recuperar-password', element: <ForgotPasswordPage /> },
        ],
      },
    ],
  },

  // ==========================================
  // RUTAS PRIVADAS (Envueltas por ProtectedRoute)
  // ==========================================
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/studyspaces', element: <DummyPage title="My Studyspaces" /> },
          { path: '/profile', element: <DummyPage title="Profile" /> },
        ],
      },
      {
        element: <ReaderLayout />,
        children: [
          { path: '/studyspace/:studyspaceId', element: <DummyPage title="studyspace" /> }, 
        ],
      },
    ],
  },
]);