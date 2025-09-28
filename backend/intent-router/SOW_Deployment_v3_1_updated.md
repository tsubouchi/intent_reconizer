# Statement of Work v3.1 - AGI Egg Production Deployment (Updated)
## Current Implementation Status - GCP Cloud Run + Vercel Edge Architecture

---

## Executive Summary
This updated SOW reflects the current state of AGI Egg's production deployment, featuring a hybrid architecture with Vercel-hosted frontend and GCP Cloud Run backend services. The system has been successfully configured with Gemini 2.5 Pro integration, Firestore persistence, and comprehensive observability through Cloud Monitoring.

### Current Architecture Status
- ✅ **Frontend**: Next.js deployed on Vercel with modern glassmorphism UI
- ✅ **Backend Services**: Express-based intent-router ready for Cloud Run deployment
- ✅ **GCP Infrastructure**: Project `agi-egg-production` fully configured with APIs, Firestore, Storage
- ✅ **Authentication**: Service accounts created with proper IAM roles
- ✅ **Secrets Management**: Gemini API key secured in Secret Manager
- ⏳ **Docker Deployment**: Images ready to build and deploy to Cloud Run

---

## Current Directory Structure
```
hackathon0928/
├── README.md                        # Project documentation
├── vercel.json                      # Vercel deployment config
├── backend/
│   └── intent-router/               # Main backend service
│       ├── package.json
│       ├── tsconfig.json
│       ├── Dockerfile              # Cloud Run container config
│       ├── src/
│       │   ├── index.ts           # Express server entry
│       │   ├── routes/
│       │   │   ├── health.ts      # Health check endpoints
│       │   │   ├── intent.ts      # Intent recognition routes
│       │   │   └── session.ts     # Session management
│       │   ├── services/
│       │   │   ├── gemini.ts      # Gemini 2.5 Pro client
│       │   │   ├── firestore.ts   # Firestore integration
│       │   │   ├── policy.ts      # Policy engine
│       │   │   └── manifest.ts    # Manifest resolver
│       │   └── middleware/
│       │       ├── auth.ts        # Authentication
│       │       └── telemetry.ts   # Logging/monitoring
│       └── .env.example            # Environment template
└── nextjs-frontend/                 # Vercel-hosted UI
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx
    │   └── modern.css              # Glassmorphism styles
    └── components/
        └── intent/
            └── IntentInput.tsx     # Main UI component
```

---

## GCP Infrastructure Status

### Project Configuration
- **Project ID**: `agi-egg-production`
- **Region**: `us-central1`
- **Billing Account**: Linked (01A371-7E4EE7-3B5596)
- **Owner Account**: t@bonginkan.ai

### Enabled APIs
✅ Cloud Run API
✅ Cloud Build API
✅ Artifact Registry API
✅ Firestore API
✅ Cloud Storage API
✅ Secret Manager API
✅ Cloud Logging API
✅ Cloud Monitoring API
✅ Identity and Access Management API
✅ Service Usage API

### Resources Created
1. **Firestore Database**
   - Name: `agi-egg-production`
   - Location: `us-central1`
   - Mode: Native

2. **Cloud Storage Buckets**
   - `agi-egg-production-manifests` - Manifest storage
   - `agi-egg-production-artifacts` - Build artifacts
   - `agi-egg-production-telemetry` - Logs/metrics export

3. **Service Accounts**
   - `intent-router@agi-egg-production.iam.gserviceaccount.com`
     - Roles: Cloud Run Invoker, Firestore User, Storage Object Admin, Secret Manager Secret Accessor
   - `manifest-generator@agi-egg-production.iam.gserviceaccount.com`
     - Roles: Cloud Run Invoker, Firestore User, Storage Object Admin

4. **Secrets**
   - `gemini-api-key` - Stored in Secret Manager
   - Version: 1 (active)

---

## Deployment Steps

### 1. Docker Authentication Setup
```bash
# Configure Docker for Artifact Registry
gcloud auth configure-docker us-central1-docker.pkg.dev

# Verify authentication
gcloud auth list
```

### 2. Build Docker Images

#### Intent Router Service
```bash
cd backend/intent-router

# Create Dockerfile if not exists
cat > Dockerfile << 'EOF'
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml* ./

# Install pnpm and dependencies
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build TypeScript
RUN pnpm build

# Expose port
EXPOSE 8080

# Start server
CMD ["node", "dist/index.js"]
EOF

# Build image
docker build -t us-central1-docker.pkg.dev/agi-egg-production/cloud-run/intent-router:latest .

# Push to Artifact Registry
docker push us-central1-docker.pkg.dev/agi-egg-production/cloud-run/intent-router:latest
```

### 3. Deploy to Cloud Run

```bash
# Deploy intent-router service
gcloud run deploy intent-router \
  --image us-central1-docker.pkg.dev/agi-egg-production/cloud-run/intent-router:latest \
  --region us-central1 \
  --platform managed \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 1 \
  --max-instances 10 \
  --service-account intent-router@agi-egg-production.iam.gserviceaccount.com \
  --set-env-vars "NODE_ENV=production,GCP_PROJECT_ID=agi-egg-production" \
  --set-secrets "GEMINI_API_KEY=gemini-api-key:latest" \
  --allow-unauthenticated
```

### 4. Update Frontend Configuration

```bash
# Update frontend to use Cloud Run backend
cd nextjs-frontend

# Update .env.production
cat > .env.production << 'EOF'
NEXT_PUBLIC_API_URL=https://intent-router-[HASH]-uc.a.run.app
NEXT_PUBLIC_GCP_PROJECT_ID=agi-egg-production
EOF
```

---

## Environment Variables

### Backend Services (.env)
```env
# Server
PORT=8080
NODE_ENV=production

# GCP
GCP_PROJECT_ID=agi-egg-production
FIRESTORE_DATABASE=agi-egg-production

# Gemini (from Secret Manager)
GEMINI_API_KEY=[managed by Secret Manager]

# Monitoring
ENABLE_TELEMETRY=true
LOG_LEVEL=info
```

### Frontend (.env.production)
```env
NEXT_PUBLIC_API_URL=https://intent-router-[HASH]-uc.a.run.app
NEXT_PUBLIC_GCP_PROJECT_ID=agi-egg-production
```

---

## Monitoring & Observability

### Cloud Monitoring Dashboards
1. **Service Health**
   - Request rate and latency (p50, p95, p99)
   - Error rate and types
   - Active sessions

2. **Gemini Integration**
   - API call volume
   - Model response times
   - Token usage and costs

3. **Resource Utilization**
   - Cloud Run instance count
   - Memory and CPU usage
   - Cold start frequency

### Logging Strategy
```typescript
// Structured logging format
{
  "timestamp": "2024-09-29T10:00:00Z",
  "severity": "INFO",
  "service": "intent-router",
  "trace": "projects/agi-egg-production/traces/abc123",
  "message": "Intent recognized",
  "labels": {
    "sessionId": "sess_123",
    "tenantId": "tenant_456",
    "modelUsed": "gemini-2.5-pro"
  }
}
```

---

## Security Configuration

### Cloud Run Security
- ✅ HTTPS only with managed TLS
- ✅ Service account with minimal permissions
- ✅ Secrets managed via Secret Manager
- ✅ VPC connector for private resource access (if needed)

### API Security
- JWT validation for authenticated endpoints
- Rate limiting per client IP
- CORS configured for Vercel frontend only
- Request signing for inter-service communication

---

## Cost Optimization

### Current Monthly Estimates
- **Cloud Run**: ~$50 (1 instance min, autoscaling)
- **Firestore**: ~$20 (< 1GB storage, 50K reads/day)
- **Cloud Storage**: ~$5 (< 10GB)
- **Gemini API**: ~$100 (based on usage)
- **Total**: ~$175/month

### Optimization Strategies
1. Use Cloud Run min instances = 0 for dev/staging
2. Implement response caching in Redis/Memorystore
3. Batch Firestore operations
4. Monitor and optimize Gemini token usage

---

## Rollout Plan

### Phase 1: Infrastructure Validation ✅
- GCP project setup complete
- All APIs enabled
- Service accounts configured
- Secrets stored

### Phase 2: Docker Deployment (Current)
- Build and push Docker images
- Deploy to Cloud Run
- Verify health endpoints

### Phase 3: Integration Testing
- Test Gemini integration
- Verify Firestore persistence
- Check monitoring/logging

### Phase 4: Production Launch
- Update DNS/CDN configuration
- Enable production monitoring alerts
- Document runbooks

---

## Success Metrics

### Technical KPIs
- **Availability**: > 99.9% uptime
- **Latency**: p95 < 2s for intent recognition
- **Error Rate**: < 0.1% of requests
- **Cold Start**: < 3s for first request

### Business KPIs
- **Daily Active Sessions**: Track growth
- **Intent Recognition Accuracy**: > 95%
- **Cost per Request**: < $0.01
- **User Satisfaction**: Monitor via feedback

---

## Next Actions

1. **Immediate** (Today)
   - [ ] Configure Docker authentication
   - [ ] Build and push Docker images
   - [ ] Deploy intent-router to Cloud Run
   - [ ] Update frontend with Cloud Run URL

2. **Short-term** (This Week)
   - [ ] Set up monitoring dashboards
   - [ ] Configure alerting policies
   - [ ] Run integration tests
   - [ ] Document API endpoints

3. **Long-term** (Next Month)
   - [ ] Implement caching layer
   - [ ] Add A/B testing framework
   - [ ] Enhance policy engine
   - [ ] Scale to multi-region

---

**Document Version**: 3.1-updated
**Last Updated**: 2024-09-29
**Status**: Ready for Docker Deployment
**Project**: agi-egg-production