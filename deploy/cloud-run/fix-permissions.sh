#!/bin/bash

# Fix Cloud Build permissions for AGI Egg deployment
# This script grants all necessary permissions for Cloud Build to deploy to Cloud Run

set -e

# Configuration
PROJECT_ID="agi-egg-production"
PROJECT_NUMBER="1028435695123"
REGION="us-central1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔧 Fixing Cloud Build Permissions"
echo "================================================"

# Set the project
echo "Setting project to ${PROJECT_ID}..."
gcloud config set project ${PROJECT_ID}

# Enable required APIs
echo "Enabling required APIs..."
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable secretmanager.googleapis.com

# Service accounts
CLOUD_BUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
ISR_ROUTER_SA="isr-router-sa@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Service accounts:"
echo "  Cloud Build: ${CLOUD_BUILD_SA}"
echo "  Compute: ${COMPUTE_SA}"
echo "  ISR Router: ${ISR_ROUTER_SA}"
echo ""

# Create ISR Router service account if it doesn't exist
echo "Creating ISR Router service account..."
if ! gcloud iam service-accounts describe ${ISR_ROUTER_SA} --project=${PROJECT_ID} &>/dev/null; then
    gcloud iam service-accounts create isr-router-sa \
        --display-name="ISR Router Service Account" \
        --project=${PROJECT_ID}
else
    echo "Service account ${ISR_ROUTER_SA} already exists"
fi

# Grant storage permissions to Cloud Build service account
echo "Granting storage permissions to Cloud Build service account..."
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${CLOUD_BUILD_SA}" \
    --role="roles/storage.admin"

# Grant storage permissions to compute service account
echo "Granting storage permissions to compute service account..."
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${COMPUTE_SA}" \
    --role="roles/storage.admin"

# Create Cloud Storage bucket for Cloud Build if it doesn't exist
BUCKET_NAME="${PROJECT_ID}_cloudbuild"
echo "Checking Cloud Storage bucket..."
if ! gsutil ls -p ${PROJECT_ID} gs://${BUCKET_NAME} &>/dev/null; then
    echo "Creating Cloud Storage bucket for Cloud Build..."
    gsutil mb -p ${PROJECT_ID} -l us-central1 gs://${BUCKET_NAME}
else
    echo "Bucket gs://${BUCKET_NAME} already exists"
fi

# Set bucket permissions
echo "Setting bucket permissions..."
gsutil iam ch serviceAccount:${CLOUD_BUILD_SA}:objectAdmin gs://${BUCKET_NAME}
gsutil iam ch serviceAccount:${COMPUTE_SA}:objectViewer gs://${BUCKET_NAME}

# Grant Cloud Run Admin permissions to Cloud Build
echo "Granting Cloud Run permissions to Cloud Build..."
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${CLOUD_BUILD_SA}" \
    --role="roles/run.admin"

# Grant Service Account User permission
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${CLOUD_BUILD_SA}" \
    --role="roles/iam.serviceAccountUser"

# Grant Artifact Registry permissions
echo "Granting Artifact Registry permissions..."
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${CLOUD_BUILD_SA}" \
    --role="roles/artifactregistry.admin"

# Grant permissions to ISR Router service account
echo "Granting permissions to ISR Router service account..."
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${ISR_ROUTER_SA}" \
    --role="roles/datastore.user"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${ISR_ROUTER_SA}" \
    --role="roles/secretmanager.secretAccessor"

# Allow Cloud Build to act as ISR Router service account
echo "Allowing Cloud Build to impersonate ISR Router service account..."
gcloud iam service-accounts add-iam-policy-binding ${ISR_ROUTER_SA} \
    --member="serviceAccount:${CLOUD_BUILD_SA}" \
    --role="roles/iam.serviceAccountUser" \
    --project=${PROJECT_ID}

# Create secrets if they don't exist
echo ""
echo "Checking secrets..."
if ! gcloud secrets describe gemini-api-key --project=${PROJECT_ID} &>/dev/null; then
    echo "⚠️  Secret 'gemini-api-key' does not exist"
    echo "   Please create it with: gcloud secrets create gemini-api-key --data-file=gemini-key.txt"
else
    echo "✓ Secret 'gemini-api-key' exists"
fi

if ! gcloud secrets describe firebase-config --project=${PROJECT_ID} &>/dev/null; then
    echo "⚠️  Secret 'firebase-config' does not exist"
    echo "   Please create it with: gcloud secrets create firebase-config --data-file=firebase-config.json"
else
    echo "✓ Secret 'firebase-config' exists"
fi

# Wait for permissions to propagate
echo ""
echo "Waiting for permissions to propagate (15 seconds)..."
sleep 15

echo ""
echo "================================================"
echo -e "${GREEN}✅ Permissions Setup Complete!${NC}"
echo ""
echo "Service accounts configured:"
echo "  - Cloud Build: ${CLOUD_BUILD_SA}"
echo "  - Compute: ${COMPUTE_SA}"
echo "  - ISR Router: ${ISR_ROUTER_SA}"
echo ""
echo "Storage bucket: gs://${BUCKET_NAME}"
echo ""
echo "Next steps:"
echo "1. Ensure secrets are created (if warnings shown above)"
echo "2. Run the deployment: ./deploy-no-docker.sh"
echo ""