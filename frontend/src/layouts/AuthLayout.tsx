import { Outlet } from 'react-router-dom';

export const AuthLayout = () => {
  return (
    <main>
      {/* Sección decorativa o logo (opcional) */}
      <section>
        <h1>Studyspace</h1>
        <p>Welcome</p>
      </section>

      {/* Contenedor principal del formulario */}
      <section>
        {/* Aquí React Router inyectará <Login /> o <Register /> */}
        <Outlet /> 
      </section>
    </main>
  );
};