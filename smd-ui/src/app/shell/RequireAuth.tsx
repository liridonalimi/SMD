import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getToken } from "../../services/token";

export default function RequireAuth() {
  const loc = useLocation();
  const token = getToken();

  if (!token) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <Outlet />;
}
