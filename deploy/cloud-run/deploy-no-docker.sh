#!/bin/bash

# AGI Egg ISR Router - Cloud Run Deployment Script (Without Local Docker)
# Uses Cloud Build instead of local Docker

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

echo "🚀 Starting AGI Egg ISR Router Deployment (Cloud Build)"
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

# Check secrets exist
echo "Checking secrets..."
if ! gcloud secrets describe gemini-api-key &>/dev/null; then
    echo -e "${YELLOW}Creating gemini-api-key secret...${NC}"
    if [ -f "gemini-key.txt" ]; then
        gcloud secrets create gemini-api-key --data-file=gemini-key.txt
    else
        echo -e "${RED}Error: gemini-key.txt not found${NC}"
        echo "Please create gemini-key.txt with your API key"
        exit 1
    fi
fi

if ! gcloud secrets describe firebase-config &>/dev/null; then
    echo -e "${YELLOW}Creating firebase-config secret...${NC}"
    if [ -f "firebase-config.json" ]; then
        gcloud secrets create firebase-config --data-file=firebase-config.json
    else
        echo -e "${RED}Error: firebase-config.json not found${NC}"
        echo "Please create firebase-config.json with your Firebase config"
        exit 1
    fi
fi

# Build using Cloud Build directly (no local Docker required)
echo "Building Docker image using Cloud Build..."
cd ../../apps/intent-router

# Create a .gcloudignore file to exclude unnecessary files
cat > .gcloudignore <<EOF
node_modules
npm-debug.log
.git
.gitignore
*.md
.env
.env.*
test/
tests/
*.test.js
*.spec.js
EOF

# Submit build to Cloud Build
gcloud builds submit \
    --tag ${IMAGE_NAME}:${VERSION} \
    --tag ${IMAGE_NAME}:latest \
    --timeout=20m

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

# Clean up
rm -f .gcloudignore

echo ""
echo "================================================"
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo ""
echo "Service URL: ${SERVICE_URL}"
echo "Service Name: ${SERVICE_NAME}"
echo "Region: ${REGION}"
echo "Version: ${VERSION}"
echo ""
echo "Test the service:"
echo "  curl ${SERVICE_URL}/health"
echo ""
echo "View logs:"
echo "  gcloud logging read \"resource.labels.service_name=${SERVICE_NAME}\" --limit 50"
echo ""
echo "Monitor metrics:"
echo "  https://console.cloud.google.com/monitoring"
echo ""