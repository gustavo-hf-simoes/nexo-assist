# Contexto de build na raiz do repositório (@nexo/domain é uma dependência do workspace):
#   docker build -f services/tickets/Dockerfile .
FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/domain/package.json packages/domain/
COPY services/tickets/package.json services/tickets/
RUN npm ci --workspace @nexo/tickets --workspace @nexo/domain --include-workspace-root=false

FROM node:26-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node packages/domain packages/domain
COPY --chown=node:node --from=deps /app/packages/domain/node_modules packages/domain/node_modules
COPY --chown=node:node services/tickets services/tickets
COPY --chown=node:node --from=deps /app/services/tickets/node_modules services/tickets/node_modules
USER node
WORKDIR /app/services/tickets
EXPOSE 4010
CMD ["../../node_modules/.bin/tsx", "src/index.ts"]
