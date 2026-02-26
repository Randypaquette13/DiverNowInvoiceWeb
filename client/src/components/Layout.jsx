import { Outlet, NavLink } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { logout } from '../api';

export default function Layout() {
  const queryClient = useQueryClient();

  async function handleLogout() {
    await logout();
    queryClient.clear();
    window.location.href = '/login';
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex gap-6">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              isActive ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'
            }
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/associate"
            className={({ isActive }) =>
              isActive ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'
            }
          >
            Associate
          </NavLink>
          <NavLink
            to="/analytics"
            className={({ isActive }) =>
              isActive ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'
            }
          >
            Analytics
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              isActive ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'
            }
          >
            Settings
          </NavLink>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="text-gray-600 hover:text-gray-900 text-sm"
        >
          Log out
        </button>
      </nav>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
