FROM oven/bun:1-alpine AS build
WORKDIR /app

# Build-time (Vite) config, from deploy.toml build_args.
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_LOGGER_API_BASE_URL
ARG VITE_LOGGER_INGEST_KEY
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_LOGGER_API_BASE_URL=$VITE_LOGGER_API_BASE_URL \
    VITE_LOGGER_INGEST_KEY=$VITE_LOGGER_INGEST_KEY

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

COPY . .
# Typecheck runs locally before deploy (vue-tsc needs Node); the image only bundles.
RUN bunx vite build && bun scripts/caddyfile.ts > /app/Caddyfile

FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY --from=build /app/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
