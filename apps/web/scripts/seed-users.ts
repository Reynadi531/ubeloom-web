import "varlock/auto-load";

import { createAuth } from "@web-kwu/auth";
import { createDb } from "@web-kwu/db";

import { ENV } from "../src/env";

type SeedUser = {
  name: string;
  email: string;
  password: string;
};

const users: SeedUser[] = [
  {
    name: process.env.SEED_ADMIN_NAME ?? "Admin",
    email: process.env.SEED_ADMIN_EMAIL ?? "admin@example.com",
    password: process.env.SEED_ADMIN_PASSWORD ?? "password123",
  },
];

if (ENV.NODE_ENV === "production" && !process.env.SEED_ADMIN_PASSWORD) {
  throw new Error("SEED_ADMIN_PASSWORD must be set when seeding in production");
}

const db = createDb(ENV);
const auth = createAuth(ENV, db);
const ctx = await auth.$context;

for (const seed of users) {
  const existing = await ctx.internalAdapter.findUserByEmail(seed.email);
  if (existing) {
    console.log(`skip ${seed.email} (already exists)`);
    continue;
  }

  const user = await ctx.internalAdapter.createUser(
    {
      name: seed.name,
      email: seed.email.toLowerCase(),
      emailVerified: true,
    },
    { method: "email-password" },
  );

  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(seed.password),
  });

  console.log(`created ${seed.email}`);
}

await db.$client.end();
