# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY hermes-idea-queue/package.json hermes-idea-queue/package-lock.json* /app/hermes-idea-queue/
WORKDIR /app/hermes-idea-queue
RUN npm install --omit=optional

COPY hermes-idea-queue/ /app/hermes-idea-queue/
RUN npm run build && mkdir -p dist/hitl && cp -r src/hitl/public dist/hitl/public

# Repo mount expected at /workspace
ENV REPO_ROOT=/workspace
ENV BACKLOG_PATH=/workspace/hermes-idea-queue/data/sample-backlog.json
ENV CURSOR_DRY_RUN=true

CMD ["node", "dist/index.js", "all"]
