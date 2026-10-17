import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './auth-context.js'

function Restoring() {
  return <p className="page-status">Loading…</p>
}

/** Renders child routes only for logged-in users; sends everyone else to /login. */
export function RequireAuth() {
  const { user, restoring } = useAuth()
  const location = useLocation()

  if (restoring) return <Restoring />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}

/** Keeps logged-in users off the login and register pages. */
export function RedirectIfAuthenticated() {
  const { user, restoring } = useAuth()
  const location = useLocation()

  if (restoring) return <Restoring />
  if (user) return <Navigate to={location.state?.from?.pathname ?? '/dashboard'} replace />
  return <Outlet />
}
