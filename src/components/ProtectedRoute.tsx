import { Navigate } from 'react-router-dom';

export default function ProtectedRoute({ userSession, children }: { userSession: any; children: React.ReactNode }) {
  if (!userSession) return <Navigate to="/" replace />;
  return <>{children}</>;
}
