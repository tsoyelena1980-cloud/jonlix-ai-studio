FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --filter @jonlix/server...
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm --filter @jonlix/server build
WORKDIR /app/apps/server
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
