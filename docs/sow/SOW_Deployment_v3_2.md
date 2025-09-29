# Statement of Work v3.2 - AGI Egg Autonomous Intelligent Router Deployment
## Vercel Edge + GCP Streaming ISR with IMS-Orchestrated Gemini Routing and AGI Operations Layer

---

## Executive Summary
This Statement of Work defines the production program for AGI Egg's Autonomous Intelligent Router, combining the Intelligent Streaming Recognizer (ISR), Intelligent Model Selector (IMS), and a new AGI Operations Layer (AOL) to deliver adaptive, low-latency intent recognition, proactive remediation, and governed automation. The platform ingests real-time conversations, enforces tenant scope, dynamically selects the optimal Gemini model, and coordinates playbook-driven responses across detection, diagnosis, action, and learning loops.

### Architecture Highlights
- **Frontend & Edge**: Next.js on Vercel with edge middleware for auth, session bootstrap, and low-latency WebSocket/SSE ingestion.
- **Streaming Core (ISR)**: Cloud Run streaming pipeline with scope-aware chunking, rolling summarisation, policy engine, manifest resolver, and telemetry sink.
- **Intelligent Model Selector (IMS)**: Deterministic decision engine that routes inference between `gemini-2.5-pro`, `gemini-2.5-flash`, and `gemini-flash-lite-latest` per intent complexity, budget, and tenant policy.
- **AGI Operations Layer (AOL)**: Continuous detect-diagnose-plan-act-verify-learn loop that monitors KPIs, drives playbook execution, and coordinates autonomy levels per tenant.
- **Governance & Safety**: Policy gates, autonomy levels, compliance filters, dry-run/canary controls, and reviewer workflows triggered by streaming or AOL events.
- **Observability**: Unified metrics, logs, traces, and cost analytics for sessions, IMS decisions, AOL actions, and downstream results.

### Key Enhancements in v3.2
- ✅ [x] End-to-end Autonomous Intelligent Router integrating ISR, IMS, and AOL with per-session model routing and playbook orchestration.
- ✅ [x] Adaptive latency/cost management using IMS budgets, AOL-driven mitigations, cache reuse, and rollback tokens.
- ✅ [x] Dual-channel telemetry (stream + IMS) plus AOL action logs for auditability and continuous learning.
- ✅ [x] Expanded rollout plan covering IMS feature flags, AOL autonomy ramp, model drift monitoring, and A/B experimentation.
- ✅ [x] Updated success metrics and SLOs for streaming latency, model selection accuracy, AOL intervention success, and cost per active minute.
- ✅ [x] **Production deployment architecture**: Frontend on Vercel, Backend API on GCP Cloud Run, Redis Cloud for caching
- ✅ [x] **Unified API endpoint strategy**: All environments (local/staging/production) use GCP Cloud Run backend exclusively
- ✅ [x] **Redis Cloud integration**: Persistent caching layer deployed and configured for GCP Cloud Run backend
- ✅ [x] **GCP Secret Manager integration**: All sensitive environment variables migrated to Secret Manager with proper IAM bindings

---

## Deployment Architecture (v3.2 Updates)

### Current Production Configuration
```
┌─────────────────────────────────────────────┐
│                 CLIENTS                      │
│  Browser / Mobile / IVR / Local Development  │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│              FRONTEND                        │
│         Next.js on Vercel                    │
│    (agi-egg.vercel.app / localhost:3000)     │
└─────────────────┬───────────────────────────┘
                  │ HTTPS API Calls
                  ▼
┌─────────────────────────────────────────────┐
│           BACKEND API                        │
│      GCP Cloud Run (Always)                  │
│  https://agi-egg-isr-router-*.run.app        │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│          REDIS CLOUD                         │
│     Persistent Cache Layer                   │
│  redis-13585.*.redns.redis-cloud.com:13585   │
└─────────────────────────────────────────────┘
```

### Key Deployment Decisions (Completed)
- [x] **No local backend servers**: localhost:8080 is NOT used, even in development
- [x] **Single API endpoint**: All API calls route to GCP Cloud Run production backend
- [x] **Redis Cloud integration**: Backend on GCP Cloud Run uses Redis Cloud for caching (not in-memory)
- [x] **Environment configuration**: All .env files configured to use GCP Cloud Run URLs

### Development Workflow (Updated)
```bash
# Frontend Development (Local)
cd apps/frontend
pnpm dev              # Runs on localhost:3000, connects to GCP Cloud Run API

# Backend Development
# Code changes are deployed to GCP Cloud Run via:
# 1. Local Docker build
# 2. Push to Artifact Registry
# 3. Deploy to Cloud Run

# ❌ DEPRECATED: Do not use these commands
# pnpm dev:router     # localhost:8080 is not used
# pnpm dev            # parallel frontend+backend not needed
```

### Environment Configuration Status
- [x] **Frontend .env.local**: Points to GCP Cloud Run API
- [x] **Frontend .env.production**: Points to GCP Cloud Run API
- [x] **Frontend .env.local.sample**: Updated with Cloud Run URLs
- [x] **Backend .env**: Configured with Redis Cloud credentials
- [x] **Backend .env.example**: Includes Redis configuration template
- [x] **vercel.json**: Configured for frontend deployment with API URL injection
- [x] **package.json scripts**: Updated to reflect new development workflow

---

## GCP Secret Manager Configuration (New in v3.2)

### Configured Secrets
All sensitive environment variables have been migrated to GCP Secret Manager for enhanced security:

#### Frontend Secrets
- [x] `frontend-api-url`: Cloud Run API endpoint
- [x] `frontend-manifest-api-url`: Manifest service endpoint
- [x] `gcp-project-id`: GCP project identifier
- [x] `firebase-api-key`: Firebase authentication API key
- [x] `firebase-auth-domain`: Firebase auth domain
- [x] `firebase-project-id`: Firebase project identifier
- [x] `gemini-api-key`: Gemini AI API key

#### Backend Secrets
- [x] `backend-port`: Server port configuration
- [x] `backend-node-env`: Node environment setting
- [x] `firestore-database`: Firestore database name
- [x] `redis-url`: Redis Cloud connection string
- [x] `redis-database`: Redis database identifier
- [x] `redis-tls`: TLS configuration for Redis
- [x] `log-level`: Logging level configuration
- [x] `enable-telemetry`: Telemetry enablement flag
- [x] `allowed-origins`: CORS allowed origins list

### Setup Scripts
- [x] `deploy/cloud-run/setup-secrets.sh`: Creates all secrets in Secret Manager
- [x] `deploy/cloud-run/configure-cloud-run-secrets.sh`: Configures Cloud Run to use secrets
- [x] `deploy/vercel/setup-vercel-env.md`: Documentation for Vercel environment setup

### Access Management
- Cloud Run service account has been granted `secretmanager.secretAccessor` role
- Secrets are accessed via environment variable injection at runtime
- Automatic secret rotation capability enabled

---

## Redis Cloud Configuration (New in v3.2)

### Connection Details
```yaml
Database: database-MG4CAJDV
Host: redis-13585.c274.us-east-1-3.ec2.redns.redis-cloud.com
Port: 13585
Protocol: redis://
TLS: Configurable based on environment
```

### Integration Points
- [x] **Session caching**: Rolling summaries and IMS decisions
- [x] **Intent caching**: Recent intent classifications for rapid reconnection
- [x] **Metrics buffering**: Temporary storage for telemetry aggregation
- [x] **Circuit breaker state**: Persistent state for resilience patterns

### Redis Fallback Strategy
1. Primary: Redis Cloud (persistent, shared across instances)
2. Fallback: In-memory cache (if Redis unavailable)
3. Logging: Clear indicators when running in fallback mode

---

## Updated Package Scripts (v3.2)

```json
{
  "scripts": {
    "build": "pnpm -r --if-present build",
    "build:frontend": "pnpm --dir apps/frontend build",
    "build:router": "pnpm --dir apps/intent-router build",
    "dev:frontend": "pnpm --dir apps/frontend dev",
    "// dev:router": "DEPRECATED - Backend runs on GCP Cloud Run only",
    "lint": "pnpm -r --if-present lint",
    "type-check": "pnpm -r --if-present type-check",
    "deploy:frontend": "vercel --prod",
    "deploy:backend": "See deploy/cloud-run/DEPLOYMENT_GUIDE.md"
  }
}
```

---

## High-Level Architecture (Unchanged from v3.1)
[Previous architecture diagram remains valid]

---

## Deployment Checklist (New in v3.2)

### Prerequisites (Completed)
- [x] GCP Project configured (agi-egg-production)
- [x] Artifact Registry repository created
- [x] Cloud Run service deployed
- [x] Redis Cloud account and database provisioned
- [x] Vercel project linked to GitHub repository
- [x] Environment variables configured in all services

### Frontend Deployment (Vercel)
- [x] Push to main branch triggers automatic deployment
- [x] Environment variables set in Vercel dashboard
- [x] Custom domain configured (if applicable)
- [x] API endpoint verified in production

### Backend Deployment (GCP Cloud Run)
- [x] Docker image built locally with --platform linux/amd64
- [x] Image pushed to Artifact Registry
- [x] Cloud Run service updated with new image
- [x] Redis connection verified in logs
- [x] Health endpoints responding correctly

### Monitoring & Observability
- [x] Cloud Run metrics dashboard configured
- [x] Redis Cloud monitoring enabled
- [x] Vercel analytics integrated
- [ ] Custom alerts configured (pending)
- [ ] SLO dashboards created (pending)

---

## Testing & Validation (Updated)

### Integration Testing
- [x] Frontend to Cloud Run API connectivity
- [x] Redis Cloud connection from Cloud Run
- [x] WebSocket/SSE streaming (if applicable)
- [x] CORS configuration validated
- [x] Authentication flow (if implemented)

### Performance Testing
- [ ] Load testing against Cloud Run endpoint
- [ ] Redis cache hit ratio analysis
- [ ] Latency measurements across regions
- [ ] Cost analysis per request type

---

## Security Considerations (Updated)

### API Security
- [x] HTTPS enforced on all endpoints
- [x] CORS configured for known origins
- [ ] Rate limiting implemented
- [ ] API key rotation schedule defined

### Secret Management
- [x] Gemini API keys in environment variables
- [x] Redis credentials secured
- [x] Migration to Secret Manager completed
- [ ] Regular security audits scheduled

---

## Cost Optimization (New in v3.2)

### Current Cost Structure
- **Frontend (Vercel)**: Free tier / Pro plan based on usage
- **Backend (Cloud Run)**: Pay-per-request model
- **Redis Cloud**: Fixed monthly cost for allocated resources
- **Gemini API**: Usage-based pricing

### Optimization Strategies
- [x] Cloud Run autoscaling configured (min: 0, max: 100)
- [x] Redis cache TTL optimized for cost/performance balance
- [ ] CDN caching for static assets
- [ ] Request batching for Gemini API calls

---

## Rollback Procedures (Updated)

### Frontend Rollback
```bash
# Via Vercel Dashboard
# 1. Navigate to Deployments
# 2. Select previous stable deployment
# 3. Click "Promote to Production"
```

### Backend Rollback
```bash
# Via Cloud Run Console
# 1. Navigate to Revisions tab
# 2. Select previous stable revision
# 3. Route 100% traffic to stable revision

# Or via gcloud CLI
gcloud run services update-traffic agi-egg-isr-router \
  --to-revisions=REVISION_NAME=100 \
  --region=us-central1
```

---

## Known Issues & Limitations

### Current Limitations
- Local development requires internet connectivity (API dependency)
- Redis Cloud has regional latency considerations
- Cloud Run cold starts may affect first request latency

### Planned Improvements
- [ ] Edge caching implementation
- [ ] Multi-region deployment
- [ ] Websocket persistent connections
- [ ] Batch processing capabilities

---

## Support & Maintenance

### Monitoring Endpoints
- Frontend: https://agi-egg.vercel.app/api/health
- Backend: https://agi-egg-isr-router-*.run.app/health/live
- Redis: Monitored via Redis Cloud dashboard

### Incident Response
1. Check service health endpoints
2. Review Cloud Run logs in GCP Console
3. Verify Redis Cloud connectivity
4. Check Vercel deployment status
5. Rollback if necessary using procedures above

---

**Document Version**: 3.2
**Last Updated**: 2024-09-29
**Authors**: AGI Egg Team
**Review Status**: Production Deployed
**Deployment Status**:
- Frontend: ✅ Deployed on Vercel
- Backend: ✅ Deployed on GCP Cloud Run
- Cache: ✅ Redis Cloud Connected
- Development Environment: ✅ Configured for Cloud-First Architecture