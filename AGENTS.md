# Repository Guidelines

## Project Structure & Module Organization
- Monorepo managed by pnpm; workspace apps live in `apps/` and shared libraries in `packages/`.
- `apps/frontend/` houses the Next.js 14 UI (`app/`, `components/`, `hooks/`, `lib/`); colocate Tailwind-styled JSX and keep feature code within its folder.
- `apps/intent-router/src/` runs the Express meta-router with `routes/` for HTTP handlers, `services/` for LLM routing, and `config.ts` for env wiring.
- `apps/manifest-generator/src/` exposes the Cloud Run manifest CLI; reusable scripts sit in `scripts/`, and `examples/` store sample outputs.
- Automation and long-form docs live in `tools/` and `docs/` respectively; use `docs/` for architecture notes and SOW updates.

## Build, Test, and Development Commands
- `pnpm install` once at repo root to hydrate all workspaces.
- `pnpm dev:frontend` starts the Next.js dev server on port 3000.
- `pnpm dev:router` runs the intent router via TSX on 8080; `pnpm --dir apps/intent-router build` emits `dist/` for production.
- `pnpm dev:manifest` executes the manifest generator locally; `pnpm --dir apps/manifest-generator build` compiles distributables.
- `pnpm type-check` verifies TypeScript across every package before pushing.

## Coding Style & Naming Conventions
- TypeScript-first; keep components PascalCase, hooks/utilities camelCase, and API routes kebab-case.
- Enforce 2-space indentation, single quotes, and trailing commas; exported functions should declare explicit return types.
- Run `pnpm --dir apps/intent-router lint` and `format` to align with shared ESLint/Prettier rules; frontend relies on Next ESLint and Tailwind class ordering.

## Testing Guidelines
- Jest drives unit tests; place specs as `*.test.ts` beside implementations.
- Frontend: `pnpm --dir apps/frontend test:ci`. Intent router: `pnpm --dir apps/intent-router test`. Mock Gemini and Redis for deterministic runs.
- Block PRs until tests and type-checking pass locally or in CI.

## Commit & Pull Request Guidelines
- Follow Conventional Commits (`feat:`, `fix:`, `chore:`). Keep commits focused and include config/doc updates as needed.
- PRs need concise summaries, linked issues or tickets, verification logs (`pnpm ...` output), and UI screenshots or Looms for visual changes.
- Wait for CI green and tag the appropriate service owner (frontend or router) before merging.

## Environment & Configuration Tips
- Use Node.js 18+ and pnpm ≥8. Frontend reads `.env.local` (`NEXT_PUBLIC_API_URL`). Router and manifest generator share `.env` (`PORT`, `GEMINI_API_KEY`, Redis endpoints).
- Default ports: frontend 3000, router 8080, manifest generator 8081. Align reverse proxies and CORS when integrating services.
