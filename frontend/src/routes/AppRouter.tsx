// src/routes/AppRouter.tsx
import { createBrowserRouter, Navigate } from 'react-router-dom';

// Importamos los Layouts
import { AuthLayout } from '../layouts/AuthLayout';
import { AppLayout } from '../layouts/AppLayout';
import { ReaderLayout } from '../layouts/ReaderLayout';

// Importamos los Guardianes
import { ProtectedRoute, PublicRoute } from './Guards';

import { DummyPage } from './DummyPage';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { RegisterPage } from '../features/auth/pages/RegisterPage';
import { ActivateAccountPage } from '../features/auth/pages/ActivateAccountPage';
import { StudyspacesPage } from '../features/studyspaces/pages/StudyspacesPage';
import { CreateStudyspacePage } from '../features/studyspaces/pages/CreateStudyspacePage';

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
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
          { path: '/activate', element: <ActivateAccountPage /> },
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
          { path: '/studyspaces', element: <StudyspacesPage /> },
          { path: '/studyspaces/create', element: <CreateStudyspacePage /> },
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
