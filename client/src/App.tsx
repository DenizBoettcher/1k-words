import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import LoginPage from './pages/Login';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import Library from './pages/Library';
import Admin from './pages/Admin';
import { isLoggedIn, isAdmin } from './utils/authUtils';

function RequireAuth() {
  const loc = useLocation();
  return isLoggedIn() ? <Outlet /> : <Navigate to="/login" replace state={{ from: loc }} />;
}

function RequireAdmin() {
  return isAdmin() ? <Outlet /> : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireAuth />}>
          <Route path="/" element={<Home />} />
          <Route path="/library" element={<Library />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<Admin />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
