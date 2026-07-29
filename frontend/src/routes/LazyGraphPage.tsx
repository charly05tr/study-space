import { Suspense, lazy } from 'react';
import { Loading } from '../components/ui';

/**
 * The map, split into its own chunk.
 *
 * three.js and drei weigh more than the rest of the app put together. Imported
 * eagerly they are downloaded to render the login screen, for a view most
 * sessions never open. This lives in its own file rather than inside the router
 * so the router keeps exporting nothing but routes.
 */
const GraphPage = lazy(() =>
  import('../features/graph/pages/GraphPage').then((module) => ({ default: module.GraphPage })),
);

export const LazyGraphPage = () => (
  <Suspense fallback={<Loading full label="Loading the map" />}>
    <GraphPage />
  </Suspense>
);
