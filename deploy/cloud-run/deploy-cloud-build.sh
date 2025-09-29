#!/bin/bash

# AGI Egg ISR Router - Cloud Build Deployment Script
# This script deploys the ISR Router to Google Cloud Run using Cloud Build

set -e

# Configuration
PROJECT_ID="agi-egg-production"
PROJECT_NUMBER="1028435695123"
REGION="us-central1"
SERVICE_NAME="agi-egg-isr-router"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 AGI Egg ISR Router - Cloud Build Deployment${NC}"
echo "================================================"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "apps/intent-router" ]; then
    echo -e "${RED}❌ Error: Not in project root directory${NC}"
    echo "Please run this script from the project root directory"
    exit 1
fi

# Set the project
echo "Setting project to ${PROJECT_ID}..."
gcloud config set project ${PROJECT_ID}

# Check if secrets exist
echo ""
echo "Checking required secrets..."
MISSING_SECRETS=0

if ! gcloud secrets describe gemini-api-key --project=${PROJECT_ID} &>/dev/null; then
    echo -e "${RED}❌ Secret 'gemini-api-key' not found${NC}"
    echo "   Create it with:"
    echo "   echo 'YOUR_API_KEY' | gcloud secrets create gemini-api-key --data-file=-"
    MISSING_SECRETS=1
else
    echo -e "${GREEN}✅ Secret 'gemini-api-key' exists${NC}"
fi

if ! gcloud secrets describe firebase-config --project=${PROJECT_ID} &>/dev/null; then
    echo -e "${RED}❌ Secret 'firebase-config' not found${NC}"
    echo "   Create it with:"
    echo "   gcloud secrets create firebase-config --data-file=firebase-config.json"
    MISSING_SECRETS=1
else
    echo -e "${GREEN}✅ Secret 'firebase-config' exists${NC}"
fi

if [ $MISSING_SECRETS -eq 1 ]; then
    echo ""
    echo -e "${YELLOW}⚠️  Please create the missing secrets before continuing${NC}"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check if Dockerfile exists in the intent-router directory
if [ ! -f "apps/intent-router/Dockerfile" ]; then
    echo -e "${YELLOW}⚠️  Dockerfile not found in apps/intent-router${NC}"
    echo "Creating Dockerfile..."
    cat > apps/intent-router/Dockerfile << 'EOF'
# Multi-stage Dockerfile for AGI Egg ISR Router
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Production stage
FROM node:20-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=nodejs:nodejs /app .

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {if(r.statusCode !== 200) process.exit(1)})" || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]
EOF
    echo -e "${GREEN}✅ Dockerfile created${NC}"
fi

# Trigger Cloud Build
echo ""
echo -e "${BLUE}🔨 Starting Cloud Build...${NC}"
echo "================================================"

# Submit build to Cloud Build
gcloud builds submit \
    --config=deploy/cloud-run/cloudbuild.yaml \
    --substitutions=_PROJECT_ID=${PROJECT_ID} \
    --project=${PROJECT_ID} \
    .

# Check if build succeeded
if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Deployment Successful!${NC}"
    echo "================================================"

    # Get the service URL
    SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
        --region=${REGION} \
        --project=${PROJECT_ID} \
        --format='value(status.url)')

    echo ""
    echo "Service Details:"
    echo "  Name: ${SERVICE_NAME}"
    echo "  Region: ${REGION}"
    echo "  URL: ${SERVICE_URL}"
    echo ""
    echo "Test the service:"
    echo "  curl ${SERVICE_URL}/health"
    echo ""
    echo "View logs:"
    echo "  gcloud run logs read --service=${SERVICE_NAME} --region=${REGION}"
    echo ""
else
    echo ""
    echo -e "${RED}❌ Deployment Failed${NC}"
    echo "Check the Cloud Build logs for details:"
    echo "  https://console.cloud.google.com/cloud-build/builds?project=${PROJECT_ID}"
    exit 1
fi