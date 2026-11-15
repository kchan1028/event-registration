# CycleReg web service image (ADR 0004: a plain Node.js container that can move between platforms).
# Builds the React app, then runs the Fastify API, which also serves the built app.
# Not deployed anywhere yet: see docs/runbooks/deploy-render.md.
FROM node:20.19.6-bookworm-slim

WORKDIR /app

# Install with dev dependencies: the build needs Vite, and the server runs TypeScript through tsx.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json vite.config.ts ./
COPY src ./src
RUN npm run build

ENV NODE_ENV=production
# Render's default port; Render also sets PORT itself. HOST stays 127.0.0.1 unless set; see src/server/listen.ts.
ENV PORT=10000
EXPOSE 10000
USER node

# One Node.js process (no npm or npx wrapper), so SIGTERM reaches the server's graceful shutdown.
CMD ["node", "--import", "tsx", "src/server/index.ts"]
