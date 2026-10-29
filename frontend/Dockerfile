# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
WORKDIR /app

# --- deps: install once, reuse in both dev and build ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# --- dev: full sources with hot reload, used by docker-compose.override.yml ---
FROM base AS dev
ENV NEXT_TELEMETRY_DISABLED=1
# The source bind mount covers /app at runtime, so keep a clean Linux install
# outside it for the Compose entry command to copy into its node_modules volume.
COPY --from=deps /app/node_modules /opt/spry-node-modules
COPY . .
EXPOSE 3000
CMD ["pnpm", "dev"]

# --- builder ---
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* is inlined at build time, so it has to be present here too.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_AGENDA_PARSER_URL=
ENV NEXT_PUBLIC_AGENDA_PARSER_URL=$NEXT_PUBLIC_AGENDA_PARSER_URL
# Compiled into the bundle, like the API URL. Written by make deploy-cognito.
ARG NEXT_PUBLIC_COGNITO_REGION=us-east-1
ARG NEXT_PUBLIC_COGNITO_CLIENT_ID=
ARG NEXT_PUBLIC_COGNITO_DOMAIN=
ARG NEXT_PUBLIC_COGNITO_GOOGLE_ENABLED=false
ARG NEXT_PUBLIC_ALLOW_DEV_AUTH=false
ENV NEXT_PUBLIC_COGNITO_REGION=$NEXT_PUBLIC_COGNITO_REGION \
    NEXT_PUBLIC_COGNITO_CLIENT_ID=$NEXT_PUBLIC_COGNITO_CLIENT_ID \
    NEXT_PUBLIC_COGNITO_DOMAIN=$NEXT_PUBLIC_COGNITO_DOMAIN \
    NEXT_PUBLIC_COGNITO_GOOGLE_ENABLED=$NEXT_PUBLIC_COGNITO_GOOGLE_ENABLED \
    NEXT_PUBLIC_ALLOW_DEV_AUTH=$NEXT_PUBLIC_ALLOW_DEV_AUTH
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# --- runtime ---
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000
CMD ["node", "server.js"]
