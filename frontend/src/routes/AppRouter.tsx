// src/routes/AppRouter.tsx
import { createBrowserRouter, Navigate } from 'react-router-dom';

// Importamos los Layouts
import { AuthLayout } from '../layouts/AuthLayout';
import { AppLayout } from '../layouts/AppLayout';
import { ReaderLayout } from '../layouts/ReaderLayout';

// Importamos los Guardianes
import { ProtectedRoute, PublicRoute } from './Guards';

import { LoginPage } from '../features/auth/pages/LoginPage';
import { RegisterPage } from '../features/auth/pages/RegisterPage';
import { ActivateAccountPage } from '../features/auth/pages/ActivateAccountPage';
import { StudyspacesPage } from '../features/studyspaces/pages/StudyspacesPage';
import { CreateStudyspacePage } from '../features/studyspaces/pages/CreateStudyspacePage';
import { StudyspaceDetailPage } from '../features/studyspaces/pages/StudyspaceDetailPage';
import { ReaderPage } from '../features/reader/pages/ReaderPage';
import { SessionsPage } from '../features/sessions/pages/SessionsPage';
import { PlanPage } from '../features/planning/pages/PlanPage';
import { ProfilePage } from '../features/profile/pages/ProfilePage';
import { NotePage } from '../features/notes/pages/NotePage';
import { LazyGraphPage } from './LazyGraphPage';

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
          // El detalle es un hub (sources, notes, references), no una vista de
          // lectura: va en AppLayout, no en ReaderLayout.
          { path: '/studyspace/:studyspaceId', element: <StudyspaceDetailPage /> },
          // Nested under the studyspace so the sidebar keeps showing its
          // notes and sources: useActiveStudyspaceId matches with end:false.
          { path: '/studyspace/:studyspaceId/graph', element: <LazyGraphPage /> },
          // Nested for the same reason as the map: the sidebar keeps showing
          // the studyspace this history belongs to.
          { path: '/studyspace/:studyspaceId/sessions', element: <SessionsPage /> },
          // El calendario quiere el ancho completo de la pagina, asi que va en
          // su propia ruta y no como seccion del detalle. Anidado como el mapa
          // para que el sidebar siga mostrando este studyspace.
          { path: '/studyspace/:studyspaceId/plan', element: <PlanPage /> },
          // El editor es escritura, no lectura: va en AppLayout como el hub, no
          // en ReaderLayout.
          { path: '/note/:noteId', element: <NotePage /> },
          { path: '/profile', element: <ProfilePage /> },
        ],
      },
      {
        element: <ReaderLayout />,
        children: [{ path: '/source/:sourceId', element: <ReaderPage /> }],
      },
    ],
  },
]);
