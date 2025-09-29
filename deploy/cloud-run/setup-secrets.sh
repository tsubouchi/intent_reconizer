#!/bin/bash

# GCP Secret Manager Setup Script for AGI Egg
# This script creates all necessary secrets in GCP Secret Manager

set -e

PROJECT_ID="agi-egg-production"
REGION="us-central1"

echo "==================================="
echo "AGI Egg Secret Manager Setup Script"
echo "==================================="
echo ""
echo "Project ID: $PROJECT_ID"
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

# Enable Secret Manager API if not already enabled
echo "Enabling Secret Manager API..."
gcloud services enable secretmanager.googleapis.com --project=$PROJECT_ID

echo ""
echo "Creating secrets for Frontend environment variables..."
echo "======================================================"

# Frontend Secrets (Public URLs and non-sensitive config)
echo "Creating frontend-api-url..."
echo -n "https://agi-egg-isr-router-1028435695123.us-central1.run.app" | \
    gcloud secrets create frontend-api-url --data-file=- --replication-policy=automatic --project=$PROJECT_ID 2>/dev/null || \
    echo "Secret frontend-api-url already exists, skipping..."

echo "Creating frontend-manifest-api-url..."
echo -n "https://agi-egg-isr-router-1028435695123.us-central1.run.app" | \
    gcloud secrets create frontend-manifest-api-url --data-file=- --replication-policy=automatic --project=$PROJECT_ID 2>/dev/null || \
    echo "Secret frontend-manifest-api-url already exists, skipping..."

echo "Creating gcp-project-id..."
echo -n "agi-egg-production" | \
    gcloud secrets create gcp-project-id --data-file=- --replication-policy=automatic --project=$PROJECT_ID 2>/dev/null || \
    echo "Secret gcp-project-id already exists, skipping..."

echo "Creating firebase-api-key..."
echo -n "AIzaSyDX8EkeJkVhsqK76SWz-S_euDYhV4gHGKU" | \
    gcloud secrets create firebase-api-key --data-file=- --replication-policy=automatic --project=$PROJECT_ID 2>/dev/null || \
    echo "Secret firebase-api-key already exists, skipping..."

echo "Creating firebase-auth-domain..."
echo -n "agi-egg-production.firebaseapp.com" | \
    gcloud secrets create firebase-auth-domain --data-file=- --replication-policy=automatic --project=$PROJECT_ID 2>/dev/null || \
    echo "Secret firebase-auth-domain already exists, skipping..."

echo "Creating firebase-project-id..."
echo -n "agi-egg-production" | \
    gcloud secrets create firebase-project-id --data-file=- --replication-policy=automatic --project=$PROJECT_ID 2>/dev/null || \
    echo "Secret firebase-project-id already exists, skipping..."

echo "Creating gemini-api-key..."
echo -n "AIzaSyDX8EkeJkVhsqK76SWz-S_euDYhV4gHGKU" | \
    gcloud secrets create gemini-api-key --data-file=- --replication-policy=automatic --project=$PROJECT_ID 2>/dev/null || \
    echo "Secret gemini-api-key already exists, skipping..."

echo ""
echo "Creating secrets for Backend environment variables..."
echo "===================================================="

# Backend Secrets
echo "Creating backend-port..."
echo -n "8080" | \
    gcloud secrets create backend-port --data-file=- --replication-policy=automatic --project=$PROJECT_ID 2>/dev/null || \
    echo "Secret backend-port already exists, skipping..."

echo "Creating backend-node-env..."
echo -n "production" | \
    gcloud secrets create backend-node-env --data-file=- --replication-policy=automatic --project=$PROJECT_ID 2>/dev/null || \
    echo "Secret backend-node-env already exists, skipping..."

echo "Creating firestore-database..."
echo -n "agi-egg-production" | \
    gcloud secrets create firestore-database --data-file=- --replication-policy=automatic --project=$PROJECT_ID 2>/dev/null || \
    echo "Secret firestore-database already exists, skipping..."

echo "Creating redis-url..."
echo -n "redis://default:A30toc6b3f4yb5ug5avuawckd7j9zf5ghp4z43bie5klxrh6wrq@redis-13585.c274.us-east-1-3.ec2.redns.redis-cloud.com:13585" | \
    gcloud secrets create redis-url --data-file=- --replication-policy=automatic --project=$PROJECT_ID 2>/dev/null || \
    echo "Secret redis-url already exists, skipping..."

echo "Creating redis-database..."
echo -n "database-MG4CAJDV" | \
    gcloud secrets create redis-database --data-file=- --replication-policy=automatic --project=$PROJECT_ID 2>/dev/null || \
    echo "Secret redis-database already exists, skipping..."

echo "Creating redis-tls..."
echo -n "false" | \
    gcloud secrets create redis-tls --data-file=- --replication-policy=automatic --project=$PROJECT_ID 2>/dev/null || \
    echo "Secret redis-tls already exists, skipping..."

echo "Creating log-level..."
echo -n "info" | \
    gcloud secrets create log-level --data-file=- --replication-policy=automatic --project=$PROJECT_ID 2>/dev/null || \
    echo "Secret log-level already exists, skipping..."

echo "Creating enable-telemetry..."
echo -n "true" | \
    gcloud secrets create enable-telemetry --data-file=- --replication-policy=automatic --project=$PROJECT_ID 2>/dev/null || \
    echo "Secret enable-telemetry already exists, skipping..."

echo "Creating allowed-origins..."
echo -n "http://localhost:3000,https://agi-egg.vercel.app,https://*.vercel.app" | \
    gcloud secrets create allowed-origins --data-file=- --replication-policy=automatic --project=$PROJECT_ID 2>/dev/null || \
    echo "Secret allowed-origins already exists, skipping..."

echo ""
echo "======================================"
echo "✅ Secret Manager Setup Complete!"
echo "======================================"
echo ""
echo "Created/verified the following secrets:"
echo ""
echo "Frontend Secrets:"
echo "  - frontend-api-url"
echo "  - frontend-manifest-api-url"
echo "  - gcp-project-id"
echo "  - firebase-api-key"
echo "  - firebase-auth-domain"
echo "  - firebase-project-id"
echo "  - gemini-api-key"
echo ""
echo "Backend Secrets:"
echo "  - backend-port"
echo "  - backend-node-env"
echo "  - firestore-database"
echo "  - redis-url"
echo "  - redis-database"
echo "  - redis-tls"
echo "  - log-level"
echo "  - enable-telemetry"
echo "  - allowed-origins"
echo ""
echo "Next steps:"
echo "1. Grant Cloud Run service account access to these secrets:"
echo "   gcloud secrets add-iam-policy-binding SECRET_NAME \\"
echo "     --member='serviceAccount:SERVICE_ACCOUNT_EMAIL' \\"
echo "     --role='roles/secretmanager.secretAccessor'"
echo ""
echo "2. Update Cloud Run service to use these secrets as environment variables"
echo "3. Update Vercel environment variables to reference these secrets"