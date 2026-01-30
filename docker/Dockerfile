# syntax=docker/dockerfile:1

# ── PocketBase binary (per target platform) ──────────────────────────────────

FROM alpine:latest AS binary-downloader

ARG POCKETBASE_VERSION=0.26.2
ARG TARGETARCH

WORKDIR /tmp

RUN --mount=type=cache,target=/var/cache/apk \
    apk add curl unzip \
    && ARCH=$(case "$TARGETARCH" in \
        arm64) echo "linux_arm64" ;; \
        amd64) echo "linux_amd64" ;; \
        *) echo "Unsupported architecture: $TARGETARCH" >&2 && exit 1 ;; \
    esac) \
    && curl -fsSL "https://github.com/pocketbase/pocketbase/releases/download/v${POCKETBASE_VERSION}/pocketbase_${POCKETBASE_VERSION}_${ARCH}.zip" -o pocketbase.zip \
    && unzip -q pocketbase.zip \
    && chmod +x pocketbase \
    && rm pocketbase.zip

# ── Bun binary (per target platform) ─────────────────────────────────────────

FROM oven/bun:1.2.4 AS bun-bin

# ── Install external plugin runtime dependencies ────────────────────────────

FROM oven/bun:1.2.4 AS plugin-deps

WORKDIR /app

COPY plugins/ ./plugins/

# Create a minimal workspace containing only the plugins, then install their
# runtime dependencies (discord.js, telegraf, googleapis, dockerode, …).
RUN printf '{"private":true,"workspaces":["plugins/*"]}\n' > package.json \
    && bun install --production

# ── Final image ──────────────────────────────────────────────────────────────

FROM nginx:bookworm AS final

COPY --from=bun-bin /usr/local/bin/bun /usr/local/bin/bun

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean \
    && apt-get update \
    && apt-get install -y --no-install-recommends supervisor \
    && mkdir -p /var/log/supervisor /app/db/pb_data /app/skills /app/output

WORKDIR /app

COPY server/dist/index.js ./server/dist/index.js
COPY client/dist /usr/share/nginx/html
COPY db/pb_migrations /app/db/pb_migrations

# External plugins (source — Bun runs TypeScript natively) and their
# pre-installed node_modules (discord.js, telegraf, googleapis, …)
COPY plugins /app/plugins
COPY --from=plugin-deps /app/node_modules /app/node_modules

COPY --from=binary-downloader /tmp/pocketbase /usr/local/bin/pocketbase

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh

# The bundled server computes PROJECT_ROOT via import.meta.dir which resolves
# to /app/server/dist → 3× dirname = "/". Override so the plugin-loader finds
# the plugins directory at the correct path.
ENV PLUGINS_DIR=/app/plugins

EXPOSE 80

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
