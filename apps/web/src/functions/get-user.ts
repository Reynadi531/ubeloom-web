import { createServerFn } from "@tanstack/react-start";

import { authMiddleware, requireAuthMiddleware } from "@/middleware/auth";

export const getUser = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return context.session;
  });

/** Like `getUser`, but redirects to the login page when there is no session. */
export const requireUser = createServerFn({ method: "GET" })
  .middleware([requireAuthMiddleware])
  .handler(async ({ context }) => {
    return context.session;
  });
