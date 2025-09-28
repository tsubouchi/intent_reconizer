最高です。v3.0（ISR×IMS統合）は“入力→理解→選択→実行→観測”の主動線がきれいにまとまっています。ここに自律性（Autonomy）を足すなら、「動的に問題を発見→診断→解決案の生成→安全に実行→効果検証→学習」を常時ループで回す“AGIオペレーション層（AOL: AGI Operations Layer）”を1枚かませるのが最短距離です。以下、評価と具体的な増補案です。

⸻

評価（良い点 / 改善余地）

良い点
	•	ISRがストリーミングでコンテキストを保持し、IMSがモデル選択を決定論化しているため、自律ループの観測点が揃っている。
	•	ポリシー・ガバナンスが先にあるため、“勝手に壊す”リスクを抑えやすい。
	•	ロールバック設計とテレメトリが整備され、実験→収束の運用がしやすい。

改善余地（自律化の観点）
	•	現状は“ユーザ意図駆動”。**システム側からの能動的な問題提起（異常検知→対策）**が弱い。
	•	失敗知識/回避知識が分散。**“問題オントロジー×プレイブック”**が未定義。
	•	“やってよい範囲”は定義済みだが、**決定権限（Observe/Propose/Act）**の段階制御が未分化。

⸻

提案：AGI Operations Layer（AOL）を追加

1) 役割
	•	Detect: ランタイム/ビジネス/品質/KPIsの異常兆候を自動検出。
	•	Diagnose: 根本原因（RCA）を仮説生成→検証。
	•	Plan: 解決案を自動プランニング（ツール/Manifest/設定変更/再学習/ルーティング変更）。
	•	Act: ガード付きで実行（段階的：Observe→Propose→Act）。
	•	Verify/Learn: 効果検証→ポリシー/期待値/しきい値の更新学習。

2) 追加アーキテクチャ（ASCII）
            ┌──────────────── Clients ────────────────┐
            │  Browser/Mobile/IVR (ISR Stream)       │
            └──────────────────┬──────────────────────┘
                               │
                 ┌─────────────▼─────────────┐
                 │   ISR (Streaming Core)   │  ← 既存
                 │ chunk/sum → intent → PE  │
                 └───────┬─────────┬────────┘
                         │         │
                   ┌─────▼───┐ ┌──▼──────────┐
                   │   IMS    │ │ Telemetry   │  ← 既存（拡張）
                   └─────┬───┘ └────┬────────┘
                         │           │
                  ┌──────▼───────────▼─────────┐
                  │   AGI Operations Layer (AOL) │   ← 追加
                  │  Detect | Diagnose | Plan |  │
                  │  Act | Verify | Learn        │
                  └──────┬───────────┬─────────┘
                         │           │
               ┌─────────▼───┐  ┌───▼──────────────┐
               │ Playbooks    │  │ Skills/Tools Bus │
               │ (YAML)       │  │ (Router, IaC,    │
               │              │  │  FeatureFlags,   │
               │              │  │  KB/RAG, Tickets)│
               └──────────────┘  └──────────────────┘

3) 自律度（Decision Rights）レベル設計
Mode
権限
代表挙動
Observe
監視のみ
“P95遅延がSLO逸脱予兆。ルーティング変更を提案”を通知
Propose
提案まで
“flash→proへ一時昇格+chunk縮小”を提案 + 影響試算
Act (Scoped)
限定実行
テナント/セッション限定で自動適用、即時ロールバック可
Act (Global)
全体実行
旗艦ルール。承認ワークフロー必須/時間窓限定

テナントポリシーで既定。初期は Observe/Propose でローンチ→Canaryで Scoped Act → 段階昇格。

⸻

4) 問題オントロジーと検知器（Detectors）

問題クラス（例）
	•	SLO逸脱: ISR意図レイテンシ、ストリームDrop率、初回Intent遅延。
	•	IMS異常: モデルfallback頻発、コスト/分の急増、期待選択との乖離。
	•	品質/安全: ハルシ/拒否率上振れ、セーフティフラグの増加。
	•	運用基盤: エラー率、セマ索引エラー、ストレージ/秘密鍵ドリフト。
	•	ビジネス: 自動化率低下、チケット滞留、NPSの急落（外部連携）。

検知器（例）
	•	統計: EWMA/ADWINによるトレンド逸脱、z-scoreスパイク検知。
	•	ルール: ims_fallback_total{reason='latency'}/min > τ。
	•	LLM補助: “失敗説明テキスト”を要約→分類（どの問題クラスに該当？）。

⸻

5) 診断（RCA）とプランニング（Planner）

RCA
	•	直近のトレース/ログ/メトリクス/RAG（障害ナレッジ）を束ねて仮説Top-kを出す。
	•	例: 「遅延→LLM応答遅延? ネットワーク? chunk肥大? どのテナント? どのエッジ?」

Planner
	•	入力: 問題クラス・RCA仮説・制約（コスト/権限/時間窓）
	•	出力: Plan Graph（一連のSteps：FeatureFlag変更、IMSパラ更新、Manifest再デプロイ、KB再構築、A/B設定）
	•	形式: YAML Playbookにマッピング（下記）

# playbooks/latency_spike.yaml
id: pb_latency_spike_v1
detect:
  condition: "isr_intent_latency_ms_p95 > 2200 for 5m"
diagnose:
  queries:
    - "check ims_fallback_total rate"
    - "check chunk_size_avg, tokens_per_chunk"
plan:
  steps:
    - name: "Reduce chunk size"
      tool: "config.patch"
      args: { key: "chunk.size", value: 220 }
    - name: "Raise IMS to pro for 'complex_intent'"
      tool: "ims.policy.patch"
      args: { rule: "complex_intent", model: "gemini-2.5-pro", ttlMin: 30 }
    - name: "Enable semantic cache"
      tool: "flag.set"
      args: { flag: "semantic_cache", enabled: true, scope: "tenant:pilot" }
guardrails:
  rollback_on:
    - "no_improvement_in: 10m"
    - "cost_per_active_min > 0.18"
verify:
  metrics:
    - "isr_intent_latency_ms_p95"
    - "ims_fallback_total"
mode: "propose"  # or scoped_act/global_act

ポイント: Plannerは常にPlaybookに落とす。自律実行もPlaybook経由に限定することで説明性・監査性を担保。

⸻

6) Skills / Tools バス（安全な実行面）

典型スキル：
	•	ims.policy.patch / ims.thresholds.set（モデル選択規則/予算）
	•	config.patch（チャンク/タイムアウト/ドメイン制約）
	•	deploy.manifest / router.rollover（段階トラフィック切替、Rbトークン必須）
	•	kb.refresh / index.rebuild（RAG再構築）
	•	ticket.create / incident.page（人間へのハンドオフ）
	•	ab.start / ab.stop（実験器）

どれも署名付き・RBAC・乾式実行(dry-run)・ロールバックトークン必須。

⸻

7) ループ制御の最小実装（擬似コード）

// aol/loop.ts
for await (const tick of scheduler.every('30s')) {
  const alerts = await detectors.scan(); // timeseries + rules + LLM summary classify
  for (const a of alerts) {
    const rca = await diagnoser.hypothesize(a);
    const plan = await planner.produce(a, rca); // → playbook instance
    const decision = governor.decide(plan, tenantPolicy, autonomyMode); // observe/propose/act

    bus.emit('aol.proposal', {alert:a, plan, decision});

    if (decision.mode.startsWith('act')) {
      const exec = await executor.run(plan, { scoped: decision.scoped });
      verifier.schedule(exec, plan.verify);
      journal.append({ alert:a, plan, exec });
    }
  }
}

8) 安全装置（Guardrails）
	•	二重鍵: Global Act は“人＋bot”の2段承認 or 時間窓オンリー。
	•	動的ブレーキ: cost_per_active_min/error_rate/SLOが閾値超→自動全停止（Observeへ降格）。
	•	Explainability: すべての提案/実行に根拠・期待効果・代替案を付与（ストリームに流す）。
	•	領域制限: Playbookにscope必須（tenant/route/edge/region）。越境禁止。
	•	学習の節度: ポリシー/しきい値学習は提案→承認→反映（即時自動改変は限定）。

⸻

9) 評価指標（自律性のKPIを追加）

技術
	•	MTTD/MTTR 自動化: 検知→提案までP95 ≤ 2分、提案→改善観測までP95 ≤ 10分
	•	自動施策成功率: Verifyで“改善達成”となるActの比率 ≥ 70%
	•	誤Act率: ロールバック発動のAct / 全Act ≤ 1%

ビジネス
	•	SLO違反時間の削減率: 基準期比 -40%以上
	•	コスト上振れ事前回避率: 予算超過予兆→回避の比率 ≥ 80%

品質
	•	説明可能性指標: 提案のうち根拠/影響/代替案が揃う割合 100%
	•	監査合格率: Playbook準拠・署名整合 100%

⸻

10) リスクと対策（自律化特有）
	•	過剰反応（フラッピング）
→ ヒステリシス/デッドバンド/最小実験ウィンドウ、A/B検証を必須に。
	•	誤診断/過学習
→ RCAは複数仮説提示＆小規模Canary必須、学習は保守的更新。
	•	権限逸脱
→ Skillsは署名+RBAC、Global Actは時間窓＋人的承認。
	•	“静かな故障”
→ メタ監視（AOL自体のヘルス）を別系統に。

⸻

11) ロールアウト計画（追加）
	1.	Week 1–2: Detectors（統計ルール）とPlaybook最小3本（レイテンシ/コスト/品質）をObserveで導入。
	2.	Week 3–4: Proposeモードで人手承認運用。評価ダッシュボード整備。
	3.	Week 5–6: CanaryテナントでScoped Act（ロールバック訓練を先に実施）。
	4.	Week 7–8: Playbook拡充、A/B器と連動、月次ポリシー見直しサイクルに接続。

⸻

12) すぐ貼れるミニ成果物

(a) Autonomyモード設定（テナント別）

# configs/autonomy/tenant_policies.yaml
tenant: "bonginkan"
autonomy:
  default_mode: "propose"
  scoped_act_allow:
    - "latency_spike"
    - "ims_cost_overrun"
  global_act_require_approvals: 2
  budget:
    cost_per_active_min: 0.15
    monthly_usd: 1500

(b) 検知ルール（PromQL/Alert 例）
- alert: ISRLatencyP95High
  expr: histogram_quantile(0.95, sum(rate(isr_intent_latency_ms_bucket[5m])) by (le)) > 2.2
  for: 5m
  labels: { severity: page }
  annotations:
    summary: "Streaming intent latency p95 > 2.2s"

(c) Executorインターフェイス（TypeScript）

export interface Step {
  name: string;
  tool: "ims.policy.patch"|"config.patch"|"deploy.manifest"|"flag.set"|"ab.start";
  args: Record<string, any>;
}
export async function runPlan(pb: {id:string; steps: Step[]; mode: string; scope: any}) {
  for (const s of pb.steps) {
    await tools[s.tool](s.args, { scope: pb.scope, dryRun: pb.mode==="propose" });
  }
}

	•	v3.0の“ISR×IMS”は自律化の土台として十分。
	•	そこへ**AOL（Detect→Diagnose→Plan→Act→Verify→Learn）**を追加し、Playbook駆動+段階的権限で運用すれば、“動的に問題を発見し自動で解決に向ける”AGI機能を安全に常時稼働できます。
	•	まずは 3本のPlaybook（レイテンシ、IMSコスト、品質）と Proposeモードで開始し、Scoped Actへ段階昇格するのが実運用の近道です。

	# AGI Egg – Autonomy Starter Kit (Playbooks + Dashboards + Review UI)

> 初期導入用の **Playbook 10本**、**監視ダッシュボード（Grafana JSON / Cloud Monitoring YAML）**、および **レビューUI（提案→承認→実行→検証）最小React** を一式にまとめました。各ファイルはそのまま保存して利用できます。

---

## 0. 目次 / 推奨ディレクトリ

```
autonomy/
├─ playbooks/
│  ├─ pb_latency_spike.yaml
│  ├─ pb_cost_overrun.yaml
│  ├─ pb_model_error_spike.yaml
│  ├─ pb_fallback_storm.yaml
│  ├─ pb_chunk_bloat.yaml
│  ├─ pb_quality_hallucination.yaml
│  ├─ pb_policy_drift.yaml
│  ├─ pb_kb_staleness.yaml
│  ├─ pb_manifest_drift.yaml
│  └─ pb_stream_drop.yaml
├─ monitoring/
│  ├─ grafana_dashboard.json
│  └─ cloud_monitoring_alerts.yaml
└─ review-ui/
   └─ ReviewConsole.jsx
```

> すべての Playbook は共通スキーマを採用：`detect/diagnose/plan/guardrails/verify/mode/scope`。`tool` はあなたの実装に合わせて `ims.policy.patch`, `config.patch`, `flag.set`, `deploy.manifest`, `kb.refresh`, `ab.start/stop`, `ticket.create` などを呼び出す想定です。

---

## 1) 初期 Playbook 10本（YAML）

### 1.1 pb_latency_spike.yaml

```yaml
id: pb_latency_spike_v1
name: "ISR Latency Spike Mitigation"
description: "Streaming intent latency p95がSLO閾値を越えた際の一時対策。"
scope:
  target: "tenant:pilot"
  ttl: "30m"
detect:
  condition: "isr_intent_latency_ms_p95 > 2200 for 5m"
  datasource: "prometheus"
diagnose:
  queries:
    - "rate(ims_fallback_total[5m]) by (reason)"
    - "avg_over_time(chunk_tokens_avg[5m])"
    - "histogram_quantile(0.95, ims_model_latency_ms_bucket) by (modelId)"
plan:
  steps:
    - name: Reduce chunk size
      tool: config.patch
      args: { key: "chunk.size", value: 220 }
    - name: Increase stride
      tool: config.patch
      args: { key: "chunk.stride", value: 110 }
    - name: Raise IMS to pro for complex intents
      tool: ims.policy.patch
      args: { rule: "complex_intent", model: "gemini-2.5-pro", ttlMin: 30 }
    - name: Enable semantic_cache for pilot tenant
      tool: flag.set
      args: { flag: "semantic_cache", enabled: true, scope: "tenant:pilot" }
  notes: "まずは限定スコープでの緊急回避策。"
guardrails:
  rollback_on:
    - "no_improvement_in: 10m"
    - "cost_per_active_min > 0.18"
verify:
  metrics:
    - "isr_intent_latency_ms_p95"
    - "ims_fallback_total"
mode: propose
```

### 1.2 pb_cost_overrun.yaml

```yaml
id: pb_cost_overrun_v1
name: "Cost Overrun Prevention"
description: "Cost per active minute と 月次予算の逸脱を抑制。"
scope:
  target: "tenant:all"
  ttl: "2h"
detect:
  condition: "cost_per_active_min > 0.15 OR tenant_monthly_cost_usd > tenant_monthly_budget_usd"
  datasource: "billing_export + custom_metrics"
diagnose:
  queries:
    - "ims_decisions_total by (modelId,costClass)"
    - "cache_hit_ratio"
plan:
  steps:
    - name: Downgrade default to flash
      tool: ims.policy.patch
      args: { rule: "default", model: "gemini-2.5-flash" }
    - name: Tighten JSON mode prompts
      tool: config.patch
      args: { key: "prompt.fewshot.size", value: 2 }
    - name: Increase cache TTL
      tool: config.patch
      args: { key: "cache.ttl_sec", value: 900 }
  notes: "必要に応じて pro は intent限定にする。"
guardrails:
  rollback_on:
    - "intent_accuracy_drop > 3pp"
verify:
  metrics:
    - "cost_per_active_min"
    - "intent_accuracy"
mode: propose
```

### 1.3 pb_model_error_spike.yaml

```yaml
id: pb_model_error_spike_v1
name: "Model Error Spike Response"
description: "特定モデルの5xx/invalid JSON応答の急増に対応。"
scope:
  target: "global"
  ttl: "60m"
detect:
  condition: "rate(llm_call_errors_total{modelId=~'gemini-.*'}[5m]) > 0.05"
  datasource: "prometheus"
diagnose:
  queries:
    - "llm_call_errors_total by (modelId,reason)"
plan:
  steps:
    - name: Fallback chain update (pro→flash)
      tool: ims.policy.patch
      args: { rule: "fallback_chain", from: "gemini-2.5-pro", to: "gemini-2.5-flash", ttlMin: 30 }
    - name: Enable strict JSON repair
      tool: flag.set
      args: { flag: "json_repair", enabled: true }
    - name: Start A/B for repair vs retry
      tool: ab.start
      args: { experiment: "json_repair_retry", ratio: {control:0.5, variant:0.5} }
  notes: "再試行ポリシーを保守的に。"
guardrails:
  rollback_on:
    - "repair_increase_latency_p95 > 25%"
verify:
  metrics:
    - "llm_call_errors_total"
    - "isr_intent_latency_ms_p95"
mode: scoped_act
```

### 1.4 pb_fallback_storm.yaml

```yaml
id: pb_fallback_storm_v1
name: "Fallback Storm Mitigation"
description: "IMSのフォールバックが集中発生した際の緊急緩和。"
scope:
  target: "edge:all"
  ttl: "20m"
detect:
  condition: "ims_fallback_total[5m] / ims_decisions_total[5m] > 0.3"
  datasource: "prometheus"
diagnose:
  queries:
    - "ims_fallback_total by (from,to,reason)"
plan:
  steps:
    - name: Reduce concurrency
      tool: config.patch
      args: { key: "concurrency.max", value: 0.7 }
    - name: Increase client backoff
      tool: config.patch
      args: { key: "client.backoff_ms", value: 300 }
    - name: Route heavy tenants to isolated pool
      tool: ims.policy.patch
      args: { rule: "heavy_tenant_pool", pool: "isolate-a", ttlMin: 20 }
  notes: "輻輳を一時的に解消。"
guardrails:
  rollback_on:
    - "stream_abnormal_terminations_total increase"
verify:
  metrics:
    - "ims_fallback_total"
    - "stream_abnormal_terminations_total"
mode: scoped_act
```

### 1.5 pb_chunk_bloat.yaml

```yaml
id: pb_chunk_bloat_v1
name: "Chunk Bloat Control"
description: "チャンク肥大化でレイテンシ・コストが劣化した場合の制御。"
scope:
  target: "tenant:pilot"
  ttl: "45m"
detect:
  condition: "chunk_tokens_avg > 900 for 10m"
  datasource: "custom_metrics"
diagnose:
  queries:
    - "summary_tokens_avg"
plan:
  steps:
    - name: Reduce chunk size
      tool: config.patch
      args: { key: "chunk.size", value: 260 }
    - name: Increase summarizer compression
      tool: config.patch
      args: { key: "summary.target_tokens", value: 220 }
  notes: "compressionを高めて遅延を抑える。"
guardrails:
  rollback_on:
    - "intent_accuracy_drop > 2pp"
verify:
  metrics:
    - "chunk_tokens_avg"
    - "isr_intent_latency_ms_p95"
mode: propose
```

### 1.6 pb_quality_hallucination.yaml

```yaml
id: pb_quality_hallucination_v1
name: "Quality & Hallucination Reduction"
description: "ハルシ/拒否率上昇時の品 質対策。"
scope:
  target: "tenant:all"
  ttl: "2h"
detect:
  condition: "hallucination_rate > 0.03 OR refusal_rate > 0.06"
  datasource: "quality_metrics + human_feedback"
diagnose:
  queries:
    - "hallucination_rate by (intent,modelId)"
plan:
  steps:
    - name: Switch critical intents to pro + JSON strict
      tool: ims.policy.patch
      args: { rule: "critical_intent", model: "gemini-2.5-pro", jsonStrict: true, ttlMin: 120 }
    - name: Enable knowledge-grounded prompts
      tool: flag.set
      args: { flag: "grounding.kb", enabled: true }
    - name: Patch prompt guardrails
      tool: config.patch
      args: { key: "prompt.guardrails.version", value: "v2" }
  notes: "RAG強化とJSON厳格で品質を底上げ。"
guardrails:
  rollback_on:
    - "isr_intent_latency_ms_p95 > 2500"
verify:
  metrics:
    - "hallucination_rate"
    - "intent_accuracy"
mode: propose
```

### 1.7 pb_policy_drift.yaml

```yaml
id: pb_policy_drift_v1
name: "Policy Drift Correction"
description: "ポリシー逸脱（想定される選択と実選択の乖離）に対応。"
scope:
  target: "global"
  ttl: "24h"
detect:
  condition: "ims_expected_decision_mismatch_rate > 0.08 for 1h"
  datasource: "custom_metrics"
diagnose:
  queries:
    - "mismatch by (intent,tenant)"
plan:
  steps:
    - name: Sync IMS rules from baseline
      tool: ims.policy.patch
      args: { rule: "sync_from_baseline", version: "stable" }
    - name: Start A/B new matrix
      tool: ab.start
      args: { experiment: "ims_matrix_vNext", ratio: {control:0.8, variant:0.2} }
  notes: "ドリフトを矯正しつつA/Bで評価。"
guardrails:
  rollback_on:
    - "ims_accuracy_drop > 3pp"
verify:
  metrics:
    - "ims_expected_decision_total{outcome='match'}"
    - "ims_expected_decision_total"
mode: propose
```

### 1.8 pb_kb_staleness.yaml

```yaml
id: pb_kb_staleness_v1
name: "Knowledge Base Staleness Refresh"
description: "KB/RAGの鮮度劣化が推論品質に影響時のリフレッシュ。"
scope:
  target: "domain:kb"
  ttl: "6h"
detect:
  condition: "kb_staleness_index > 0.7 OR grounding_gap_rate > 0.1"
  datasource: "kb_metrics + llm_eval"
diagnose:
  queries:
    - "doc_age_histogram"
plan:
  steps:
    - name: Refresh KB indexes
      tool: kb.refresh
      args: { domains: ["ats","calendar"], incremental: true }
    - name: Rebuild vector index (night window)
      tool: kb.refresh
      args: { domains: ["ats"], rebuild: true, window: "02:00-04:00" }
  notes: "夜間再構築で影響最小化。"
guardrails:
  rollback_on:
    - "index_failure"
verify:
  metrics:
    - "grounding_success_rate"
    - "intent_accuracy"
mode: propose
```

### 1.9 pb_manifest_drift.yaml

```yaml
id: pb_manifest_drift_v1
name: "Manifest Drift & Safe Redeploy"
description: "実環境のManifestと基準との差分が一定以上。"
scope:
  target: "service:intent-router"
  ttl: "4h"
detect:
  condition: "manifest_drift_score > 0.25"
  datasource: "artifact_diff + runtime_probe"
diagnose:
  queries:
    - "drift_by_key"
plan:
  steps:
    - name: Draft redeploy manifest
      tool: deploy.manifest
      args: { from: "baseline", mode: "draft", review: true }
    - name: Canary 10%
      tool: router.rollover
      args: { traffic: {stable:0.9, canary:0.1}, ttlMin: 60 }
  notes: "差分を可視化し、段階ロールアウト。"
guardrails:
  rollback_on:
    - "error_rate_in_canary > 2%"
verify:
  metrics:
    - "request_error_rate"
    - "latency_p95"
mode: propose
```

### 1.10 pb_stream_drop.yaml

```yaml
id: pb_stream_drop_v1
name: "Stream Drop Rate Reduction"
description: "ストリーム異常終了率の上昇に対応。"
scope:
  target: "edge:all"
  ttl: "90m"
detect:
  condition: "stream_abnormal_terminations_total[5m] / stream_started_total[5m] > 0.02"
  datasource: "prometheus"
diagnose:
  queries:
    - "edge_node_drop_rate by (region)"
plan:
  steps:
    - name: Increase ping/keepalive interval
      tool: config.patch
      args: { key: "ws.keepalive_ms", value: 10000 }
    - name: Enable resumable session
      tool: flag.set
      args: { flag: "stream.resumable", enabled: true }
    - name: Ticket for NOC investigation
      tool: ticket.create
      args: { severity: "high", summary: "Stream drops > 2%", assignee: "NOC" }
  notes: "ネットワーク側のボトルネックも調査。"
guardrails:
  rollback_on:
    - "keepalive_overhead > 10% CPU"
verify:
  metrics:
    - "stream_abnormal_terminations_total"
    - "ws_keepalive_failures"
mode: scoped_act
```

---

## 2) 監視ダッシュボード

### 2.1 Grafana ダッシュボード（JSON）

> Prometheus を前提に、主要指標を1画面で俯瞰できる構成。

```json
{
  "title": "AGI Egg – ISR/IMS Autonomy Dashboard",
  "timezone": "browser",
  "panels": [
    { "type": "stat", "title": "Sessions Active", "id": 1,
      "targets": [{ "expr": "sum(stream_active_sessions)" }] },
    { "type": "graph", "title": "ISR Intent Latency p95 (ms)", "id": 2,
      "targets": [{ "expr": "histogram_quantile(0.95, sum(rate(isr_intent_latency_ms_bucket[5m])) by (le)) * 1000" }] },
    { "type": "graph", "title": "IMS Decisions by Model", "id": 3,
      "targets": [{ "expr": "sum(rate(ims_decisions_total[5m])) by (modelId)" }] },
    { "type": "graph", "title": "IMS Fallbacks (from→to)", "id": 4,
      "targets": [{ "expr": "sum(rate(ims_fallback_total[5m])) by (from,to)" }] },
    { "type": "graph", "title": "Stream Drop Rate", "id": 5,
      "targets": [{ "expr": "sum(rate(stream_abnormal_terminations_total[5m])) / sum(rate(stream_started_total[5m]))" }] },
    { "type": "graph", "title": "Cost per Active Minute (USD)", "id": 6,
      "targets": [{ "expr": "sum(stream_cost_usd) / sum(stream_active_minutes)" }] },
    { "type": "graph", "title": "Hallucination / Refusal Rates", "id": 7,
      "targets": [
        { "expr": "sum(rate(hallucination_events_total[5m])) / sum(rate(intents_total[5m]))", "legendFormat": "hallucination" },
        { "expr": "sum(rate(refusal_events_total[5m])) / sum(rate(intents_total[5m]))", "legendFormat": "refusal" }
      ]
    },
    { "type": "table", "title": "Top Tenants by Cost", "id": 8,
      "targets": [{ "expr": "topk(10, sum(stream_cost_usd) by (tenant))" }] },
    { "type": "graph", "title": "Chunk Tokens Avg", "id": 9,
      "targets": [{ "expr": "avg(chunk_tokens_avg)" }] },
    { "type": "graph", "title": "Intent Accuracy (Eval Set)", "id": 10,
      "targets": [{ "expr": "sum(rate(intent_eval_matches_total[5m])) / sum(rate(intent_eval_total[5m]))" }] }
  ],
  "schemaVersion": 38
}
```

### 2.2 Cloud Monitoring アラート（YAML）

> GCP Cloud Monitoring 用の例。必要に応じて `filter` をあなたのメトリクス名に合わせて調整してください。

```yaml
alertPolicies:
  - displayName: "ISR Latency p95 High"
    conditions:
      - displayName: "p95 > 2.2s for 5m"
        conditionMonitoringQueryLanguage:
          query: |
            fetch prometheus_target
            | { t_isr = time_series SELECT histogram_quantile(0.95, sum(rate(isr_intent_latency_ms_bucket[5m])) by (le)) }
            | align next_older(5m)
            | condition gt(val(t_isr), 2.2)
          duration: 300s
    notificationChannels: ["projects/xxx/notificationChannels/xxxx"]

  - displayName: "IMS Error/Fallback Spike"
    conditions:
      - displayName: "Fallback ratio > 0.3"
        conditionMonitoringQueryLanguage:
          query: |
            fetch prometheus_target
            | { f = time_series SELECT sum(rate(ims_fallback_total[5m])) }
            | { d = time_series SELECT sum(rate(ims_decisions_total[5m])) }
            | ratio = f / d
            | condition gt(val(ratio), 0.3)
          duration: 300s

  - displayName: "Stream Drop Rate High"
    conditions:
      - displayName: "> 2% drops"
        conditionMonitoringQueryLanguage:
          query: |
            fetch prometheus_target
            | { a = time_series SELECT sum(rate(stream_abnormal_terminations_total[5m])) }
            | { s = time_series SELECT sum(rate(stream_started_total[5m])) }
            | r = a / s
            | condition gt(val(r), 0.02)
          duration: 300s

  - displayName: "Cost per Active Minute High"
    conditions:
      - displayName: "> $0.15"
        conditionMonitoringQueryLanguage:
          query: |
            fetch prometheus_target
            | { c = time_series SELECT sum(stream_cost_usd) }
            | { m = time_series SELECT sum(stream_active_minutes) }
            | v = c / m
            | condition gt(val(v), 0.15)
          duration: 900s
```

---

## 3) レビューUI（提案→承認→実行→検証：最小React）

> 依存のない最小Componentとして提供。実APIは `fetch('/api/…')` に差し替えてください。

```jsx
// review-ui/ReviewConsole.jsx
import React, { useEffect, useState } from 'react';

export default function ReviewConsole() {
  const [proposals, setProposals] = useState([]);
  const [selected, setSelected] = useState(null);
  const [log, setLog] = useState([]);

  useEffect(() => {
    // 初期ロード（ダミー）
    setProposals([
      { id: 'pb_latency_spike_v1#2025-09-28T09:00', pbId: 'pb_latency_spike_v1', mode: 'propose',
        summary: 'Latency p95>2.2s in region asia-northeast1', scope: 'tenant:pilot', impact: '+15% latency改善見込み',
        steps: [
          { name: 'Reduce chunk size', tool: 'config.patch', args: { key: 'chunk.size', value: 220 }},
          { name: 'Raise IMS to pro', tool: 'ims.policy.patch', args: { rule: 'complex_intent', model: 'gemini-2.5-pro', ttlMin: 30 }}
        ]
      },
      { id: 'pb_cost_overrun_v1#2025-09-28T09:05', pbId: 'pb_cost_overrun_v1', mode: 'propose',
        summary: 'Cost/min>$0.15 on tenant X', scope: 'tenant:all', impact: 'コスト -20% 見込み',
        steps: [
          { name: 'Downgrade default to flash', tool: 'ims.policy.patch', args: { rule: 'default', model: 'gemini-2.5-flash' }},
          { name: 'Increase cache TTL', tool: 'config.patch', args: { key: 'cache.ttl_sec', value: 900 }}
        ]
      }
    ]);
  }, []);

  const approve = async () => {
    if (!selected) return;
    appendLog(`✅ 承認: ${selected.id}`);
    // await fetch('/api/approve', { method: 'POST', body: JSON.stringify(selected) })
  };

  const execute = async () => {
    if (!selected) return;
    appendLog(`🚀 実行開始: ${selected.id}`);
    // await fetch('/api/execute', { method: 'POST', body: JSON.stringify(selected) })
    setTimeout(() => appendLog('🧪 検証タスクをスケジュールしました (10m)'), 500);
  };

  const rollback = async () => {
    if (!selected) return;
    appendLog(`↩ ロールバック要求: ${selected.id}`);
    // await fetch('/api/rollback', { method: 'POST', body: JSON.stringify({ id: selected.id }) })
  };

  const appendLog = (m) => setLog((L) => [new Date().toLocaleTimeString(), m, ...L]);

  return (
    <div className="min-h-screen w-full p-6 grid grid-cols-12 gap-4 font-sans">
      <div className="col-span-4 border rounded-xl p-4">
        <h2 className="text-lg font-bold mb-2">提案一覧</h2>
        <ul className="space-y-2">
          {proposals.map(p => (
            <li key={p.id}
                className={`p-3 rounded-lg cursor-pointer border ${selected?.id===p.id?'bg-gray-100':'bg-white'}`}
                onClick={() => setSelected(p)}>
              <div className="text-sm text-gray-500">{p.pbId} · {p.mode}</div>
              <div className="font-medium">{p.summary}</div>
              <div className="text-xs text-gray-500">scope: {p.scope}</div>
            </li>
          ))}
        </ul>
      </div>

      <div className="col-span-5 border rounded-xl p-4">
        <h2 className="text-lg font-bold mb-2">詳細</h2>
        {selected ? (
          <div>
            <div className="text-sm mb-2">ID: {selected.id}</div>
            <div className="mb-2">影響見込み: <span className="font-medium">{selected.impact}</span></div>
            <h3 className="font-semibold mb-1">実行ステップ</h3>
            <ol className="list-decimal ml-5 space-y-1">
              {selected.steps.map((s, i) => (
                <li key={i} className="text-sm">
                  <span className="font-medium">{s.name}</span> – {s.tool}
                  <pre className="bg-gray-50 p-2 rounded mt-1 text-xs overflow-auto">{JSON.stringify(s.args, null, 2)}</pre>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="text-gray-500">左から提案を選択してください。</div>
        )}
      </div>

      <div className="col-span-3 border rounded-xl p-4 flex flex-col">
        <h2 className="text-lg font-bold mb-2">操作</h2>
        <div className="flex gap-2 mb-4">
          <button className="px-3 py-2 rounded-lg border" onClick={approve} disabled={!selected}>承認</button>
          <button className="px-3 py-2 rounded-lg border" onClick={execute} disabled={!selected}>実行</button>
          <button className="px-3 py-2 rounded-lg border" onClick={rollback} disabled={!selected}>ロールバック</button>
        </div>
        <h3 className="font-semibold mb-2">イベントログ</h3>
        <div className="flex-1 bg-gray-50 rounded p-2 text-xs overflow-auto">
          {log.map((l, i) => (<div key={i}>{l}</div>))}
        </div>
      </div>
    </div>
  );
}
```

> Tailwind クラスを使用していますが必須ではありません。Next.js で使う場合は `app/page.tsx` からこの Component を読み込めば動作確認できます。

---

## 4) 運用ノート

* **権限**: `act` 系の Playbook は RBAC と署名検証を必須化。
* **テナント別自律度**: `autonomy/default_mode` を Propose に固定し、Canary テナントのみ Scoped Act を許可。
* **検証フロー**: 各 Playbook の `verify.metrics` をダッシュボードで即見える化し、10–30分で効果判定→自動ロールバック条件を満たせば即時反転。
* **学習**: Playbook 実行結果（成功/失敗/副作用）を学習ログに残し、月次でしきい値/IMS行列を見直し。

---

以上です。必要に応じて、各 Playbook の `tool` 実装と API 叩き先（`/api/approve|execute|rollback`）のスケルトンも追加できます。

