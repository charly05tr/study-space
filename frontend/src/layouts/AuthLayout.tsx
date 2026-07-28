import { Link, Outlet } from 'react-router-dom';
import { Divider } from '../components/ui';

export const AuthLayout = () => {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12">
      <header className="text-center">
        <Link to="/" className="font-display text-5xl text-ink">
          Studyspace
        </Link>
        <p className="mt-2 font-heading text-xs uppercase tracking-[0.3em] text-muted">
          Read. Annotate. Remember.
        </p>
        <Divider ornament className="mx-auto mt-5 w-40" />
      </header>

      <section className="w-full max-w-md">
        <Outlet />
      </section>
    </main>
  );
};
