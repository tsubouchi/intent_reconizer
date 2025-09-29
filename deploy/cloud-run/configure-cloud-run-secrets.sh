#!/bin/bash

# Cloud Run Secret Configuration Script
# This script configures Cloud Run services to use secrets from Secret Manager

set -e

PROJECT_ID="agi-egg-production"
REGION="us-central1"
SERVICE_NAME="agi-egg-isr-router"

echo "==========================================="
echo "Cloud Run Secret Configuration Script"
echo "==========================================="
echo ""
echo "Project ID: $PROJECT_ID"
echo "Region: $REGION"
echo "Service Name: $SERVICE_NAME"
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

# Get the Cloud Run service account
echo "Getting Cloud Run service account..."
SERVICE_ACCOUNT=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(spec.template.spec.serviceAccountName)' 2>/dev/null || echo "")

if [ -z "$SERVICE_ACCOUNT" ]; then
    # Use default compute service account if service doesn't exist yet
    PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
    SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
    echo "Using default compute service account: $SERVICE_ACCOUNT"
else
    echo "Using existing service account: $SERVICE_ACCOUNT"
fi

echo ""
echo "Granting Secret Manager access to service account..."
echo "===================================================="

# List of all secrets to grant access to
SECRETS=(
    "gemini-api-key"
    "backend-port"
    "backend-node-env"
    "gcp-project-id"
    "firestore-database"
    "redis-url"
    "redis-database"
    "redis-tls"
    "log-level"
    "enable-telemetry"
    "allowed-origins"
)

for SECRET in "${SECRETS[@]}"; do
    echo "Granting access to secret: $SECRET..."
    gcloud secrets add-iam-policy-binding $SECRET \
        --member="serviceAccount:$SERVICE_ACCOUNT" \
        --role="roles/secretmanager.secretAccessor" \
        --project=$PROJECT_ID &>/dev/null || echo "  Already has access or secret doesn't exist"
done

echo ""
echo "Creating Cloud Run deployment command with secrets..."
echo "======================================================"

# Create the deployment command with all secret environment variables
cat > deploy-with-secrets.sh << 'EOF'
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
EOF

chmod +x deploy-with-secrets.sh

echo ""
echo "======================================"
echo "✅ Configuration Complete!"
echo "======================================"
echo ""
echo "Service account '$SERVICE_ACCOUNT' has been granted access to all secrets."
echo ""
echo "To deploy the Cloud Run service with secrets, run:"
echo "  ./deploy-with-secrets.sh"
echo ""
echo "To update an existing Cloud Run service with secrets:"
echo "  gcloud run services update $SERVICE_NAME \\"
echo "    --update-secrets=\"GEMINI_API_KEY=gemini-api-key:latest\" \\"
echo "    --update-secrets=\"REDIS_URL=redis-url:latest\" \\"
echo "    --region=$REGION"
echo ""
echo "To verify secrets are properly mounted:"
echo "  gcloud run services describe $SERVICE_NAME --region=$REGION"