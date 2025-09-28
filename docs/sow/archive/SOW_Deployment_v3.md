# Statement of Work v3.0 - AGI Egg Intelligent Router Deployment
## Vercel Edge + GCP Streaming ISR with IMS-Orchestrated Gemini Model Routing

---

## Executive Summary
This Statement of Work defines the production program for AGI Egg's Intelligent Router, combining the Intelligent Streaming Recognizer (ISR) and Intelligent Model Selector (IMS) to deliver adaptive, low-latency intent recognition and governed automation. The solution ingests real-time conversations, enforces tenant scope, selects the optimal Gemini model per chunk, and dispatches manifests/actions with policy controls, observability, and rollback guarantees.

### Architecture Highlights
- **Frontend & Edge**: Next.js on Vercel with edge middleware for auth, session bootstrap, and low-latency WebSocket/SSE ingestion.
- **Streaming Core (ISR)**: Cloud Run streaming pipeline with scope-aware chunking, rolling summarisation, policy engine, manifest resolver, and telemetry sink.
- **Intelligent Model Selector (IMS)**: Deterministic decision engine that routes inference between `gemini-2.5-pro`, `gemini-2.5-flash`, and `gemini-flash-lite-latest` per intent complexity, budget, and tenant policy.
- **Governance & Safety**: Policy gates, compliance filters, dry-run/canary controls, and reviewer workflows triggered by streaming events.
- **Observability**: Unified metrics, logs, traces, and cost analytics for sessions, IMS decisions, and downstream actions.

### Key Enhancements in v3.0
- ✅ End-to-end Intelligent Router integrating ISR and IMS with per-session auto model switching.
- ✅ Adaptive latency/cost management using IMS budgets, cache reuse, and rollback tokens.
- ✅ Dual-channel telemetry (stream + IMS) for auditability and model performance tracking.
- ✅ Expanded rollout plan covering IMS feature flags, model drift monitoring, and A/B experimentation.
- ✅ Updated success metrics and SLOs for streaming latency, model selection accuracy, and cost per active minute.

---

## High-Level Architecture
```mermaid
graph TB
    subgraph Clients
        U[Browser / Mobile / IVR]
    end

    subgraph Edge Services
        A[Next.js Frontend]
        B[Auth & Session API]
        C[Stream Gateway (WS/SSE)]
    end

    subgraph Streaming Pipeline (Cloud Run)
        D[Transcriber]
        E[Scope-Aware Chunker]
        F[Rolling Summariser]
        G[Intent Recogniser]
        H[IMS Selector]
        I[Policy Engine]
        J[Manifest Resolver / Generator]
        K[Action Dispatcher]
        L[Telemetry Sink]
    end

    subgraph State & Data
        M[Firestore Sessions]
        N[Memorystore Redis]
        O[Vector / Cache Store]
        P[Cloud Storage Artifacts]
    end

    subgraph Observability & Governance
        Q[Cloud Logging & Trace]
        R[Cloud Monitoring]
        S[Security Gates]
        T[Approval UI]
    end

    U -->|Audio/Text| A
    A --> B
    B --> C
    C --> D
    D --> E
    E --> F
    F --> G
    G --> H
    H --> G
    H --> I
    I --> J
    J --> K
    K --> S
    S --> T
    C -->|Event Stream| U

    B --> M
    E --> N
    F --> N
    H --> N
    G --> M
    J --> P
    L --> Q
    Q --> R
    H --> L
    K --> L
```

---

## Streaming Intent Lifecycle (ISR)
### Session Lifecycle
- `POST /v1/sessions` provisions `sessionId`, ingest/stream URLs, and scope limits (tenant, domains, tokens, budget, language, piiPolicy).
- Edge gateway upgrades clients to WebSocket/SSE, persists metadata in Firestore, and seeds Redis with rolling summaries & IMS defaults.
- Every ingest payload/event carries `sessionId`, `traceId`, actor identifiers, and IMS signal (`modelId`, `costClass`).
- Sessions auto-expire after idle timeout or cost ceiling; final `session.closed` event includes statistics and IMS summary.

### Pipeline Stages
1. **Ingest Edge** – Normalises payloads, enforces auth/scope, and buffers frames with back pressure.
2. **Transcriber** – (Optional) Converts audio to text via Speech-to-Text or Gemini Live; partial transcripts streamed immediately.
3. **Scope-Aware Chunker** – Maintains sliding token windows per scope, emits boundaries for summariser.
4. **Rolling Summariser & Slot Store** – Compresses conversation into 200–400 token summaries and updates entity/constraint state.
5. **Intent Recogniser** – Calls Gemini via IMS-selected model using JSON-mode prompts plus scope metadata; emits `intent.update` events.
6. **IMS Selector** – Evaluates heuristics, telemetry, and overrides to choose model per chunk; broadcasts `model.selector` events with rationale.
7. **Policy Engine** – Scores risk, cost, and safety flags; emits `policy.decision` (`auto`, `review`, `deny`).
8. **Manifest Resolver / Generator** – Resolves or drafts manifests on `auto` decisions; attaches similarity, confidence, and drift metadata.
9. **Action Dispatcher** – Executes downstream integrations or persists drafts; returns rollback tokens.
10. **Telemetry Sink** – Streams metrics/logs/traces to Cloud Logging/Monitoring with span breakdown `ingest->chunk->ims->llm->policy->dispatch`.

### Streaming Orchestrator Example
```typescript
async function onStreamEvent(event: IngestEvent) {
  const session = await sessions.ensure(event.sessionId);
  const traceId = ensureTrace(event);

  const chunkState = chunker.push(event, session.scope);
  telemetry.emit('chunk.update', { traceId, tokens: chunkState.tokens });

  if (event.type === 'audio') {
    event.text = await transcriber.toText(event.audio);
    stream.emit('transcript.partial', { traceId, text: event.text });
  }

  if (!chunkState.boundary) return;

  const summary = summariser.roll(session.id, chunkState);
  stream.emit('summary.update', { traceId, summary });

  const imsDecision = ims.select({
    summary,
    chunk: chunkState,
    scope: session.scope,
    tenant: session.tenant,
  });
  stream.emit('model.selector', { traceId, ...imsDecision });

  const intent = await intentRecognizer.infer({
    modelId: imsDecision.modelId,
    chunk: chunkState,
    summary,
    session,
  });
  stream.emit('intent.update', { traceId, ...intent });

  const decision = policy.evaluate(intent, imsDecision, session.scope);
  stream.emit('policy.decision', { traceId, decision });

  if (decision.action !== 'AUTO') return;

  const resolution = await manifests.resolve(intent, session.scope);
  const result = await dispatcher.dispatch({ resolution, intent, session });
  stream.emit('action.dispatched', { traceId, result });
}
```

### Event Types
- `model.selector` – `{ modelId, rationale, costClass, latencyBudgetMs, overrides }`.
- `intent.update` – Intent label, slots, confidence, `selectedModel`.
- `policy.decision` – Decision, reasons, guardrail flags.
- `action.dispatched` – Result, rollback token, manifest metadata.
- `stream.error` – Structured errors with retry/backoff hints.

### Resilience & Fallbacks
- IMS maintains priority order (`pro > flash > flash-lite`); on errors, downgrade while logging overrides.
- Redis caches rolling summaries and last IMS decision for rapid reconnection.
- Dry-run and shadow modes emit full events but disable dispatcher side effects.
- Circuit breakers monitor per-model latency and error rates to pre-emptively switch models.

---

## Intelligent Model Selector (IMS)
### Decision Logic
- Inputs: chunk complexity, token count, safety flags, tenant cost class, historical success, model health, manual overrides.
- Outputs: `modelId`, `rationale`, `latencyBudgetMs`, `costClass`, `overrides`, `fallbackChain`.
- Decision Matrix:
  - Complex orchestration, deep reasoning, audit-required -> `gemini-2.5-pro`.
  - Standard routing, balanced cost, moderate tokens -> `gemini-2.5-flash`.
  - Lightweight chat/scripts, low tokens, low risk -> `gemini-flash-lite-latest`.
- Overrides: request headers (`x-ims-model`), tenant configs, feature flags.
- Fallback: degrade to Flash or Flash Lite if selected model unavailable or budget exceeded.

### Module Structure
```
apps/intent-router/src/services/ims/
  selector.ts      # Pure rules + scoring
  client.ts        # Model invocation abstraction
  models/
    gemini-2.5-pro.ts
    gemini-2.5-flash.ts
    gemini-flash-lite-latest.ts
  index.ts         # Public API
  telemetry.ts     # Metrics/log helpers
```

### Telemetry & Controls
- Metrics: `ims_decisions_total{modelId}`, `ims_override_total`, `ims_fallback_total`, `ims_latency_budget_ms`, `ims_cost_class_value`.
- Logs: `logger.info({ imsDecision, sessionId, traceId }, 'IMS decision')`.
- Traces: add span `ims.select` with attributes `modelId`, `path`, `reason`.
- Feature flags: `IMS_ENABLED`, `IMS_POLICY_STRICT`, `IMS_FALLBACK_MODE` via config/Firestore.

---

## Policy & Governance Alignment
- Policy engine evaluates IMS outputs: high-cost models in cost-sensitive tenants trigger `review`.
- Security gates enforce scope, resource limits, and network boundaries before dispatch.
- Reviewer UI surfaces combined `model.selector` and `policy.decision` events for transparency.
- Compliance logging: store hashed transcripts, IMS rationales, and decision outcomes with retention policies.

---

## Observability & Metrics
### Prometheus/Grafana Metrics
```typescript
export const metrics = {
  imsDecisions: new Counter({
    name: 'ims_decisions_total',
    help: 'Total IMS decisions by model',
    labelNames: ['modelId', 'costClass']
  }),
  imsFallbacks: new Counter({
    name: 'ims_fallback_total',
    help: 'Count of IMS fallback activations',
    labelNames: ['from', 'to', 'reason']
  }),
  imsLatencyBudget: new Histogram({
    name: 'ims_latency_budget_ms',
    help: 'Latency budgets assigned per decision',
    buckets: [200, 400, 700, 1000, 1500, 2200]
  }),
  streamLatency: new Histogram({
    name: 'isr_intent_latency_ms',
    help: 'Latency from chunk boundary to intent+policy decision',
    buckets: [200, 400, 700, 1200, 1600, 2200]
  }),
  streamDropRate: new Counter({
    name: 'stream_abnormal_terminations_total',
    help: 'Abnormal session endings',
    labelNames: ['reason']
  })
};
```

### SLO Definitions
```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceLevelObjective
metadata:
  name: agi-egg-intelligent-router-slos
spec:
  objectives:
    - name: "Streaming Intent Latency"
      sli: "histogram_quantile(0.95, isr_intent_latency_ms)"
      target: 2200
      window: "30d"

    - name: "Model Selection Accuracy"
      sli: "sum(rate(ims_expected_decision_total{outcome='match'})) / sum(rate(ims_expected_decision_total))"
      target: 0.92
      window: "30d"

    - name: "Stream Drop Rate"
      sli: "1 - (sum(rate(stream_completed_total)) / sum(rate(stream_started_total)))"
      target: 0.01
      window: "7d"

    - name: "Cost per Active Minute"
      sli: "sum(stream_cost_usd) / sum(stream_active_minutes)"
      target: 0.12
      window: "30d"
```

---

## Testing & Evaluation
- **Unit Tests**: IMS selector rules, chunker boundaries, policy decisions with IMS inputs.
- **Integration Tests**: Simulated streaming sessions verifying event emissions, IMS overrides, manifest dispatch.
- **Load & Chaos**: Soak tests across mixed workloads; forced IMS failures to validate fallback.
- **Replay Harness**: Re-run recorded transcripts to detect regression in intent accuracy/model choice.
- **A/B Experiments**: Evaluate IMS policy tweaks or model updates using feature flags and telemetry segmentation.

---

## Implementation Roadmap
### Phase 1 – Foundation (Week 1)
- Enable required GCP APIs including Gemini streaming and Speech-to-Text.
- Provision VPC/firewall rules for low-latency ingress.
- Finalise IMS decision matrix and config schema.
- Update OpenAPI/types to include IMS fields.

### Phase 2 – Core Streaming & IMS (Weeks 2–3)
- Implement session service (Firestore + Redis) with IMS defaults.
- Build WebSocket/SSE gateway and streaming pipeline improvements.
- Implement IMS selector, clients, telemetry, and fallback logic.
- Integrate IMS with intent recogniser; emit `model.selector` events.
- Harden policy engine to consume IMS metadata.

### Phase 3 – Manifest & Governance (Week 4)
- Wire manifest resolver/generator with streaming dispatcher and IMS-aware cost checks.
- Implement reviewer UI updates to show model decisions and rationales.
- Extend audit logging and notification systems for IMS events.

### Phase 4 – Testing & Tooling (Week 5)
- Build replay harness and regression suites for streaming + IMS.
- Conduct load, chaos, and cost benchmarking.
- Establish dashboards and alerting for latency, drop rate, IMS accuracy.

### Phase 5 – Production Readiness (Week 6)
- Validate rate limiting, quotas, and rollback tokens.
- Perform security review focusing on WebSocket ingress and IMS overrides.
- Finalise disaster recovery plan including session replay and IMS failover.

### Phase 6 – Rollout (Weeks 7–8)
- Shadow mode (IMS compute + ISR events, dispatcher dry-run).
- Canary rollout with IMS auto decisions limited to pilot tenants.
- Gradual traffic increase while monitoring IMS accuracy & cost.
- Full production rollout with documented rollback switch.

---

## Success Metrics
### Technical
- **Intent Latency**: p95 <= 2.2s ingest to `action.dispatched`.
- **First Intent Emission**: p50 <= 700ms from session start.
- **IMS Accuracy**: >= 92% alignment with expected decision matrix.
- **Streaming Availability**: 99.95%.
- **Stream Drop Rate**: < 1% abnormal terminations.

### Business
- **Automation Rate**: > 75% intents auto-executed.
- **Cost per Active Minute**: < $0.12 across blended workloads.
- **Model Cost Savings**: >= 25% reduction vs static `gemini-2.5-pro` baseline.
- **Operator Satisfaction**: > 90% positive feedback on transparency and controls.

### Quality
- **Intent Accuracy**: > 95% on streaming eval set.
- **Policy Override Rate**: < 5%.
- **Rollback Success**: 100% completion of documented rollback drills.
- **Regression Count**: 0 critical across weekly replay harness runs.

---

## Risks & Mitigations
- **Model Drift** – Schedule monthly IMS matrix reviews, maintain validation dataset, enable quick flag-based rollback.
- **Cost Spikes** – Enforce per-tenant budgets, monitor cost per minute, auto-downgrade model on threshold breach.
- **Latency Variability** – Use IMS latency budgets, dynamic chunk sizing, and model fallback cascades.
- **Security Exposure** – Apply mTLS/IAP for edge-to-core, audit overrides, enforce RBAC on IMS controls.

---

## Roles & Responsibilities
| Activity | Owner | Consulted | Informed |
| --- | --- | --- | --- |
| ISR/IMS architecture approval | Backend Lead | AI Research, DevOps | Product |
| IMS selector implementation | Backend Engineer | AI Research | Product |
| Streaming policy/governance | Security Lead | Backend | Product |
| Observability & dashboards | DevOps | Backend | Product |
| Rollout & operations | DevOps | Backend, Product | Leadership |

---

## Deliverables & Handover
- Updated codebase (ISR + IMS modules, configs, tests).
- Revised OpenAPI and type definitions published to `/docs/api/openapi.yaml`.
- Dashboards and alert rules in Cloud Monitoring/Grafana.
- Runbooks covering streaming incidents, IMS overrides, rollback.
- Training session for operators and product stakeholders.

---

**Document Version**: 3.0
**Last Updated**: 2024-09-29
**Authors**: AGI Egg Team
**Review Status**: Draft
