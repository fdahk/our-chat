import { Navigate } from "react-router-dom";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" replace />;
}

export default RequireAuth;