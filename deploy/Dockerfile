# Runtime image only. Artifacts are built on the host by `./epi.sh build` (pnpm deploy), so this
# image build needs no network access beyond the pinned base image (offline-bundle friendly).
ARG EPI_NODE_IMAGE=docker.io/library/node:22-alpine
FROM ${EPI_NODE_IMAGE}
ENV NODE_ENV=production \
    PORT=8080 \
    EPI_WEB_DIST=/app/web
WORKDIR /app
COPY --chown=node:node build/api/ /app/
COPY --chown=node:node build/web/ /app/web/
COPY --chown=node:node deploy/entrypoint.sh /app/entrypoint.sh
USER node
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=6 \
  CMD wget -qO- http://127.0.0.1:8080/health/ready >/dev/null || exit 1
ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"]
