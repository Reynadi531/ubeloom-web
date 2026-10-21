FROM oven/bun:1 AS builder
WORKDIR /app

COPY . .
# Root postinstall runs varlock codegen for every app; env.ts files are committed, so skip it.
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --filter bot --production --ignore-scripts

FROM oven/bun:1-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder --chown=bun:bun /app/package.json /app/bunfig.toml ./
COPY --from=builder --chown=bun:bun /app/node_modules ./node_modules
COPY --from=builder --chown=bun:bun /app/packages ./packages
COPY --from=builder --chown=bun:bun /app/apps/bot ./apps/bot

# varlock reads .env.schema from the working directory; values come from the container env.
WORKDIR /app/apps/bot
USER bun
CMD ["bun", "src/index.ts"]
