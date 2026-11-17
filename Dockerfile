# Build stage: compile the Vite UI, API bundle, and portable Express server.
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm run build:server && npm prune --omit=dev

# Runtime stage contains only production dependencies and compiled assets.
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server.bundle.js ./server.bundle.js

USER node
EXPOSE 3000
CMD ["node", "server.bundle.js"]
