import { Outlet } from 'react-router-dom';

export const ReaderLayout = () => {
  return (
    <div>
      {/* Barra de herramientas mínima y colapsable */}
      <header>
        <nav>
          <button>Go back to studyspace</button>
          
          {/* Controles de lectura */}
          <div>
            <button>Aa (typography)</button>
            <button>Dark Mode</button>
            <button>index</button>
          </div>
        </nav>
      </header>

      {/* Área de lectura inmersiva */}
      <main>
        {/* Aquí React Router inyectará <LectorHTML /> */}
        <Outlet />
      </main>
    </div>
  );
};