#!/bin/bash

# Fix Redis Connection for Cloud Run Service
# This script sets the correct Redis Cloud URL

set -e

PROJECT_ID="agi-egg-production"
REGION="us-central1"
SERVICE_NAME="agi-egg-isr-router"

# Redis Cloud connection details
REDIS_URL="redis://default:A30toc6b3f4yb5ug5avuawckd7j9zf5ghp4z43bie5klxrh6wrq@redis-13585.c274.us-east-1-3.ec2.redns.redis-cloud.com:13585"
REDIS_DATABASE="database-MG4CAJDV"

# Secret containing the Gemini API key (Cloud Run maps this already)
GEMINI_SECRET="gemini-api-key"

echo "==========================================="
echo "Fixing Redis Connection for Cloud Run"
echo "==========================================="
echo ""
echo "Service: $SERVICE_NAME"
echo "Region: $REGION"
echo ""

# Check if user is authenticated
echo "Checking GCP authentication..."
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &>/dev/null; then
    echo "❌ Not authenticated. Please run: gcloud auth login"
    exit 1
fi

echo "✅ Authenticated as: $(gcloud auth list --filter=status:ACTIVE --format='value(account)')"
echo ""

# Set project
echo "Setting project to $PROJECT_ID..."
gcloud config set project $PROJECT_ID

echo ""
echo "Updating Redis environment variables..."
echo "======================================"

# Update environment vars without disturbing existing secret mappings
# Note: PORT is automatically set by Cloud Run, so we don't include it
gcloud run services update $SERVICE_NAME \
    --region=$REGION \
    --update-env-vars="REDIS_URL=$REDIS_URL,REDIS_DATABASE=$REDIS_DATABASE,REDIS_TLS=false,REDIS_ENABLED=true,LOG_LEVEL=info,ENABLE_TELEMETRY=true,NODE_ENV=production,GCP_PROJECT_ID=$PROJECT_ID,FIRESTORE_DATABASE=$PROJECT_ID"

# Ensure Gemini API key continues to come from Secret Manager
echo "Re-applying Gemini secret mapping..."
gcloud run services update $SERVICE_NAME \
    --region=$REGION \
    --set-secrets="GEMINI_API_KEY=$GEMINI_SECRET:latest"

echo ""
echo "======================================"
echo "✅ Redis Connection Fixed!"
echo "======================================"
echo ""
echo "Environment variables set:"
echo "- REDIS_URL: Redis Cloud connection string"
echo "- REDIS_DATABASE: database-MG4CAJDV"
echo "- REDIS_TLS: false"
echo "- REDIS_ENABLED: true"
echo "- GEMINI_API_KEY: Set"
echo "- Other configuration variables"
echo ""
echo "Service URL:"
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)')
echo "$SERVICE_URL"
echo ""
echo "Test the service:"
echo "  curl $SERVICE_URL/health"
echo ""
echo "Test intent recognition:"
echo "  curl -X POST $SERVICE_URL/intent/recognize \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"text\": \"I need help with payment\"}'"
