# AGI Egg - Neural Network Router System

Next-generation, AI-assisted intent routing platform combining a modern Next.js control plane with LLM-driven meta-routing and automated Cloud Run manifest management.

## Features
- **Intent Intelligence** – Google Gemini-powered analysis and routing with confidence scoring and fallbacks.
- **Operational Visibility** – Real-time health, metrics, and analytics surfaced through the frontend dashboard.
- **Manifest Automation** – CLI and service flows that generate and optimize Cloud Run manifests from live telemetry.
- **Monorepo Tooling** – Single pnpm workspace with shared type-checking, linting, and docs to streamline collaboration.

## Project Layout
```
hackathon0928/
├── apps/
│   ├── frontend/            # Next.js 14 UI (app router, components, hooks, lib)
│   ├── intent-router/       # Express meta-router (routes/, services/, config.ts)
│   └── manifest-generator/  # Manifest CLI/service (src/, scripts/, examples/)
├── api/                     # OpenAPI specification (openapi.yaml)
├── deploy/                  # Cloud Run manifests and deployment assets
├── docs/                    # Architecture, process, SOW, feedback references
├── packages/                # Shared libraries (populate as needs grow)
├── tools/                   # Automation utilities (ESLint runner, etc.)
└── AGENTS.md                # Contributor quick-start guide for AI/code assistants
```

## Getting Started
1. **Prerequisites:** Node.js 18+, pnpm ≥8, optional Docker & gcloud for deployments.
2. **Install dependencies:**
   ```bash
   pnpm install
   ```
3. **Environment configuration:**
   - `apps/frontend/.env.local`: `NEXT_PUBLIC_API_URL=http://localhost:8080`
   - `apps/intent-router/.env`: `PORT=8080`, `GEMINI_API_KEY=<token>`, Redis endpoints as needed
   - `apps/manifest-generator/.env` (optional): reuse Gemini credentials

## Development Workflow
- Frontend dev server (port 3000):
  ```bash
  pnpm dev:frontend
  ```
- Intent router watcher (port 8080):
  ```bash
  pnpm dev:router
  ```
- Manifest generator local run (port 8081/CLI):
  ```bash
  pnpm dev:manifest
  ```
- Type safety sweep across workspaces:
  ```bash
  pnpm type-check
  ```

## Quality & Testing
- Frontend tests:
  ```bash
  pnpm --dir apps/frontend test:ci
  ```
- Router unit tests:
  ```bash
  pnpm --dir apps/intent-router test
  ```
- Lint and format (router/manifest):
  ```bash
  pnpm --dir apps/intent-router lint
  pnpm --dir apps/intent-router format
  pnpm --dir apps/manifest-generator lint
  ```
- Follow Jest naming `*.test.ts` beside implementations; mock Gemini/Redis for deterministic runs.

## Deployment Notes
- Default service ports: frontend 3000, intent router 8080, manifest generator 8081.
- Update `deploy/` manifests when application contracts change; reference `api/openapi.yaml` before publishing API updates.
- Cloud Run builds typically run `pnpm --dir apps/<workspace> build` prior to containerization.

## Contribution Guidelines
- Use Conventional Commits (`feat:`, `fix:`, `chore:`) and keep changesets focused.
- PR checklist: summary, linked issue/ticket, `pnpm` command logs, screenshots or Loom for UI tweaks, CI green.
- Coordinate service ownership: tag frontend or router maintainers as appropriate and ensure docs under `docs/` stay aligned with shipped behavior.
