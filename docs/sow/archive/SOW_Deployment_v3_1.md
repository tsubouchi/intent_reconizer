# Statement of Work v3.1 - AGI Egg Autonomous Intelligent Router Deployment
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

### Key Enhancements in v3.1
- ✅ End-to-end Autonomous Intelligent Router integrating ISR, IMS, and AOL with per-session model routing and playbook orchestration.
- ✅ Adaptive latency/cost management using IMS budgets, AOL-driven mitigations, cache reuse, and rollback tokens.
- ✅ Dual-channel telemetry (stream + IMS) plus AOL action logs for auditability and continuous learning.
- ✅ Expanded rollout plan covering IMS feature flags, AOL autonomy ramp, model drift monitoring, and A/B experimentation.
- ✅ Updated success metrics and SLOs for streaming latency, model selection accuracy, AOL intervention success, and cost per active minute.

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

    subgraph AGI Operations Layer
        AA[Detect]
        AB[Diagnose]
        AC[Plan]
        AD[Act]
        AE[Verify & Learn]
    end

    subgraph State & Data
        M[Firestore Sessions]
        N[Memorystore Redis]
        O[Vector / Cache Store]
        P[Cloud Storage]
        Y[Playbook Library]
        Z[Skills & Tools Bus]
    end

    subgraph Observability & Governance
        Q[Cloud Logging & Trace]
        R[Cloud Monitoring]
        S[Security Gates]
        T[Approval & Autonomy UI]
    end

    U -->|Audio/Text| A
    A --> B
    B --> C
    C --> D
    D --> E
    E --> F
    F --> G
    G --> H
    H --> I
    I --> J
    J --> K
    K --> S
    S --> T
    C -->|Event Stream| U

    H --> AA
    I --> AA
    L --> AA
    AA --> AB
    AB --> AC
    AC --> AD
    AD --> AE
    AE --> L
    AE --> N

    B --> M
    E --> N
    F --> N
    H --> N
    G --> M
    J --> P
    K --> Y
    AC --> Y
    AD --> Z
    AE --> Z
    L --> Q
    Q --> R
    H --> L
    K --> L
    AD --> S
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

## AGI Operations Layer (AOL)
### Role & Capabilities
- **Detect**: Continuously monitor SLOs, IMS accuracy, safety signals, cost, and business KPIs for anomalies.
- **Diagnose**: Generate ranked root-cause hypotheses using telemetry slices, recent playbook outcomes, and knowledge graphs.
- **Plan**: Compose mitigation plans by matching issues to playbooks (manifest/config patches, feature flags, routing changes, retraining jobs).
- **Act**: Execute scoped actions under guardrails (per session, tenant, or global) with rollback tokens.
- **Verify & Learn**: Validate outcomes against expected metrics, log results, and update thresholds or playbook weights.

### Autonomy Modes & Decision Rights
| Mode | Authority | Typical Behavior |
| --- | --- | --- |
| Observe | Read-only | Surface alerts: "P95 latency trending above SLO by 10%" |
| Propose | Recommend | Draft plan: "Switch tenant X to gemini-2.5-pro for 30 min" with impact estimate |
| Act-Scoped | Execute (bounded) | Apply playbook for a session/tenant, immediate rollback available |
| Act-Global | Execute (global) | Roll out fleet-wide change with human approval window and kill switch |

Tenant configuration (`autonomy.default_mode`) determines the starting level (default: Observe/Propose). Canary tenants graduate to Act-Scoped once success criteria are met; Act-Global requires explicit approval and timeboxing.

### Problem Ontology & Detectors
- **Streaming SLO**: ISR latency, stream drop rate, first intent delay.
- **IMS Anomalies**: Fallback spike, cost per minute variance, expectation mismatch.
- **Quality & Safety**: Hallucination/denial rate increase, safety flag bursts, policy override spikes.
- **Platform**: Error rate surges, manifest resolver failures, config drift, secret expiration.
- **Business**: Automation rate dips, ticket backlog growth, NPS decline (via external hooks).

Detector types include EWMA trend monitors, z-score spike detection, seasonal baselines, canary comparisons, and rule-based thresholds. Each detector emits `aol.detected` events with severity, confidence, and suggested playbook IDs.

### Playbook Framework
- **Registry**: YAML definitions stored in Firestore/Cloud Storage with metadata (`impact`, `risk`, `scope`, `verify.metrics`).
- **Execution Steps**: Sequence of tool invocations (`config.patch`, `ims.policy.patch`, `manifest.rollback`, `ticket.create`).
- **Verification**: Metrics to observe post-action (e.g., latency delta, cost delta, override rate).
- **Learning Hooks**: Capture success/failure, side effects, and operator feedback for continuous improvement.

Example playbook (abridged):
```yaml
id: pb_latency_spike_v1
category: streaming_slo
supportedScopes: ["tenant", "session"]
detect:
  metric: isr_intent_latency_ms
  condition: "p95 > 1800 for 5m"
plan:
  impact: "+15% latency improvement"
  actions:
    - tool: ims.policy.patch
      args: { rule: "complex_intent", model: "gemini-2.5-pro", ttlMin: 30 }
    - tool: chunker.settings.patch
      args: { target_tokens: 220 }
verify:
  metrics:
    - name: isr_intent_latency_ms
      window: "10m"
      success: "p95 < 1500"
rollback:
  tool: ims.policy.restore
  args: { rule: "complex_intent" }
```

### AOL Interfaces
- **API**: `POST /v1/aol/proposals` (create), `POST /v1/aol/execute`, `POST /v1/aol/rollback`, `GET /v1/aol/events`.
- **UI**: Operator console displaying proposals, scopes, impact projections, execution logs, and verification status (Next.js component in `ops/aol-console`).
- **Telemetry**: `aol.proposals_total`, `aol.actions_total{mode}`, `aol.rollback_total`, `aol.mttd_seconds`, `aol.mttr_seconds`, `aol.success_rate`.

---

## Policy & Governance Alignment
- Policy engine evaluates IMS outputs and AOL proposals: high-cost models or high-risk playbooks trigger `review` or require elevated autonomy.
- Security gates enforce scope, resource limits, network boundaries, and AOL action eligibility before dispatch.
- Reviewer UI surfaces combined `model.selector`, `policy.decision`, and `aol.proposal` events for transparency and approvals.
- Compliance logging: store hashed transcripts, IMS rationales, AOL playbook executions, and decision outcomes with retention policies and RBAC.

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
  }),
  aolProposals: new Counter({
    name: 'aol_proposals_total',
    help: 'AOL proposals emitted by autonomy mode',
    labelNames: ['mode', 'severity']
  }),
  aolActions: new Counter({
    name: 'aol_actions_total',
    help: 'AOL actions executed',
    labelNames: ['mode', 'playbookId']
  }),
  aolRollbacks: new Counter({
    name: 'aol_rollbacks_total',
    help: 'Rollbacks triggered after AOL actions',
    labelNames: ['reason']
  }),
  aolMttd: new Histogram({
    name: 'aol_mttd_seconds',
    help: 'Mean time to detect anomalies',
    buckets: [60, 120, 300, 600, 1200]
  }),
  aolMttr: new Histogram({
    name: 'aol_mttr_seconds',
    help: 'Mean time to resolve anomalies after detection',
    buckets: [300, 600, 1200, 1800, 3600]
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

    - name: "AOL Resolution Success"
      sli: "sum(rate(aol_actions_total{outcome='success'})) / sum(rate(aol_actions_total))"
      target: 0.85
      window: "30d"

    - name: "AOL Detection Time"
      sli: "histogram_quantile(0.90, aol_mttd_seconds)"
      target: 300
      window: "30d"
```

---

## Testing & Evaluation
- **Unit Tests**: IMS selector rules, chunker boundaries, policy decisions with IMS inputs.
- **Integration Tests**: Simulated streaming sessions verifying event emissions, IMS overrides, manifest dispatch.
- **AOL Detector Tests**: Synthetic anomaly injections to validate detection thresholds, severity classification, and false-positive bounds.
- **Playbook Simulation**: Dry-run AOL playbooks using shadow mode to ensure actions, verification metrics, and rollback paths behave as expected.
- **Load & Chaos**: Soak tests across mixed workloads; forced IMS/AOL failures to validate fallback and rollback.
- **Replay Harness**: Re-run recorded transcripts and anomaly logs to detect regression in intent accuracy, model choice, and AOL outcomes.
- **A/B Experiments**: Evaluate IMS policy tweaks, AOL autonomy levels, and model updates using feature flags and telemetry segmentation.

---

## Implementation Roadmap
### Phase 1 – Foundation (Week 1)
- Enable required GCP APIs including Gemini streaming and Speech-to-Text.
- Provision VPC/firewall rules for low-latency ingress.
- Finalise IMS decision matrix and config schema.
- Define AOL problem ontology, detector catalogue, and autonomy policy defaults per tenant tier.
- Update OpenAPI/types to include IMS and AOL fields (model decision, autonomy mode, proposal schema).

### Phase 2 – Core Streaming & IMS (Weeks 2–3)
- Implement session service (Firestore + Redis) with IMS defaults.
- Build WebSocket/SSE gateway and streaming pipeline improvements.
- Implement IMS selector, clients, telemetry, and fallback logic.
- Integrate IMS with intent recogniser; emit `model.selector` events.
- Harden policy engine to consume IMS metadata and AOL decision rights.
- Build AOL event bus (`aol.detected`, `aol.proposal`) and initial detectors for latency, cost, and IMS anomalies.

### Phase 3 – Manifest & Governance (Week 4)
- Wire manifest resolver/generator with streaming dispatcher and IMS-aware cost checks.
- Implement reviewer UI updates to show model decisions, AOL proposals, and autonomy status.
- Extend audit logging and notification systems for IMS and AOL events.
- Stand up playbook registry service (Firestore/GCS) and tool adapters (config patch, IMS policy patch, manifest rollback).

### Phase 4 – Testing & Tooling (Week 5)
- Build replay harness and regression suites for streaming + IMS + AOL (detectors and playbooks).
- Conduct load, chaos, and cost benchmarking including AOL fallback scenarios.
- Establish dashboards and alerting for latency, drop rate, IMS accuracy, AOL detection/action success.
- Ship AOL operator console MVP (proposal review, execute, rollback) in Next.js.

### Phase 5 – Production Readiness (Week 6)
- Validate rate limiting, quotas, and rollback tokens.
- Perform security review focusing on WebSocket ingress, IMS overrides, and AOL action RBAC.
- Finalise disaster recovery plan including session replay, IMS failover, and AOL playbook rollback testing.
- Run autonomy dry-runs (Observe/Propose only) and document escalation criteria to Act-Scoped.

### Phase 6 – Rollout (Weeks 7–8)
- Shadow mode (IMS compute + ISR events, AOL detect/propose only, dispatcher dry-run).
- Canary rollout with IMS auto decisions and AOL Act-Scoped limited to pilot tenants.
- Gradual traffic increase while monitoring IMS accuracy, AOL detection/MTTR, and cost.
- Full production rollout with documented rollback switch and AOL kill switch.

---

## Success Metrics
### Technical
- **Intent Latency**: p95 <= 2.2s ingest to `action.dispatched`.
- **First Intent Emission**: p50 <= 700ms from session start.
- **IMS Accuracy**: >= 92% alignment with expected decision matrix.
- **Streaming Availability**: 99.95%.
- **Stream Drop Rate**: < 1% abnormal terminations.
- **AOL Detection Time**: p90 <= 5 minutes from anomaly onset.
- **AOL Resolution Time**: p90 <= 20 minutes from detection to verified recovery.

### Business
- **Automation Rate**: > 75% intents auto-executed.
- **Cost per Active Minute**: < $0.12 across blended workloads.
- **Model Cost Savings**: >= 25% reduction vs static `gemini-2.5-pro` baseline.
- **Proactive Fix Rate**: >= 60% of AOL proposals resolve issues without manual intervention.
- **Operator Satisfaction**: > 90% positive feedback on transparency, controls, and AOL usability.

### Quality
- **Intent Accuracy**: > 95% on streaming eval set.
- **Policy Override Rate**: < 5%.
- **Rollback Success**: 100% completion of documented rollback drills (IMS + AOL).
- **AOL Playbook Success**: >= 85% verification pass rate for executed playbooks.
- **Regression Count**: 0 critical across weekly replay harness runs.

---

## Risks & Mitigations
- **Model Drift** – Schedule monthly IMS matrix reviews, maintain validation dataset, enable quick flag-based rollback.
- **Cost Spikes** – Enforce per-tenant budgets, monitor cost per minute, auto-downgrade model on threshold breach.
- **Latency Variability** – Use IMS latency budgets, dynamic chunk sizing, and model fallback cascades.
- **Autonomy Misfire** – Gate AOL to Observe/Propose by default, require approvals for Act-Scoped/Global, and maintain instant rollback tokens.
- **Detector Blind Spots** – Keep labelled anomaly dataset, run weekly detector calibration, and escalate persistent unknowns to humans.
- **Security Exposure** – Apply mTLS/IAP for edge-to-core, audit overrides, enforce RBAC on IMS/AOL controls, and sign playbook bundles.

---

## Roles & Responsibilities
| Activity | Owner | Consulted | Informed |
| --- | --- | --- | --- |
| ISR/IMS architecture approval | Backend Lead | AI Research, DevOps | Product |
| IMS selector implementation | Backend Engineer | AI Research | Product |
| AOL detector & playbook design | AI Ops Lead | Backend, Data Science | Product |
| Streaming policy/governance | Security Lead | Backend, AI Ops | Product |
| Observability & dashboards | DevOps | Backend, AI Ops | Product |
| Rollout & operations | DevOps | Backend, AI Ops, Product | Leadership |

---

## Deliverables & Handover
- Updated codebase (ISR + IMS + AOL modules, configs, detectors, playbooks, tests).
- Revised OpenAPI and type definitions published to `/docs/api/openapi.yaml` including IMS/AOL schemas.
- Dashboards and alert rules in Cloud Monitoring/Grafana covering ISR, IMS, and AOL metrics.
- Runbooks covering streaming incidents, IMS overrides, AOL autonomy ramp, and rollback.
- AOL playbook registry with seeded Tier-0/Tier-1 playbooks and tool adapters.
- AOL operator console (review/execute/rollback) documented for handover.
- Training session for operators and product stakeholders on autonomy modes and safety controls.

---

**Document Version**: 3.1
**Last Updated**: 2024-09-29
**Authors**: AGI Egg Team
**Review Status**: In Review
