import { definePlugin } from "nitro";
import { getEventContext } from "nitro/h3";
import { createAuthMiddleware, type BetterAuthInstance } from "evlog/better-auth";
import type { RequestLogger } from "evlog";

import { auth } from "../../src/services";

// evlog's createAuthIdentifier targets h3 v1 (event.headers / event.path);
// Nitro v3 events expose event.req (a web Request) instead.
const identify = createAuthMiddleware(auth as BetterAuthInstance, {
  exclude: ["/api/auth/**"],
  maskEmail: true,
});

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("request", async (event) => {
    const { log } = getEventContext<{ log?: RequestLogger }>(event);
    if (!log) return;
    await identify(log, event.req.headers, new URL(event.req.url).pathname);
  });
});
