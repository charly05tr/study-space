import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Button, cn } from '../components/ui';
import { StudyspaceNav } from '../components/StudyspaceNav';
import { useAuthStore } from '../features/auth/store/authStore';
import { useThemeStore } from '../store/themeStore';

const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
  cn(
    'block border-l-2 py-1.5 pl-3 font-heading text-sm uppercase tracking-[0.12em] transition-colors',
    isActive
      ? 'border-primary text-ink'
      : 'border-transparent text-muted hover:border-rule hover:text-ink',
  );

export const AppLayout = () => {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggle);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Barra de navegación superior */}
      <header className="flex items-center justify-between border-b border-rule px-6 py-4">
        <Link to="/studyspaces" className="font-display text-2xl text-ink">
          Studyspace
        </Link>
        <nav>
          <ul className="flex items-center gap-2">
            <li>
              <Button
                variant="quiet"
                size="sm"
                aria-pressed={theme === 'dark'}
                onClick={toggleTheme}
              >
                {theme === 'dark' ? 'Light' : 'Dark'}
              </Button>
            </li>
            <li>
              <Button variant="quiet" size="sm" onClick={() => navigate('/profile')}>
                Profile
              </Button>
            </li>
            <li>
              <Button variant="secondary" size="sm" onClick={handleLogout}>
                Log Out
              </Button>
            </li>
          </ul>
        </nav>
      </header>

      <div className="flex flex-1 flex-col gap-8 md:flex-row">
        {/* Barra lateral de navegación (Sidebar) */}
        {/* Scrolls on its own once a studyspace has enough notes to outgrow the
            viewport, instead of stretching the page. */}
        <aside className="flex flex-col gap-6 border-b border-rule px-6 py-6 md:sticky md:top-0 md:max-h-dvh md:w-60 md:shrink-0 md:overflow-y-auto md:border-b-0 md:border-r">
          <nav>
            <ul className="flex flex-col gap-1">
              <li>
                {/* `end`: sin esto /studyspaces tambien matchea /studyspaces/create */}
                <NavLink to="/studyspaces" end className={navLinkClasses}>
                  My Studyspaces
                </NavLink>
              </li>
              <li>
                <NavLink to="/studyspaces/create" className={navLinkClasses}>
                  Create Studyspace
                </NavLink>
              </li>
              {/* Profile lives in the header. Repeating it here spent a sidebar
                  row on something you reach twice a month. */}
            </ul>
          </nav>

          {/* Only renders inside a studyspace; see StudyspaceNav. */}
          <StudyspaceNav />
        </aside>

        {/* Área donde cambia el contenido según la URL */}
        <main className="flex-1 px-6 py-8">
          <Outlet />
        </main>
      </div>

      {/* <footer className="border-t border-rule px-6 py-4">
        <p className="text-xs text-muted">© 2026 Studyspace</p>
      </footer> */}
    </div>
  );
};
