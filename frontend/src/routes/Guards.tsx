// src/routes/Guards.tsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../features/auth/store/authStore';

export const ProtectedRoute = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <Outlet />; 
};

export const PublicRoute = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  
  if (isAuthenticated) {
    return <Navigate to="/studyspaces" replace />;
  }
  
  return <Outlet />; 
};