# Statement of Work - AGI Egg Deployment
## Vercel Frontend + GCP Backend Hybrid Architecture

---

## 📋 Executive Summary

This document outlines the deployment strategy for AGI Egg, implementing a hybrid cloud architecture with:
- **Frontend**: Vercel (Next.js application with edge functions)
- **Backend**: Google Cloud Platform (Cloud Run, Firestore, Gemini API)
- **Integration**: Secure API communication via HTTPS with CORS configuration

### Project Timeline
- **Phase 1**: Infrastructure Setup (Day 1)
- **Phase 2**: Backend Deployment (Day 1-2)
- **Phase 3**: Frontend Integration (Day 2)
- **Phase 4**: Testing & Optimization (Day 3)

---

## 🏗 Architecture Overview

```mermaid
graph TB
    subgraph "Vercel Edge Network"
        A[Next.js Frontend]
        B[Edge Functions]
        C[Static Assets CDN]
    end

    subgraph "Google Cloud Platform"
        D[Cloud Run - Intent Router]
        E[Cloud Run - Manifest Generator]
        F[Firestore Database]
        G[Cloud Storage]
        H[Gemini API]
        I[Cloud Monitoring]
        J[Cloud Load Balancer]
    end

    subgraph "External Services"
        K[GitHub Repository]
        L[Docker Registry]
    end

    A --> B
    B --> J
    J --> D
    J --> E
    D --> F
    D --> H
    E --> F
    E --> G
    D --> I
    E --> I
    K --> A
    K --> L
    L --> D
    L --> E
```

---

## 🚀 Phase 1: GCP Infrastructure Setup

### 1.1 Required GCP Services

| Service | Purpose | Configuration |
|---------|---------|--------------|
| **Cloud Run** | Serverless container hosting | 2 services (intent-router, manifest-generator) |
| **Firestore** | NoSQL database | Native mode, multi-region |
| **Cloud Storage** | Manifest & asset storage | Standard tier, regional |
| **Artifact Registry** | Docker container registry | Regional repository |
| **Cloud Load Balancing** | Traffic distribution | Global HTTPS LB |
| **Cloud Monitoring** | Observability | Logs, metrics, traces |
| **Secret Manager** | API key management | Automatic rotation |
| **Cloud Build** | CI/CD pipeline | GitHub integration |

### 1.2 Required APIs to Enable

```bash
# Enable required APIs
gcloud services enable \
  run.googleapis.com \
  firestore.googleapis.com \
  storage.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  monitoring.googleapis.com \
  logging.googleapis.com \
  generativelanguage.googleapis.com \
  compute.googleapis.com
```

### 1.3 Project Configuration

```bash
# Set project variables
export PROJECT_ID="agi-egg-production"
export REGION="us-central1"
export FIRESTORE_REGION="us-central"

# Configure gcloud
gcloud config set project $PROJECT_ID
gcloud config set run/region $REGION
```

---

## 📦 Phase 2: Backend Services Deployment

### 2.1 Firestore Setup

```bash
# Create Firestore database
gcloud firestore databases create \
  --location=$FIRESTORE_REGION \
  --type=firestore-native

# Collections Structure:
# - intents (recognized intents history)
# - manifests (Cloud Run manifest versions)
# - metrics (performance metrics)
# - cache (intent classification cache)
# - services (registered services)
```

#### Firestore Schema

```typescript
// intents collection
interface IntentDocument {
  id: string
  timestamp: Timestamp
  request: {
    text?: string
    path?: string
    method?: string
    headers?: Record<string, string>
  }
  response: {
    category: string
    confidence: number
    targetService: string
    processingTime: number
  }
  metadata: {
    modelVersion: string
    cacheHit: boolean
  }
}

// manifests collection
interface ManifestDocument {
  id: string
  service: string
  version: string
  content: string // YAML content
  createdAt: Timestamp
  updatedAt: Timestamp
  status: 'active' | 'pending' | 'archived'
  driftScore?: number
  optimizations?: Record<string, any>
}

// services collection
interface ServiceDocument {
  id: string
  name: string
  endpoint: string
  healthCheck: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  lastChecked: Timestamp
  metadata: Record<string, any>
}
```

### 2.2 Cloud Storage Buckets

```bash
# Create storage buckets
gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION gs://${PROJECT_ID}-manifests
gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION gs://${PROJECT_ID}-configs
gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION gs://${PROJECT_ID}-models

# Set bucket permissions
gsutil iam ch allUsers:objectViewer gs://${PROJECT_ID}-manifests
```

### 2.3 Secret Manager Configuration

```bash
# Store API keys
echo -n "$GEMINI_API_KEY" | gcloud secrets create gemini-api-key \
  --data-file=- \
  --replication-policy="automatic"

# Grant Cloud Run access
gcloud secrets add-iam-policy-binding gemini-api-key \
  --role="roles/secretmanager.secretAccessor" \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
```

### 2.4 Artifact Registry Setup

```bash
# Create Docker repository
gcloud artifacts repositories create agi-egg-containers \
  --repository-format=docker \
  --location=$REGION \
  --description="AGI Egg container images"

# Configure Docker
gcloud auth configure-docker ${REGION}-docker.pkg.dev
```

---

## 🐳 Phase 3: Service Deployment

### 3.1 Intent Router Service

#### Dockerfile Update
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json pnpm-lock.yaml ./
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g pnpm
COPY package*.json pnpm-lock.yaml ./
RUN pnpm install --production --frozen-lockfile
COPY --from=builder /app/dist ./dist
COPY manifests ./manifests

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/index.js"]
```

#### Build and Deploy
```bash
# Build container
cd apps/intent-router
docker build -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/agi-egg-containers/intent-router:latest .

# Push to registry
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/agi-egg-containers/intent-router:latest

# Deploy to Cloud Run
gcloud run deploy intent-router \
  --image ${REGION}-docker.pkg.dev/${PROJECT_ID}/agi-egg-containers/intent-router:latest \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars="PROJECT_ID=${PROJECT_ID}" \
  --set-secrets="GEMINI_API_KEY=gemini-api-key:latest" \
  --memory=1Gi \
  --cpu=1 \
  --min-instances=1 \
  --max-instances=100 \
  --port=8080
```

### 3.2 Manifest Generator Service

```bash
# Similar deployment process
cd apps/manifest-generator
docker build -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/agi-egg-containers/manifest-generator:latest .
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/agi-egg-containers/manifest-generator:latest

gcloud run deploy manifest-generator \
  --image ${REGION}-docker.pkg.dev/${PROJECT_ID}/agi-egg-containers/manifest-generator:latest \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars="PROJECT_ID=${PROJECT_ID}" \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=50 \
  --port=8081
```

---

## 🌐 Phase 4: Frontend Integration

### 4.1 Environment Variables

```bash
# .env.local (Vercel)
NEXT_PUBLIC_API_URL=https://intent-router-xxxxx-uc.a.run.app
NEXT_PUBLIC_MANIFEST_API_URL=https://manifest-generator-xxxxx-uc.a.run.app
NEXT_PUBLIC_GCP_PROJECT_ID=agi-egg-production
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyDX8EkeJkVhsqK76SWz-S_euDYhV4gHGKU
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${PROJECT_ID}.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=${PROJECT_ID}
```

### 4.2 CORS Configuration

```typescript
// apps/intent-router/src/index.ts
import cors from 'cors'

const corsOptions = {
  origin: [
    'https://agi-egg.vercel.app',
    'https://*.vercel.app',
    'http://localhost:3000'
  ],
  credentials: true,
  optionsSuccessStatus: 200
}

app.use(cors(corsOptions))
```

### 4.3 API Client Update

```typescript
// apps/frontend/lib/api/client.ts
import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_GCP_PROJECT_ID,
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)

export const apiClient = {
  intentRouter: {
    baseURL: process.env.NEXT_PUBLIC_API_URL,
    recognize: async (request: IntentRequest) => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/intent/recognize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      })
      return response.json()
    }
  }
}
```

---

## 📊 Phase 5: Monitoring & Observability

### 5.1 Cloud Monitoring Setup

```yaml
# monitoring/alerts.yaml
alertPolicy:
  displayName: "High Error Rate"
  conditions:
    - displayName: "Error rate > 5%"
      conditionThreshold:
        filter: |
          resource.type="cloud_run_revision"
          metric.type="run.googleapis.com/request_count"
          metric.label.response_code_class="5xx"
        comparison: COMPARISON_GT
        thresholdValue: 0.05
        duration: 300s
```

### 5.2 Custom Metrics

```typescript
// Firestore metrics collection
import { Timestamp } from 'firebase-admin/firestore'

export async function recordMetric(metric: {
  service: string
  type: 'latency' | 'error' | 'success'
  value: number
  metadata?: Record<string, any>
}) {
  await db.collection('metrics').add({
    ...metric,
    timestamp: Timestamp.now()
  })
}
```

---

## 🔒 Security Configuration

### 6.1 Cloud Run Service Account

```bash
# Create service account
gcloud iam service-accounts create agi-egg-runner \
  --display-name="AGI Egg Cloud Run Service Account"

# Grant necessary permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:agi-egg-runner@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/datastore.user"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:agi-egg-runner@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

### 6.2 API Security

```typescript
// Rate limiting
import rateLimit from 'express-rate-limit'

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
})

app.use('/api/', limiter)
```

---

## 📝 Deployment Checklist

### Pre-Deployment
- [ ] GCP Project created and configured
- [ ] Billing account attached
- [ ] APIs enabled
- [ ] Firestore database created
- [ ] Storage buckets created
- [ ] Secrets stored in Secret Manager

### Backend Deployment
- [ ] Docker images built
- [ ] Images pushed to Artifact Registry
- [ ] Cloud Run services deployed
- [ ] Health checks passing
- [ ] CORS configured

### Frontend Deployment
- [ ] Environment variables configured in Vercel
- [ ] API endpoints updated
- [ ] Build successful
- [ ] Preview deployment tested

### Post-Deployment
- [ ] Monitoring alerts configured
- [ ] Performance baselines established
- [ ] Security scanning completed
- [ ] Documentation updated

---

## 🚨 Rollback Plan

```bash
# Quick rollback procedure
gcloud run services update-traffic intent-router \
  --to-revisions=intent-router-00001-xxx=100

# Or full redeployment from previous image
gcloud run deploy intent-router \
  --image ${REGION}-docker.pkg.dev/${PROJECT_ID}/agi-egg-containers/intent-router:v1.0.0
```

---

## 💰 Cost Estimation

| Service | Estimated Monthly Cost | Notes |
|---------|----------------------|--------|
| Cloud Run | $50-150 | Based on 100K requests/month |
| Firestore | $20-50 | 10GB storage, 1M reads/writes |
| Cloud Storage | $5-10 | 50GB storage |
| Load Balancing | $20 | Fixed cost |
| Gemini API | $100-300 | Based on usage |
| **Total** | **$195-530** | Scales with usage |

---

## 📞 Support & Escalation

- **Technical Issues**: Create issue in GitHub repository
- **GCP Support**: Use Cloud Console support portal
- **Vercel Support**: Dashboard support tickets
- **Critical Issues**: Escalate via Slack #agi-egg-ops channel

---

## 📚 References

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Firestore Best Practices](https://cloud.google.com/firestore/docs/best-practices)
- [Vercel Documentation](https://vercel.com/docs)
- [Gemini API Reference](https://ai.google.dev/api/rest)