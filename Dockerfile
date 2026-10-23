# Base images are pinned by digest: a deploy builds on exactly these bytes, never on whatever a
# moving tag points at that day. To update, see docs/ARCHITECTURE.md (Deployment).
FROM oven/bun:1.4.4-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a AS build
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

FROM caddy:2.11.7-alpine@sha256:eb4d35b7452d1ab6171fbdbe8d9275b2301dad6dad92115d91e19fb9b24d510f
COPY --from=build /app/dist /srv
COPY --from=build /app/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
