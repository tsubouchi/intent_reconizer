#!/bin/bash

# Deploy Cloud Run service with Secret Manager integration

PROJECT_ID="agi-egg-production"
REGION="us-central1"
SERVICE_NAME="agi-egg-isr-router"
IMAGE_URL="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest"

echo "Deploying Cloud Run service with secrets..."

gcloud run deploy $SERVICE_NAME \
    --image=$IMAGE_URL \
    --region=$REGION \
    --platform=managed \
    --allow-unauthenticated \
    --min-instances=0 \
    --max-instances=100 \
    --cpu=1 \
    --memory=512Mi \
    --port=8080 \
    --set-env-vars="NODE_ENV=production" \
    --update-secrets="GEMINI_API_KEY=gemini-api-key:latest" \
    --update-secrets="PORT=backend-port:latest" \
    --update-secrets="GCP_PROJECT_ID=gcp-project-id:latest" \
    --update-secrets="FIRESTORE_DATABASE=firestore-database:latest" \
    --update-secrets="REDIS_URL=redis-url:latest" \
    --update-secrets="REDIS_DATABASE=redis-database:latest" \
    --update-secrets="REDIS_TLS=redis-tls:latest" \
    --update-secrets="LOG_LEVEL=log-level:latest" \
    --update-secrets="ENABLE_TELEMETRY=enable-telemetry:latest" \
    --update-secrets="ALLOWED_ORIGINS=allowed-origins:latest" \
    --project=$PROJECT_ID

echo "✅ Cloud Run service deployed with Secret Manager integration!"
