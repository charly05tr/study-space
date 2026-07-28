import { Outlet } from 'react-router-dom';

export const AppLayout = () => {
  return (
    <div>
      {/* Barra de navegación superior */}
      <header>
        <div>Studyspace</div>
        <nav>
          <ul>
            <li><button>Profile</button></li>
            <li><button>Log Out</button></li>
          </ul>
        </nav>
      </header>

      <div>
        {/* Barra lateral de navegación (Sidebar) */}
        <aside>
          <nav>
            <ul>
              <li><a href="/studyspaces">My Studyspaces</a></li>
              <li><a href="/studyspaces/create">Create Studyspace</a></li>
              <li><a href="/settings">Settings</a></li>
            </ul>
          </nav>
        </aside>

        {/* Área donde cambia el contenido según la URL */}
        <main>
          {/* Aquí React Router inyectará <Studyspaces />, <Perfil />, etc. */}
          <Outlet />
        </main>
      </div>
      
      {/* Footer opcional */}
      <footer>
        <p>© 2026 Studyspace</p>
      </footer>
    </div>
  );
};