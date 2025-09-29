#!/bin/bash

# AGI Egg ISR Router - Cloud Run Deployment Script
# Based on SOW v3.1 specifications

set -e

# Configuration
PROJECT_ID="agi-egg-production"
REGION="us-central1"
SERVICE_NAME="agi-egg-isr-router"
IMAGE_NAME="gcr.io/${PROJECT_ID}/isr-router"
VERSION="v3.1.0"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 Starting AGI Egg ISR Router Deployment"
echo "================================================"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed${NC}"
    exit 1
fi

# Set the project
echo "Setting project to ${PROJECT_ID}..."
gcloud config set project ${PROJECT_ID}

# Enable required APIs
echo "Enabling required GCP APIs..."
gcloud services enable \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    secretmanager.googleapis.com \
    firestore.googleapis.com \
    monitoring.googleapis.com \
    logging.googleapis.com \
    cloudtrace.googleapis.com \
    pubsub.googleapis.com

# Create service account if it doesn't exist
SERVICE_ACCOUNT="isr-router-sa"
if ! gcloud iam service-accounts describe ${SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com &>/dev/null; then
    echo "Creating service account ${SERVICE_ACCOUNT}..."
    gcloud iam service-accounts create ${SERVICE_ACCOUNT} \
        --display-name="ISR Router Service Account" \
        --description="Service account for AGI Egg ISR Router on Cloud Run"

    # Grant necessary roles
    echo "Granting IAM roles..."
    for role in \
        "roles/datastore.user" \
        "roles/secretmanager.secretAccessor" \
        "roles/pubsub.publisher" \
        "roles/pubsub.subscriber" \
        "roles/monitoring.metricWriter" \
        "roles/cloudtrace.agent" \
        "roles/logging.logWriter"
    do
        gcloud projects add-iam-policy-binding ${PROJECT_ID} \
            --member="serviceAccount:${SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com" \
            --role="${role}"
    done
fi

# Create secrets if they don't exist
echo "Checking secrets..."
if ! gcloud secrets describe gemini-api-key &>/dev/null; then
    echo -e "${YELLOW}Warning: Secret 'gemini-api-key' not found${NC}"
    echo "Please create it with: gcloud secrets create gemini-api-key --data-file=path/to/key"
fi

if ! gcloud secrets describe firebase-config &>/dev/null; then
    echo -e "${YELLOW}Warning: Secret 'firebase-config' not found${NC}"
    echo "Please create it with: gcloud secrets create firebase-config --data-file=path/to/config"
fi

# Build the Docker image
echo "Building Docker image..."
cd ../../apps/intent-router
docker build -t ${IMAGE_NAME}:${VERSION} .
docker tag ${IMAGE_NAME}:${VERSION} ${IMAGE_NAME}:latest

# Push to Container Registry
echo "Pushing image to GCR..."
docker push ${IMAGE_NAME}:${VERSION}
docker push ${IMAGE_NAME}:latest

# Deploy to Cloud Run
echo "Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
    --image ${IMAGE_NAME}:${VERSION} \
    --region ${REGION} \
    --platform managed \
    --service-account ${SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com \
    --allow-unauthenticated \
    --min-instances 1 \
    --max-instances 100 \
    --cpu 4 \
    --memory 8Gi \
    --timeout 300 \
    --concurrency 1000 \
    --port 8080 \
    --set-env-vars="NODE_ENV=production,SERVICE_NAME=${SERVICE_NAME},SERVICE_VERSION=${VERSION}" \
    --set-env-vars="GCP_PROJECT_ID=${PROJECT_ID},GCP_REGION=${REGION}" \
    --set-env-vars="FIRESTORE_DATABASE=(default)" \
    --set-env-vars="ISR_CHUNK_SIZE=500,ISR_SUMMARY_INTERVAL=5,ISR_SESSION_TIMEOUT=300000" \
    --set-env-vars="IMS_CACHE_TTL=60000,IMS_DEFAULT_MODEL=gemini-2.0-flash-exp" \
    --set-env-vars="AOL_DEFAULT_AUTONOMY=2,AOL_MAX_RISK_SCORE=70" \
    --set-env-vars="ENABLE_TRACING=true,ENABLE_METRICS=true,LOG_LEVEL=info" \
    --set-secrets="GEMINI_API_KEY=gemini-api-key:latest" \
    --set-secrets="FIREBASE_CONFIG=firebase-config:latest" \
    --labels="app=agi-egg,component=isr-router,version=${VERSION}"

# Get the service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
    --region ${REGION} \
    --format 'value(status.url)')

# Set up Cloud Monitoring dashboard
echo "Setting up monitoring dashboard..."
cat > dashboard.json <<EOF
{
  "displayName": "AGI Egg ISR Router Dashboard",
  "mosaicLayout": {
    "columns": 12,
    "tiles": [
      {
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Request Rate",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\" resource.label.service_name=\"${SERVICE_NAME}\""
                }
              }
            }]
          }
        }
      },
      {
        "xPos": 6,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Request Latency (p95)",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "metric.type=\"run.googleapis.com/request_latencies\" resource.type=\"cloud_run_revision\" resource.label.service_name=\"${SERVICE_NAME}\"",
                  "aggregation": {
                    "alignmentPeriod": "60s",
                    "perSeriesAligner": "ALIGN_PERCENTILE_95"
                  }
                }
              }
            }]
          }
        }
      },
      {
        "yPos": 4,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "CPU Utilization",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "metric.type=\"run.googleapis.com/container/cpu/utilizations\" resource.type=\"cloud_run_revision\" resource.label.service_name=\"${SERVICE_NAME}\""
                }
              }
            }]
          }
        }
      },
      {
        "xPos": 6,
        "yPos": 4,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Memory Utilization",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "metric.type=\"run.googleapis.com/container/memory/utilizations\" resource.type=\"cloud_run_revision\" resource.label.service_name=\"${SERVICE_NAME}\""
                }
              }
            }]
          }
        }
      }
    ]
  }
}
EOF

# Create the dashboard
gcloud monitoring dashboards create --config-from-file=dashboard.json

# Set up alerting policies
echo "Setting up alerting policies..."
cat > alert-policy.yaml <<EOF
displayName: "ISR Router High Error Rate"
conditions:
  - displayName: "Error rate > 1%"
    conditionThreshold:
      filter: 'resource.type="cloud_run_revision" AND resource.labels.service_name="${SERVICE_NAME}" AND metric.type="run.googleapis.com/request_count" AND metric.labels.response_code_class="5xx"'
      comparison: COMPARISON_GT
      thresholdValue: 0.01
      duration: 300s
      aggregations:
        - alignmentPeriod: 60s
          perSeriesAligner: ALIGN_RATE
notificationChannels: []
documentation:
  content: "The ISR Router service is experiencing high error rates."
  mimeType: text/markdown
enabled: true
EOF

gcloud alpha monitoring policies create --policy-from-file=alert-policy.yaml

# Clean up
rm -f dashboard.json alert-policy.yaml

echo ""
echo "================================================"
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo ""
echo "Service URL: ${SERVICE_URL}"
echo "Service Name: ${SERVICE_NAME}"
echo "Region: ${REGION}"
echo "Version: ${VERSION}"
echo ""
echo "Next steps:"
echo "1. Test the service: curl ${SERVICE_URL}/health"
echo "2. View logs: gcloud logging read \"resource.labels.service_name=${SERVICE_NAME}\""
echo "3. Monitor metrics: https://console.cloud.google.com/monitoring"
echo ""