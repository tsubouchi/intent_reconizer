# Statement of Work - Intelligent Model Selector (IMS)
## Project: AGI Egg Neural Router

---

## 1. Executive Overview
- Deliver an Intelligent Model Selector (IMS) that dynamically routes LLM workloads inside `apps/intent-router`.
- Target Gemini family: `gemini-2.5-pro` for complex reasoning, `gemini-2.5-flash` for standard flows, `gemini-flash-lite-latest` for lightweight chat/scripts.
- Outcome: lower latency and spend while preserving high-confidence routing decisions.

---

## 2. Scope & Objectives
- **In Scope**: service design, TypeScript implementation, configuration, integration tests, operational dashboards, documentation.
- **Out of Scope**: billing automation, UI work beyond displaying IMS metadata, changes to manifest-generator service.
- **Success Criteria**: IMS exposes a deterministic API, auto-selects models per policy, emits telemetry, and can be overridden per tenant/request.

---

## 3. Current Context
- Monorepo with `apps/intent-router` managing intent recognition using Gemini 2.5 Pro only.
- Frontend (`apps/frontend`) displays routing insights but lacks visibility into model choice.
- Service configuration managed through environment variables and `config.ts`.

---

## 4. Functional Requirements
- Compute a `modelDecision` based on request complexity attributes (tokens, intent difficulty, policy flags, customer tier).
- Provide manual overrides through request metadata and environment defaults.
- Return model info inside routing responses (`recognizedIntent.modelId`, `latencyBudget`, `costClass`).
- Persist decision rationale to telemetry (`model.selector` event).
- Fail safely: downgrade to `gemini-2.5-flash` when IMS is unavailable.

### Decision Matrix
| Scenario | Indicators | Model | Rationale |
| --- | --- | --- | --- |
| Complex orchestration | `requiresDeepReasoning` \| `contextTokens > 6000` \| `policy.requiresAudit` | `gemini-2.5-pro` | Maximum reasoning depth and reliability |
| Standard routing | Default | `gemini-2.5-flash` | Balanced latency/cost |
| Lightweight chat/automation | `isSmallTalk` \| `scriptExecution` \| `contextTokens < 1200` | `gemini-flash-lite-latest` | Fast responses, lowest cost |

---

## 5. Technical Approach
### 5.1 Service Boundaries
- Create `apps/intent-router/src/services/ims/` with:
  - `selector.ts` – pure decision logic, accepts `IMSInput` and returns `IMSDecision`.
  - `client.ts` – wraps Google GenAI SDK, instantiates per model.
  - `index.ts` – public interface consumed by routing pipeline.
- Update `services/intentAnalyzer.ts` (or equivalent) to call `IMS.select(...)` before LLM invocation.

### 5.2 Configuration
- Extend `config.ts` with:
  - `IMS_DEFAULT_MODEL`, `IMS_ENABLED_MODELS`, `IMS_OVERRIDE_HEADER`, `IMS_TELEMETRY_STREAM`.
  - Per-model budgets (latency, token, cost) and toggles.
- Allow tenant-scoped overrides via Redis/Firestore (reuse existing session/tenant config object).

### 5.3 Model Client Templates
Use shared dependency `@google/genai` (ensure installed in workspace). Provide per-model client wrappers; generated modules reside under `apps/intent-router/src/services/ims/models/`.

#### `models/gemini-2.5-pro.ts`
```typescript
// npm install @google/genai mime && npm install -D @types/node
import { GoogleGenAI } from '@google/genai'

const modelId = 'gemini-2.5-pro'

export async function runGemini25Pro(input: string, config: Record<string, unknown>) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const tools = [{ googleSearch: {} }]
  const response = await ai.models.generateContentStream({
    model: modelId,
    config: { thinkingConfig: { thinkingBudget: -1 }, tools, ...config },
    contents: [{ role: 'user', parts: [{ text: input }] }],
  })
  const chunks: string[] = []
  for await (const chunk of response) {
    if (chunk.text) chunks.push(chunk.text)
  }
  return chunks.join('')
}
```

#### `models/gemini-2.5-flash.ts`
```typescript
import { GoogleGenAI } from '@google/genai'

const modelId = 'gemini-2.5-flash'

export async function runGemini25Flash(input: string, config: Record<string, unknown>) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const tools = [{ googleSearch: {} }]
  const response = await ai.models.generateContentStream({
    model: modelId,
    config: { thinkingConfig: { thinkingBudget: -1 }, tools, ...config },
    contents: [{ role: 'user', parts: [{ text: input }] }],
  })
  const chunks: string[] = []
  for await (const chunk of response) {
    if (chunk.text) chunks.push(chunk.text)
  }
  return chunks.join('')
}
```

#### `models/gemini-flash-lite-latest.ts`
```typescript
import { GoogleGenAI } from '@google/genai'

const modelId = 'gemini-flash-lite-latest'

export async function runGeminiFlashLite(input: string, config: Record<string, unknown>) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const tools = [{ googleSearch: {} }]
  const response = await ai.models.generateContentStream({
    model: modelId,
    config: { thinkingConfig: { thinkingBudget: 0 }, tools, ...config },
    contents: [{ role: 'user', parts: [{ text: input }] }],
  })
  const chunks: string[] = []
  for await (const chunk of response) {
    if (chunk.text) chunks.push(chunk.text)
  }
  return chunks.join('')
}
```

### 5.4 Selection Engine Sketch
```typescript
export function chooseModel(input: IMSInput): IMSDecision {
  if (input.overrideModel && enabled(input.overrideModel)) {
    return decision(input.overrideModel, 'override', 'request override header')
  }
  if (input.requiresDeepReasoning || input.contextTokens > 6000 || input.policy.requiresAudit) {
    return decision('gemini-2.5-pro', 'rule:complex', 'high complexity detected')
  }
  if (input.isSmallTalk || input.contextTokens < 1200 || input.scriptExecution) {
    return decision('gemini-flash-lite-latest', 'rule:light', 'lightweight conversation/script')
  }
  return decision('gemini-2.5-flash', 'rule:default', 'standard routing workload')
}
```
- Return structure includes `modelId`, `confidence`, `latencyBudgetMs`, `costClass`, `explanation`.
- Emit `telemetry.publish('model.selector', decision)`.

### 5.5 API & Contract Updates
- Update intent recognition API response schema (OpenAPI + `types.ts`) to include:
  - `modelDecision`: `{ modelId: string; rationale: string; overrides?: boolean; }`
  - `latencyBudgetMs` and `costClass` for UI display.
- Document new request headers (e.g., `x-ims-model`, `x-ims-cost-class`).

### 5.6 Observability
- Instrument with Prometheus counters/histograms: `ims_decisions_total{modelId}`, `ims_latency_budget_ms`, `ims_override_total`.
- Include decision metadata in Pino logs (`logger.info({ imsDecision }, 'IMS decision')`).

---

## 6. Workstreams & Deliverables
1. **Design Finalisation (1 wk)** – Decision matrix validation, config specs, schema updates.
2. **Implementation (2 wks)** – Selector + clients, pipeline integration, config wiring.
3. **Testing & Validation (1 wk)** – Unit tests (decision rules), integration tests (mock GenAI), load test.
4. **Observability & Ops (0.5 wk)** – Metrics, logging, dashboards.
5. **Documentation & Handover (0.5 wk)** – Runbooks, README updates, training.

Deliverables: code changes, updated API specs, dashboards, operational guide, release notes.

---

## 7. Acceptance Criteria
- IMS decisions reproduce expected matrix across regression suite (≥95% coverage of rule combinations).
- Manual override and fallback paths validated in staging.
- Telemetry visible in Grafana/Cloud Monitoring with per-model breakdown.
- Frontend displays selected model and rationale in router UI.
- Rollback plan documented (feature flag to disable IMS).

---

## 8. Testing Strategy
- **Unit**: `selector.spec.ts` verifying rule rankings, override priority, edge cases.
- **Integration**: simulate intent routing flow ensuring model invocation matches decision.
- **Load**: soak test with mixed workloads to confirm latency budgets.
- **Chaos**: disable IMS service to verify fallback to `gemini-2.5-flash`.

---

## 9. Risks & Mitigations
- **Incorrect classification** → provide audit logging and manual override; iterate on heuristics.
- **SDK limits/cost spikes** → enforce rate limits per model; monitor spend via telemetry.
- **Latency variance** → apply circuit breaker thresholds and degrade gracefully to Flash Lite.

---

## 10. Dependencies
- Access to Gemini API keys with permission for all three models.
- Updated pnpm workspace dependencies (`@google/genai`, `mime`).
- Coordination with DevOps for environment variables and monitoring.

---

## 11. Roles & RACI
| Activity | Owner | Consulted | Informed |
| --- | --- | --- | --- |
| IMS design approval | Backend Lead | Product, AI Research | QA, DevOps |
| Selector implementation | Backend Engineer | AI Research | Product |
| Model validation | AI Research | Backend | Product |
| Deployment & monitoring | DevOps | Backend | Product |

---

## 12. Handover Checklist
- Merge request with IMS module
- Updated `README`/`AGENTS.md` with IMS usage notes
- Runbook covering overrides, feature flag, and troubleshooting
- Post-deployment validation plan and owner assigned

---

## Appendix A: Model Execution Examples
The following scripts show direct usage for each Gemini model. Replace `INSERT_INPUT_HERE` with runtime prompts.

```typescript
// models/gemini-2.5-pro
// Requires: npm install @google/genai mime && npm install -D @types/node
import { GoogleGenAI } from '@google/genai'

async function main() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const tools = [{ googleSearch: {} }]
  const config = { thinkingConfig: { thinkingBudget: -1 }, tools }
  const model = 'gemini-2.5-pro'
  const contents = [{ role: 'user', parts: [{ text: `INSERT_INPUT_HERE` }] }]
  const response = await ai.models.generateContentStream({ model, config, contents })
  for await (const chunk of response) console.log(chunk.text)
}

main()
```

```typescript
// models/gemini-2.5-flash
import { GoogleGenAI } from '@google/genai'

async function main() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const tools = [{ googleSearch: {} }]
  const config = { thinkingConfig: { thinkingBudget: -1 }, tools }
  const model = 'gemini-2.5-flash'
  const contents = [{ role: 'user', parts: [{ text: `INSERT_INPUT_HERE` }] }]
  const response = await ai.models.generateContentStream({ model, config, contents })
  for await (const chunk of response) console.log(chunk.text)
}

main()
```

```typescript
// models/gemini-flash-lite-latest
import { GoogleGenAI } from '@google/genai'

async function main() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const tools = [{ googleSearch: {} }]
  const config = { thinkingConfig: { thinkingBudget: 0 }, tools }
  const model = 'gemini-flash-lite-latest'
  const contents = [{ role: 'user', parts: [{ text: `INSERT_INPUT_HERE` }] }]
  const response = await ai.models.generateContentStream({ model, config, contents })
  for await (const chunk of response) console.log(chunk.text)
}

main()
```
