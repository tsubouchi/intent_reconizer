# Multi-stage Dockerfile for AGI Egg ISR Router
# Specify platform for Cloud Build compatibility
FROM --platform=linux/amd64 node:20-alpine AS builder

# Build argument for environment
ARG NODE_ENV=production

WORKDIR /app

# Copy package files first to leverage Docker layer caching
COPY package.json ./

# Install all dependencies including devDependencies for build
# Use --include=dev to ensure TypeScript is installed even with NODE_ENV=production
RUN npm install --ignore-scripts --include=dev

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Copy any other necessary files (excluding node_modules, dist)


# Build TypeScript
RUN npm run build

# Production image
FROM --platform=linux/amd64 node:20-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy package files and install production dependencies
COPY package.json ./
RUN npm install --ignore-scripts --omit=dev && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {if(r.statusCode !== 200) process.exit(1)})" || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "dist/index.js"]