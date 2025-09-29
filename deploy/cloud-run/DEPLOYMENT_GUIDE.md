# AGI Egg ISR Router - GCP Deployment Guide

## Overview
This guide provides step-by-step instructions to deploy the AGI Egg ISR Router to Google Cloud Platform using Cloud Run.

## Latest Updates (2025-09-29)
- ✅ **Performance optimizations applied**: Min instances, CPU boost, HTTP/2
- ✅ **Redis Cloud connection fixed**: Proper environment variable configuration
- ✅ **Secret Manager integration**: GEMINI_API_KEY managed via secrets
- ✅ **Response time improved**: From 30s timeout to ~200ms

## Prerequisites

1. **Google Cloud SDK installed**
   ```bash
   # Check if gcloud is installed
   gcloud version
   ```

2. **Authenticated with GCP**
   ```bash
   gcloud auth login
   ```

3. **Project configured**
   ```bash
   gcloud config set project agi-egg-production
   ```

## Step 1: Fix Permissions

First, ensure all necessary permissions are configured:

```bash
cd /Users/bongin_max/hackathon0928/deploy/cloud-run
./fix-permissions.sh
```

This script will:
- Enable required APIs (Cloud Build, Cloud Run, Secret Manager, etc.)
- Create service accounts
- Grant necessary IAM roles
- Set up Cloud Storage bucket
- Check for required secrets

## Step 2: Create Secrets

If the secrets don't exist (as indicated by the fix-permissions.sh script), create them:

### Create Gemini API Key Secret
```bash
# If you have the key in a file:
gcloud secrets create gemini-api-key --data-file=gemini-key.txt

# Or if entering directly:
echo "YOUR_GEMINI_API_KEY" | gcloud secrets create gemini-api-key --data-file=-
```

### Create Firebase Config Secret
```bash
# Create the firebase-config.json file first with your Firebase configuration
cat > firebase-config.json << 'EOF'
{
  "apiKey": "your-api-key",
  "authDomain": "your-auth-domain",
  "projectId": "agi-egg-production",
  "storageBucket": "your-storage-bucket",
  "messagingSenderId": "your-messaging-sender-id",
  "appId": "your-app-id"
}
EOF

# Then create the secret
gcloud secrets create firebase-config --data-file=firebase-config.json

# Clean up the local file
rm firebase-config.json
```

## Step 3: Deploy Using Cloud Build

Now deploy the application using Cloud Build:

```bash
cd /Users/bongin_max/hackathon0928
./deploy/cloud-run/deploy-cloud-build.sh
```

This script will:
1. Validate environment and prerequisites
2. Check for required secrets
3. Create Dockerfile if missing
4. Submit build to Cloud Build
5. Deploy to Cloud Run
6. Display the service URL

## Step 4: Verify Deployment

Once deployed, verify the service is running:

```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe agi-egg-isr-router \
    --region=us-central1 \
    --format='value(status.url)')

# Test health endpoint
curl $SERVICE_URL/health

# Expected response:
# {"status":"healthy","timestamp":"...","version":"v3.1.0","components":{...}}
```

## Step 5: Monitor the Service

### View Logs
```bash
gcloud run logs read \
    --service=agi-egg-isr-router \
    --region=us-central1 \
    --limit=50
```

### Stream Logs in Real-time
```bash
gcloud alpha run services logs tail agi-egg-isr-router \
    --region=us-central1
```

### Check Service Status
```bash
gcloud run services describe agi-egg-isr-router \
    --region=us-central1
```

## Troubleshooting

### Permission Errors

If you encounter permission errors like:
```
ERROR: (gcloud.builds.submit) PERMISSION_DENIED: The caller does not have permission
```

Run the fix-permissions script again:
```bash
./deploy/cloud-run/fix-permissions.sh
```

### Build Failures

If the build fails, check Cloud Build logs:
```bash
# List recent builds
gcloud builds list --limit=5

# Get detailed logs for a specific build
gcloud builds log BUILD_ID
```

### Service Not Starting

If the service deploys but doesn't start:

1. Check Cloud Run logs:
   ```bash
   gcloud run logs read --service=agi-egg-isr-router --region=us-central1
   ```

2. Check service configuration:
   ```bash
   gcloud run services describe agi-egg-isr-router --region=us-central1
   ```

3. Verify secrets are accessible:
   ```bash
   gcloud secrets versions list gemini-api-key
   gcloud secrets versions list firebase-config
   ```

### Memory or CPU Issues

If the service is running out of resources, update the configuration:
```bash
gcloud run services update agi-egg-isr-router \
    --region=us-central1 \
    --memory=16Gi \
    --cpu=8
```

## Alternative Deployment Methods

### Method 1: Direct Cloud Build (Recommended)
Use the provided `deploy-cloud-build.sh` script as shown above.

### Method 2: Using gcloud builds submit
```bash
cd /Users/bongin_max/hackathon0928
gcloud builds submit \
    --config=deploy/cloud-run/cloudbuild.yaml \
    --project=agi-egg-production
```

### Method 3: Local Docker Build and Deploy (Recommended when Cloud Build fails)

This method bypasses Cloud Build permission issues by building locally and pushing directly to Artifact Registry.

#### Prerequisites
1. Docker Desktop installed and running
2. gcloud CLI authenticated with owner or editor permissions

#### Step-by-step Instructions

1. **Start Docker Desktop**
   ```bash
   open -a Docker
   # Wait for Docker to start completely
   docker version
   ```

2. **Configure Docker authentication for Artifact Registry**
   ```bash
   gcloud auth configure-docker us-central1-docker.pkg.dev
   ```

3. **Build the Docker image locally**
   ```bash
   cd /Users/bongin_max/hackathon0928

   docker build \
     --platform linux/amd64 \
     -t us-central1-docker.pkg.dev/agi-egg-production/cloud-run-source-deploy/isr-router:latest \
     -f apps/intent-router/Dockerfile \
     --build-arg NODE_ENV=production \
     .
   ```

4. **Push the image to Artifact Registry**
   ```bash
   docker push us-central1-docker.pkg.dev/agi-egg-production/cloud-run-source-deploy/isr-router:latest
   ```

5. **Deploy to Cloud Run**
   ```bash
   gcloud run deploy agi-egg-isr-router \
     --image us-central1-docker.pkg.dev/agi-egg-production/cloud-run-source-deploy/isr-router:latest \
     --region us-central1 \
     --platform managed \
     --service-account isr-router-sa@agi-egg-production.iam.gserviceaccount.com \
     --allow-unauthenticated \
     --min-instances 1 \
     --max-instances 10 \
     --cpu 2 \
     --memory 4Gi \
     --timeout 300 \
     --concurrency 1000 \
     --port 8080 \
     --set-env-vars="NODE_ENV=production" \
     --set-env-vars="SERVICE_NAME=agi-egg-isr-router" \
     --set-env-vars="SERVICE_VERSION=v3.1.0" \
     --set-env-vars="GCP_PROJECT_ID=agi-egg-production" \
     --set-env-vars="GCP_REGION=us-central1" \
     --set-env-vars="FIRESTORE_DATABASE=(default)" \
     --set-env-vars="ISR_CHUNK_SIZE=500" \
     --set-env-vars="ISR_SUMMARY_INTERVAL=5" \
     --set-env-vars="ISR_SESSION_TIMEOUT=300000" \
     --set-env-vars="IMS_CACHE_TTL=60000" \
     --set-env-vars="IMS_DEFAULT_MODEL=gemini-2.0-flash-exp" \
     --set-env-vars="AOL_DEFAULT_AUTONOMY=2" \
     --set-env-vars="AOL_MAX_RISK_SCORE=70" \
     --set-env-vars="ENABLE_TRACING=true" \
     --set-env-vars="ENABLE_METRICS=true" \
     --set-env-vars="LOG_LEVEL=info" \
     --set-secrets="GEMINI_API_KEY=gemini-api-key:latest" \
     --set-secrets="FIREBASE_CONFIG=firebase-config:latest" \
     --project=agi-egg-production
   ```

6. **Verify deployment**
   ```bash
   # Test the service
   curl https://agi-egg-isr-router-1028435695123.us-central1.run.app/health

   # Expected response:
   # {"status":"ok","timestamp":"..."}
   ```

#### Troubleshooting Local Build

**Docker not running:**
```bash
# Start Docker Desktop on macOS
open -a Docker
# Wait 10-30 seconds for Docker to fully start
```

**Platform issues on Apple Silicon (M1/M2):**
```bash
# Always specify --platform linux/amd64 for Cloud Run compatibility
docker build --platform linux/amd64 ...
```

**Authentication issues:**
```bash
# Re-authenticate with gcloud
gcloud auth login
gcloud auth configure-docker us-central1-docker.pkg.dev
```

**Push permission denied:**
```bash
# Ensure you have Artifact Registry Writer role
gcloud artifacts repositories add-iam-policy-binding cloud-run-source-deploy \
  --location=us-central1 \
  --member="user:YOUR_EMAIL@domain.com" \
  --role="roles/artifactregistry.writer" \
  --project=agi-egg-production
```

## Performance Optimization (2025-09-29)

### Key Implementation Points

1. **Fix Redis Connection Issues**
   - Problem: Service defaulting to localhost:6379 instead of Redis Cloud
   - Solution: Run `./fix-redis-connection.sh`
   - Important: Don't set PORT in env vars (Cloud Run reserves it)

2. **Optimize Cloud Run Performance**
   - Run `./optimize-performance.sh` to apply:
     - Min instances: 1 (prevents cold starts)
     - CPU: 2 cores, Memory: 2Gi
     - CPU boost for faster startup
     - HTTP/2 for better performance
     - Concurrency: 100 requests per instance

3. **Secret Manager Integration**
   - GEMINI_API_KEY must use `--set-secrets` not `--set-env-vars`
   - Avoid type mismatch errors between env vars and secrets
   - Command: `--set-secrets="GEMINI_API_KEY=gemini-api-key:latest"`

4. **Testing Performance**
   - Use `./test-performance.sh` to measure response times
   - Expected: ~200ms for health checks, ~300ms for intent recognition
   - Monitor with: `gcloud logging read` for error diagnosis

### Troubleshooting Scripts

```bash
# Fix Redis connection
./deploy/cloud-run/fix-redis-connection.sh

# Optimize performance
./deploy/cloud-run/optimize-performance.sh

# Test performance
./deploy/cloud-run/test-performance.sh

# Setup secrets
./deploy/cloud-run/setup-secrets.sh
```

## Configuration Reference

### Environment Variables
- `NODE_ENV`: production
- `SERVICE_NAME`: agi-egg-isr-router
- `SERVICE_VERSION`: v3.1.0
- `GCP_PROJECT_ID`: agi-egg-production
- `GCP_REGION`: us-central1
- `FIRESTORE_DATABASE`: (default)
- `ISR_CHUNK_SIZE`: 500
- `ISR_SUMMARY_INTERVAL`: 5
- `ISR_SESSION_TIMEOUT`: 300000
- `IMS_CACHE_TTL`: 60000
- `IMS_DEFAULT_MODEL`: gemini-2.0-flash-exp
- `AOL_DEFAULT_AUTONOMY`: 2
- `AOL_MAX_RISK_SCORE`: 70
- `ENABLE_TRACING`: true
- `ENABLE_METRICS`: true
- `LOG_LEVEL`: info

### Resource Limits
- CPU: 4 vCPUs
- Memory: 8Gi
- Min Instances: 1
- Max Instances: 100
- Concurrency: 1000
- Timeout: 300 seconds

## Next Steps

After successful deployment:

1. **Configure Frontend**
   Update the frontend to point to your Cloud Run service URL:
   - Service URL: https://agi-egg-isr-router-1028435695123.us-central1.run.app
   - Update environment variables in Vercel or local .env files

2. **Set up Monitoring**
   Configure Cloud Monitoring alerts for service health.

3. **Configure Custom Domain** (Optional)
   Map a custom domain to your Cloud Run service.

4. **Enable CI/CD**
   Set up Cloud Build triggers for automated deployments.

## Support

For issues or questions:
- Check Cloud Build logs: https://console.cloud.google.com/cloud-build
- Check Cloud Run logs: https://console.cloud.google.com/run
- Review service metrics: https://console.cloud.google.com/monitoring