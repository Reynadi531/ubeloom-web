import { createAuthIdentifier, type BetterAuthInstance } from "evlog/better-auth";

import { auth } from "../../src/services";

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook(
    "request",
    createAuthIdentifier(auth as BetterAuthInstance, {
      exclude: ["/api/auth/**"],
      maskEmail: true,
    }),
  );
});
