# Builder stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.27.0 --activate

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build TypeScript
RUN pnpm run build

# Runner stage
FROM node:22-alpine

LABEL org.opencontainers.image.source="https://github.com/KeeperHub/keeperhub-mcp"
LABEL org.opencontainers.image.description="MCP server for KeeperHub workflow automation"
LABEL org.opencontainers.image.licenses="MIT"
LABEL io.modelcontextprotocol.server.name="io.github.KeeperHub/keeperhub-mcp"

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.27.0 --activate

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Expose port for HTTP mode (optional)
EXPOSE 3000

# Run the server
CMD ["node", "dist/index.js"]
