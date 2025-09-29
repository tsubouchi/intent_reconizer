# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AGI Egg is an AI-powered intent routing system that intelligently directs requests to appropriate backend services using Google's Gemini AI for natural language processing and meta-routing capabilities. The system implements a cloud-first architecture with three core subsystems: ISR (Intelligent Streaming Recognizer), IMS (Intelligent Model Selector), and AOL (AGI Operations Layer).

## 🚨 CRITICAL: Cloud-First Architecture

**THIS IS NOT A TRADITIONAL LOCAL DEVELOPMENT SETUP:**
- ❌ **DO NOT** use or start local backend (localhost:8080)
- ❌ **DO NOT** run `pnpm dev:router` for local development
- ❌ **DO NOT** use local Redis or in-memory cache
- ✅ **ALWAYS** use GCP Cloud Run backend API
- ✅ **ALWAYS** use Redis Cloud for caching
- ✅ **Frontend runs locally, backend runs in cloud**

**Architecture Flow:**
```
Development: Frontend (localhost:3000) → Backend (GCP Cloud Run) → Redis Cloud
Production:  Frontend (Vercel) → Backend (GCP Cloud Run) → Redis Cloud
```

## Development Commands

### Root Level Commands
```bash
# Install dependencies (uses pnpm workspaces)
pnpm install

# START DEVELOPMENT (Frontend only, uses cloud backend)
pnpm dev          # Primary development command
pnpm start        # Alias for pnpm dev

# Building
pnpm build              # Build all packages
pnpm build:frontend     # Build frontend only
pnpm build:router       # Build backend (for deployment only)

# Code Quality
pnpm lint               # Run linting across all packages
pnpm type-check         # Run TypeScript type checking

# Testing
pnpm test               # Run Cloud Run E2E tests
pnpm test:intent        # Test intent recognition
pnpm test:curl          # Run curl-based tests
pnpm test:quick         # Quick smoke tests

# Deployment Information
pnpm deploy:frontend    # Show frontend deployment instructions
pnpm deploy:backend     # Show backend deployment instructions
pnpm info              # Display architecture information
```

### Frontend Commands (apps/frontend/)
```bash
pnpm dev         # Start development server (port 3000)
pnpm build       # Build for production
pnpm start       # Start production server
pnpm lint        # Run Next.js linting
pnpm test        # Run tests in watch mode
pnpm test:ci     # Run tests in CI mode
pnpm type-check  # TypeScript type checking
```

### Backend Commands (apps/intent-router/)
**Note: Backend runs on GCP Cloud Run. These commands are for deployment preparation only:**
```bash
pnpm build       # Compile TypeScript to dist/
pnpm test        # Run Jest tests
pnpm lint        # Run ESLint
pnpm type-check  # TypeScript type checking

# DO NOT USE for local development:
# pnpm dev       # ← DO NOT USE
# pnpm start     # ← DO NOT USE (unless deploying)
```

## High-Level Architecture

### System Components

```
┌─────────────────────────────────────────────────┐
│              Frontend Layer                      │
│         Next.js 14 on Vercel Edge                │
│    Pages: /, /router, /services, /analytics,     │
│           /manifests                             │
└─────────────────┬───────────────────────────────┘
                  │ HTTPS API Calls
                  ▼
┌─────────────────────────────────────────────────┐
│         Intent Recognition Router                │
│            GCP Cloud Run Service                 │
│   Routes: /health, /api/intent, /api/session,    │
│           /api/manifest, /metrics                │
└────┬──────────────────────────────────┬─────────┘
     │                                  │
     ▼                                  ▼
┌─────────────────────┐    ┌──────────────────────┐
│   Redis Cloud       │    │   Google Gemini API   │
│  Session & Intent   │    │  gemini-2.5-pro      │
│     Caching         │    │  gemini-2.5-flash    │
└─────────────────────┘    │  gemini-flash-lite   │
                           └──────────────────────┘
```

### Key Architectural Patterns

1. **Intent Processing Pipeline**:
   - `IntentRecognitionEngine` → NLP analysis with Natural.js
   - `MLModelService` → Gemini API integration with model selection
   - `ServiceRegistry` → Dynamic service discovery
   - Circuit breaker pattern via `opossum` for resilience

2. **Intelligent Model Selector (IMS)**:
   - Deterministic routing between Gemini models based on:
     - Intent complexity scoring
     - Budget constraints
     - Tenant-specific policies
   - Located in `apps/intent-router/src/services/ims/`

3. **AGI Operations Layer (AOL)**:
   - Continuous monitoring and adaptation loop
   - Playbook-driven automation
   - Autonomy levels (0-4) per tenant
   - Located in `apps/intent-router/src/services/aol/`

4. **Frontend Architecture**:
   - Next.js 14 App Router with RSC support
   - Feature-based component organization:
     - `components/intent/` - Intent analysis UI
     - `components/routing/` - Routing visualization
     - `components/monitoring/` - Service health monitoring
     - `components/manifests/` - Manifest management
   - Glassmorphism UI design system
   - Real-time updates via polling/SSE

## Environment Configuration

### Frontend (.env.local)
```env
# Cloud Run Backend API
NEXT_PUBLIC_API_URL=https://agi-egg-isr-router-1028435695123.us-central1.run.app
NEXT_PUBLIC_MANIFEST_API_URL=https://agi-egg-isr-router-1028435695123.us-central1.run.app

# GCP Configuration
NEXT_PUBLIC_GCP_PROJECT_ID=agi-egg-production
NEXT_PUBLIC_FIREBASE_API_KEY=<firebase-api-key>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=agi-egg-production.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=agi-egg-production

# Gemini API
GEMINI_API_KEY=<gemini-api-key>
NEXT_PUBLIC_GEMINI_API_KEY=<gemini-api-key>
```

### Backend (.env) - For Cloud Run Deployment
```env
PORT=8080
NODE_ENV=production
GCP_PROJECT_ID=agi-egg-production
FIRESTORE_DATABASE=agi-egg-production

# Redis Cloud Configuration
REDIS_URL=redis://default:<password>@redis-13585.c274.us-east-1-3.ec2.redns.redis-cloud.com:13585
REDIS_DATABASE=database-MG4CAJDV
REDIS_TLS=false

# Gemini API
GEMINI_API_KEY=<gemini-api-key>

# Monitoring
LOG_LEVEL=info
ENABLE_TELEMETRY=true

# CORS
ALLOWED_ORIGINS=http://localhost:3000,https://agi-egg.vercel.app,https://*.vercel.app
```

## Deployment Process

### Frontend Deployment (Automatic via Vercel)
```bash
git push origin main  # Automatically triggers Vercel deployment
```

### Backend Deployment (Manual to Cloud Run)
```bash
# 1. Build Docker image
cd apps/intent-router
docker build --platform linux/amd64 -t agi-egg-isr-router .

# 2. Tag and push to Artifact Registry
docker tag agi-egg-isr-router gcr.io/agi-egg-production/agi-egg-isr-router:latest
docker push gcr.io/agi-egg-production/agi-egg-isr-router:latest

# 3. Deploy to Cloud Run
gcloud run deploy agi-egg-isr-router \
  --image gcr.io/agi-egg-production/agi-egg-isr-router:latest \
  --region us-central1 \
  --platform managed

# Or use the deployment scripts:
cd deploy/cloud-run
./deploy.sh
```

### Secret Management
```bash
# Setup all secrets in GCP Secret Manager
./deploy/cloud-run/setup-secrets.sh

# Configure Cloud Run to use secrets
./deploy/cloud-run/configure-cloud-run-secrets.sh
```

## Service Endpoints

### Development
- Frontend: http://localhost:3000
- Backend API: https://agi-egg-isr-router-1028435695123.us-central1.run.app
- Redis: redis-13585.c274.us-east-1-3.ec2.redns.redis-cloud.com:13585

### Production
- Frontend: https://agi-egg.vercel.app
- Backend API: https://agi-egg-isr-router-1028435695123.us-central1.run.app
- Redis: redis-13585.c274.us-east-1-3.ec2.redns.redis-cloud.com:13585

### API Routes
- `POST /api/intent/recognize` - Intent recognition with Gemini
- `POST /api/session/create` - Create streaming session
- `GET /api/session/:id` - Get session details
- `POST /api/manifest/generate` - Generate Cloud Run manifests
- `GET /health/live` - Liveness check
- `GET /health/ready` - Readiness check with dependencies
- `GET /metrics` - Prometheus metrics

## Testing Strategy

### Running Tests
```bash
# Frontend tests
cd apps/frontend
pnpm test        # Watch mode
pnpm test:ci     # CI mode

# Backend tests
cd apps/intent-router
pnpm test        # Run all tests

# E2E tests from root
pnpm test        # Cloud Run integration test
pnpm test:intent # Intent recognition test
pnpm test:curl   # API endpoint tests
```

### Test File Patterns
- Unit tests: `*.test.ts`, `*.spec.ts`
- E2E tests: `tests/e2e/*.test.mjs`
- Integration tests: `tests/*.sh`

## Important Technical Details

- **Package Manager**: pnpm with workspaces (see `pnpm-workspace.yaml`)
- **TypeScript**: Strict mode enabled across all packages
- **Node Version**: Requires Node.js 18+
- **Frontend Framework**: Next.js 14 with App Router
- **Backend Framework**: Express.js with TypeScript
- **Cache**: Redis Cloud (persistent, not local)
- **AI Integration**: Google Gemini API (2.5-pro, 2.5-flash, flash-lite)
- **Monitoring**: Prometheus metrics via prom-client
- **Logging**: Pino for structured logging
- **Rate Limiting**: express-rate-limit with Redis store
- **Circuit Breaker**: Opossum for service resilience

## Common Development Patterns

### Adding New Intent Types
1. Update `apps/intent-router/src/types/index.ts`
2. Add training data to `apps/intent-router/src/services/IntentRecognitionEngine.ts`
3. Update routing rules in `config/routing-rules.json`
4. Add UI components in `apps/frontend/components/intent/`

### Modifying Gemini Model Selection
1. Edit IMS configuration in `apps/intent-router/src/services/ims/ModelSelector.ts`
2. Update scoring algorithms in `apps/intent-router/src/services/ims/ComplexityScorer.ts`
3. Adjust budget constraints in `config/ims-config.json`

### Adding New API Endpoints
1. Create route in `apps/intent-router/src/routes/`
2. Add service logic in `apps/intent-router/src/services/`
3. Update OpenAPI spec in `docs/api/openapi.yaml`
4. Add frontend API client in `apps/frontend/lib/api/`

## Troubleshooting

### Frontend Cannot Connect to Backend
- Verify `NEXT_PUBLIC_API_URL` in `.env.local` points to Cloud Run URL
- Check CORS settings in backend allow localhost:3000
- Ensure Cloud Run service is deployed and running

### Redis Connection Issues
- Verify `REDIS_URL` credentials are correct
- Check Redis Cloud dashboard for connection limits
- Backend falls back to in-memory cache if Redis unavailable

### Gemini API Errors
- Verify `GEMINI_API_KEY` is valid and not expired
- Check quota limits in Google AI Studio
- Review model-specific token limits