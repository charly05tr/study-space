import { Outlet } from 'react-router-dom';

/**
 * Immersive reading shell: no app chrome, no sidebar, no footer.
 * The toolbar lives in the reader page itself because its controls act on the
 * document inside the frame.
 */
export const ReaderLayout = () => {
  return (
    <div className="h-dvh overflow-hidden bg-page">
      <Outlet />
    </div>
  );
};
