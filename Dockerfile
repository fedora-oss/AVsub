# Stage 1: Build
FROM node:22-slim AS builder
WORKDIR /app
ENV PNPM_CONFIG_STRICT_DEP_BUILDS=false

# Install build dependencies
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y python3 make g++

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install dependencies using cache mount for pnpm store
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install

COPY . .

# Generate the Prisma Client (javinizer.db models → @prisma/client)
RUN JAVINIZER_DATABASE_URL="file:./javinizer.db" npx prisma generate --schema=prisma/schema.prisma

# Build the Nuxt production output
RUN pnpm build

# Prune development-only dependencies to minimize production image size
RUN pnpm prune --prod --ignore-scripts

# Stage 2: Runtime
FROM mcr.microsoft.com/playwright:v1.59.1-noble
WORKDIR /app

# Copy production build output, schema, and pruned node_modules from builder
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

# Copy and setup entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose port
EXPOSE 3000

# Set default environment variables
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV MOVIE_DIRECTORY=/movies

ENTRYPOINT ["/entrypoint.sh"]
