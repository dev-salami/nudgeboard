# Build from the monorepo root:
#   docker build -f apps/paylink-paypal/Dockerfile -t paylink-paypal .
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/paylink-paypal/package.json apps/paylink-paypal/package.json
COPY packages/paylink-core/package.json packages/paylink-core/package.json
RUN pnpm install --frozen-lockfile --filter paylink-paypal...
COPY packages/paylink-core packages/paylink-core
COPY apps/paylink-paypal apps/paylink-paypal
COPY tsconfig.base.json ./
RUN pnpm --filter paylink-paypal build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3030
ENV HOSTNAME=0.0.0.0
ENV DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data
COPY --from=build /app/apps/paylink-paypal/.next/standalone ./
COPY --from=build /app/apps/paylink-paypal/.next/static ./apps/paylink-paypal/.next/static
COPY --from=build /app/apps/paylink-paypal/public ./apps/paylink-paypal/public
USER node
VOLUME /data
EXPOSE 3030
WORKDIR /app/apps/paylink-paypal
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3030/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
