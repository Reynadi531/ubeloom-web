import { createRouter as createTanStackRouter } from "@tanstack/react-router";

import Loader from "./components/loader";
import NotFoundPage from "./components/storefront/not-found-page";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    // Loaders start on hover/touch, so most clicks land on data that is already loaded.
    defaultPreload: "intent",
    context: {},
    defaultPendingComponent: () => <Loader />,
    defaultNotFoundComponent: () => <NotFoundPage />,
  });

  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
