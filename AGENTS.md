# Repository Guidelines

## Project Structure & Module Organization
- Monorepo managed by pnpm workspaces.
- `apps/frontend/`: Next.js 14 app (`app/`, `components/`, `hooks/`, `lib/`).
- `apps/intent-router/`: Express meta-router (`src/routes/`, `src/services/`, `src/config.ts`).
- `apps/manifest-generator/`: Cloud Run CLI (`src/`, `scripts/`, `examples/`).
- Shared packages live in `packages/`; long-form docs under `docs/`; automation in `tools/`.

## Cloud-First Architecture (Production Deployed)
- **Frontend**: Deployed on Vercel, connects to GCP Cloud Run backend
- **Backend**: Deployed on Cloud Run (asia-northeast1), auto-scaling 0-10 instances
- **Cache**: Redis Cloud for session/intent caching
- **AI**: Gemini 2.5 Flash/Pro via API integration
- **Secrets**: GCP Secret Manager for sensitive environment variables

## Build, Test, and Development Commands
- `pnpm install`: hydrate all workspaces.
- `pnpm dev`: run frontend with cloud backend (recommended)
- `pnpm test:curl`: test Cloud Run API endpoints
- `pnpm test:intent`: test intent recognition flow
- `pnpm build`: run `pnpm -r --if-present build` across workspaces.
- `pnpm type-check`: type-check every workspace.
- `pnpm --dir apps/frontend test:ci` / `pnpm --dir apps/intent-router test`: run unit suites where defined.

## Coding Style & Naming Conventions
- TypeScript-first, 2-space indentation, single quotes, trailing commas.
- Components/classes in PascalCase, hooks/utilities camelCase, API routes kebab-case.
- Use Prettier/ESLint via `pnpm --dir apps/intent-router lint` and `format`; Next.js ESLint + Tailwind ordering in the frontend.

## Testing Guidelines
- Jest for unit tests; colocate specs as `*.test.ts` beside implementations.
- Mock Gemini/Redis in intent-router tests for deterministic runs.
- Keep coverage meaningful for routing logic and manifest diffing; document gaps in PRs.

## Commit & Pull Request Guidelines
- Follow Conventional Commits (`feat:`, `fix:`, `chore:`…).
- PRs need concise descriptions, linked issues/tickets, CI logs (`pnpm …` output), and screenshots/Looms for UI changes.
- Tag the owning team (frontend vs router) and wait for green CI before merge.

## Security & Configuration Tips
- Use `.env.local` for frontend public settings; `.env` for router/manifest secrets.
- Default ports: 3000 (frontend), 8080 (router), 8081 (manifest). Align reverse proxies accordingly.
- Guard API keys (Gemini, OpenAI, Redis). Never commit secrets; leverage Cloud Run secret manager or Vercel env vars.
- **Important**: PORT is reserved by Cloud Run, don't set it manually in environment variables.

## Performance Optimization (2025-09-29 Updates)
- **Cloud Run optimizations applied**:
  - Min instances: 1 (prevents cold starts)
  - CPU: 2 cores, Memory: 2Gi
  - CPU boost enabled for faster startup
  - HTTP/2 enabled for better performance
  - Concurrency: 100 requests per instance
- **Redis Cloud configured**: Persistent caching with TLS
- **Response times**: ~200-300ms for intent recognition
- **Monitoring**: Health checks at `/health`, metrics at `/metrics`
