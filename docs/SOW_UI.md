# UI Annex for SOW v3.1

This document translates the SOW v3.1 requirements into concrete UI constructs for the Next.js console. It preserves the existing neon-glass visual language while layering in the ISR + IMS + AOL features. Where the backend is unavailable, the UI will surface mocked data with clear annotations.

---

## 1. Router Console — Input / Output Core Flow

### Purpose
Deliver a user-first workspace where an operator can submit raw text, understand the detected intent immediately, and receive an actionable recommendation in one glance. Diagnostics, IMS evidence, and policy rationales are secondary panels that support trust without overwhelming the primary experience.

### Primary UX Goals
1. **Clear Input → Analysis → Result flow** — the screen reads top-to-bottom like a wizard, so first-time users instantly know where to start and what to expect next.
2. **Instant comprehension** — the output headline provides a one-to-two line narrative summary with confidence and recommended action.
3. **Guided follow-up** — surfaced recommendations (playbook, escalation, or manifest action) are actionable buttons directly under the summary.
4. **Evidence on demand** — advanced details (IMS model choice, policy scoring, dispatcher logs) stay collapsible, signalling availability without crowding the core view.
5. **Immersive input canvas** — an oversized, multi-line surface supports long transcripts and structured JSON without forcing users into external editors.

### Data Sources & Responsiveness
- **Input pane** posts to `/intent/recognize` or `/intent/analyze` via `useIntentRouter`.
- **Output cards** auto-populate from the latest `IntentResponse`, `ModelDecision`, `PolicyDecision`, and dispatcher metadata. No manual overrides exist; the IMS pipeline is the source of truth.
- Timeline events stream from `/ws/stream` (future) or poll `/events/session/{id}` until WebSocket/SSE is wired. In sandboxed demos the UI replays canned `model.selector`, `policy.decision`, and `action.dispatched` payloads.

### Interaction Flow
1. **Input** – Operator submits text/API payload via the primary canvas.
2. **Analysis** – Console visibly works through the pipeline with a spinner + stepper (Listening → Chunking → Summarising → IMS → Policy → Manifest), showing progress updates as telemetry lands.
3. **Result** – The Intent Summary headline appears with a brief explanation, confidence, recommended action, and primary buttons (Apply, Escalate, Copy result).
4. **Detail** – Optional drawers expose IMS, policy, dispatch, and manifest evidence; a structured execution report outlines what was done.
5. **Timeline** – Streaming events remain hidden until expanded, keeping the base experience approachable.

### ASCII Wireframe — Router Console (Input → Analysis → Result)
```
+--------------------------------------------------------------------------------+
| Router Console                                                                  |
|---------------------------------------------------------------------------------|
| Tabs: [Router - active] [Services] [Analytics] [Autonomy] [Manifest]            |
|                                                                                 |
| INPUT                                                                            |
| ───────────────────────────────────────────────────────────────────────────────  |
| [ textarea.................................................................... ] |
| [ textarea.................................................................... ] |
| [ textarea.................................................................... ] |
| • Quick Samples: Reset password | Process payment | Generate report              |
| • Advanced options (path/method/header) ▾                                       |
| [ Analyze Intent ]                                                              |
|                                                                                 |
| ANALYSIS                                                                        |
| ───────────────────────────────────────────────────────────────────────────────  |
| [⟳] Thinking...                                                                  |
| Stepper: Listening → Chunking → Summarising → IMS → Policy → Manifest            |
| Progress chips: Listening 100% | Chunking 100% | Summarising 60% | ...           |
| Shared rail: Design → Build → Validate → Deploy → Verify                         |
|                                                                                 |
| RESULT                                                                          |
| ───────────────────────────────────────────────────────────────────────────────  |
| Summary: "Customer needs assistance renewing their subscription."               |
| Details: Intent = Subscription renewal assistance | Confidence = 94%             |
| Recommended action: Trigger playbook "billing_retry_v2"                         |
| Primary buttons: [Apply Playbook] [Escalate to Human] [Copy Result]              |
|                                                                                 |
| Result detail cards (expand as needed):                                         |
|   ▸ Suggested follow-up checklist (contact customer, send invoice link, etc.)   |
|   ▸ Model decision (collapsed)                                                  |
|       Model: gemini-2.5-pro | Cost class: high | Budget: 1800 ms | Fallback: …  |
|   ▸ Policy & guardrails (collapsed)                                             |
|       Action: AUTO | Risk: 0.32 | Guardrails satisfied                          |
|   ▸ Manifest & deployment (collapsed)                                           |
|       Design → Build → Validate → Deploy → Verify                               |
|   ▸ Execution report (collapsed)                                                |
|       Manifest diff, telemetry snapshots, rollback token                        |
|                                                                                 |
| Event timeline ▾ (expand to inspect detailed logs)                               |
| ┌─────────────────────────────────────────────────────────────────────────────┐ |
| │ [12:05] action.dispatched → {...}                                             │ |
| │ [12:04] policy.decision  → {...}                                              │ |
| │ [12:03] model.selector   → {...}                                              │ |
| └─────────────────────────────────────────────────────────────────────────────┘ |
|                                                                                 |
| Footer: Router status chip | API URL indicator                                  |
+--------------------------------------------------------------------------------+
```

### Key Notes
- **Input** remains visually dominant until submission, emphasizing the start point for new sessions.
- **Analysis** section provides both a spinner and descriptive step labels so non-technical operators understand what is happening.
- **Result** headline gives the short summary, with action buttons and a follow-up checklist immediately accessible.
- Supporting drawers (IMS, policy, manifest, execution report) default to collapsed state, surfacing evidence only when needed.

#### Output Breakdown
- **Summary**: A plain-language statement (1–2 lines) answering "What did the system conclude?".
- **Details row**: Key metrics (intent label, confidence, recommended action) formatted in a single line for rapid scanning.
- **Action buttons**: Apply recommended playbook, escalate to human, or copy the summary for notes.
- **Suggested follow-up checklist**: Optional list guiding the operator through next steps.
- **Execution report**: Collapsible section showing manifest draft/applied status, telemetry, rollback token, and timestamps.

#### Manifest Lifecycle Alignment
- Reuse a five-step rail `Design -> Build -> Validate -> Deploy -> Verify` directly under the Analysis stepper.
- Each stage maps to router concepts (Design = Intent clarification, Build = Manifest draft, Validate = Policy guardrails, Deploy = Action dispatch, Verify = Telemetry check).
- The same rail appears in the Manifest tab during refresh jobs so operators recognise progress semantics across the app.
- Manifest generation status (for example "Draft ready", "Awaiting approval") updates inline with badges without overwhelming the primary summary.

---

## 2. Autonomy (AOL) Operations Console

### Purpose
Give AI Ops teams a mission console for AOL detectors, proposals, approvals, and rollbacks. It mirrors SOW expectations for autonomy oversight.

### ASCII Wireframe — AOL Console
```
+--------------------------------------------------------------------------------+
| Autonomy Console                                                                |
|---------------------------------------------------------------------------------|
| Summary Cards: [Active Mode: Observe] [Proposals: 6] [Success Rate: 82%] [...]  |
|                                                                                 |
| +-----------------------+   +-----------------------------------------------+   |
| | Proposal Queue        |   | Execution Details (selected proposal)         |   |
| |-----------------------|   |-----------------------------------------------|   |
| | • prop_9812  critical |   | Status: pending → executing                    |   |
| |   Scope: tenant:acme  |   | Requested Mode: act_scoped                     |   |
| |   Detector: latency   |   | Impact: +15% latency relief                    |   |
| |   Updated: 12:04      |   | Steps:                                        |   |
| |   [Execute] [Review]  |   | 1) ims.policy.patch(...)                       |   |
| |-----------------------|   | 2) chunker.settings.patch(...)                 |   |
| | • prop_9777  warning  |   | Verification Targets:                          |   |
| | ...                   |   |  - isr_intent_latency_ms p95 < 1500 (10m)      |   |
| |                       |   | Telemetry Snapshot:                            |   |
| | Filters: [All ▾]      |   |  • cpu: 72% • error: 0.8% • mttd: 240s         |   |
| +-----------------------+   |-----------------------------------------------|   |
|                              | Actions: [Execute] [Rollback] [Attach Notes]  |   |
|                              +-----------------------------------------------+   |
|                                                                                 |
| Event Feed (auto-scroll)                                                        |
| ┌───────────────────────────────────────────────────────────────────────────┐  |
| │ [00:13:22] aol.detected  severity=critical, detector=latency_spike_v1     │  |
| │ [00:13:24] aol.proposal  prop_9812 queued                                 │  |
| │ [00:13:58] aol.actions_total{mode=act_scoped} increment                    │  |
| └───────────────────────────────────────────────────────────────────────────┘  |
+--------------------------------------------------------------------------------+
```

### Behavioural Highlights
- Execution buttons call `/v1/aol/proposals/{id}/execute` or `/rollback`, requiring confirmation modals when autonomy mode > Act-Scoped.
- Event feed reuses the timeline component pattern for consistency.
- Success metrics align with SOW SLOs (MTTD, MTTR, success_rate).

---

## 3. Analytics & Observability Enhancements
- Extend Metrics tab cards with IMS/AOL indicators (e.g., `ims_decisions_total`, `aol_actions_total`).
- Provide toggle between raw Prometheus parsing and REST summary when available.
- For missing data, render translucent placeholders labelled "Data unavailable".

---

## 4. Implementation Checklist
- [ ] Extend `IntentResponse` type to include `modelDecision`, `policyDecision`, and `dispatchResult` sections, with fallbacks for legacy payloads.
- [ ] Add `/v1/aol/proposals`, `/execute`, `/rollback` client helpers (promises returning typed responses).
- [ ] Build reusable `Timeline` component to render IMS/AOL events.
- [ ] Implement `ModelDecisionCard`, `PolicyCard`, `ActionOutcomeCard` components in `components/routing/` to keep Router page tidy.
- [ ] Create `AutonomyConsole` feature folder with summary cards, proposal table, execution panel, and event feed components.
- [ ] Wire mock data modules for offline demos (`lib/mocks/ims.ts`, `lib/mocks/aol.ts`).
- [ ] Update translations (Japanese + English strings) keeping tone consistent with current UI.

---

## 5. Open Questions
1. Will the Router console consume live event streams (WebSocket/SSE) in v3.1 scope, or remain polling-based until ISR is production-ready?
2. Do we expose manual override toggles for testing (e.g., forcing `autonomyMode`), or keep UI strictly observational?
3. Should verified AOL actions emit toast notifications or remain within timeline feed?
