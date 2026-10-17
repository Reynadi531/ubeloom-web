import { redirect } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";

import { auth } from "../services";

export const authMiddleware = createMiddleware().server(async ({ next, request }) => {
  const session = await auth.api.getSession({
    headers: request.headers,
  });
  return next({
    context: { session },
  });
});

/** Rejects requests without a session by redirecting to the login page. */
export const requireAuthMiddleware = createMiddleware()
  .middleware([authMiddleware])
  .server(async ({ next, context }) => {
    if (!context.session) {
      throw redirect({ to: "/login" });
    }
    return next({
      context: { session: context.session },
    });
  });
