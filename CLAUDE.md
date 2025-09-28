# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AGI Egg is an AI-powered intent routing system that intelligently directs requests to appropriate backend services using Google's Gemini AI for natural language processing and meta-routing capabilities. The system consists of a Next.js frontend, Node.js/Express backend services, and is designed for Google Cloud Run deployment.

## Development Commands

### Root Level Commands
```bash
# Install dependencies (uses pnpm workspaces)
pnpm install

# Development - Start frontend
pnpm dev
pnpm dev:frontend

# Development - Start backend services
pnpm dev:router      # Intent router service (port 8080)
pnpm dev:manifest    # Manifest generator service

# Linting - Run across all packages
pnpm lint

# Type checking - Run across all packages
pnpm type-check
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
```bash
pnpm dev         # Start development with hot reload
pnpm build       # Compile TypeScript to dist/
pnpm start       # Run compiled production build
pnpm test        # Run Jest tests
pnpm lint        # Run ESLint
pnpm type-check  # TypeScript type checking
```

### Backend Commands (apps/manifest-generator/)
```bash
pnpm dev         # Start development server
pnpm build       # Compile TypeScript
pnpm start       # Run production build
pnpm lint        # Run linting
pnpm type-check  # TypeScript type checking
```

## High-Level Architecture

### System Components

1. **Frontend Layer (apps/frontend/)**
   - Next.js 14 with App Router
   - Components organized by feature: intent/, routing/, monitoring/, analytics/, manifests/
   - Glassmorphism UI design with real-time updates
   - API client in lib/ for backend communication

2. **Intent Recognition Router (apps/intent-router/)**
   - Express.js server handling intent analysis and routing decisions
   - Integrates with Google Gemini API for NLP-powered intent classification
   - Meta-routing engine with contextual factors, load balancing, circuit breakers
   - Health monitoring and metrics endpoints
   - WebSocket support via Socket.io for real-time updates

3. **Manifest Generator (apps/manifest-generator/)**
   - Generates optimized Cloud Run manifests using AI assistance
   - Repository pattern for manifest storage and versioning
   - YAML processing with validation

### Key Design Patterns

1. **Service Communication Flow**:
   ```
   Client → Frontend (Next.js) → Intent Router → Meta Routing Engine → Target Service
   ```

2. **Intent Processing Pipeline**:
   - Text analysis using Gemini AI
   - Pattern matching and ML model inference
   - Scoring and routing decision based on confidence
   - Circuit breaker checks and retry logic

3. **Manifest Generation**:
   - Analyzes existing service manifests
   - AI-powered optimization suggestions
   - Schema validation and security checks

## Environment Configuration

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:8080
```

### Intent Router (.env)
```env
PORT=8080
GEMINI_API_KEY=your_gemini_api_key_here
```

## Important Technical Details

- **Package Manager**: pnpm with workspaces (see pnpm-workspace.yaml)
- **TypeScript**: Strict mode enabled across all packages
- **Node Version**: Requires Node.js 18+
- **Deployment Target**: Google Cloud Run (see vercel.json for Vercel config)
- **API Integration**: Google Gemini API for intent analysis
- **Real-time**: Socket.io for WebSocket connections
- **Monitoring**: Prometheus-compatible metrics via prom-client

## Service Endpoints

- Frontend: http://localhost:3000
- Intent Router API: http://localhost:8080
- Manifest Generator: http://localhost:8081 (when implemented)

## Project Structure Notes

- Frontend uses Next.js App Router (app/ directory)
- Backend services follow MVC pattern with routes/, services/, models/
- Manifests stored in deploy/manifests/ directory with service-specific configs
- Custom ESLint runner in tools/eslint-runner.js for backend linting

## Testing Approach

- Frontend uses Jest with React Testing Library
- Backend uses Jest with ts-jest
- Test files should follow *.test.ts or *.spec.ts naming convention
- Run tests before committing changes