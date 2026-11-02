FROM node:22-bookworm-slim AS workspace
WORKDIR /workspace
RUN corepack enable
COPY . .
RUN pnpm install --no-frozen-lockfile

FROM workspace AS api
RUN pnpm --filter @pondok-os/api build
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]

FROM workspace AS web-build
ARG VITE_NEON_AUTH_URL
ENV VITE_NEON_AUTH_URL=${VITE_NEON_AUTH_URL}
RUN pnpm --filter @pondok-os/web build

FROM nginx:1.27-alpine AS web
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /workspace/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1