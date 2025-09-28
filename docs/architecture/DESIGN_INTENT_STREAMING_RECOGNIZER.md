ポイントは「会話（音声/テキスト）をストリーミングで取り込み → スコープ制約付きでチャンク化/要約 → Gemini 2.5 Pro で意図推定（逐次更新）→ Policy/Gate 評価 → アクション実行（Manifest 解決 or 生成）→ 観測・ロールバック」を1本のストリームとして設計することです。
以下はそのための**設計図（API契約・フロー・最小実装スケルトン付き）**です。

⸻

設計図：Intent Recognizer Streaming API（会話→意図→アクション）

1) 目的/要件
	•	入力: 通常の会話（音声/テキスト）。ブラウザ/モバイル/IVRからのリアルタイム入力を想定。
	•	スコープ制約: 「実施範囲」を明示（テナント/プロジェクト/ドメイン/コスト上限/セキュリティ境界）。
	•	逐次処理: チャンク化→要約→意図推定→Policy判定→アクション起動をSSE/WSで逐次配信。
	•	復元性: 全イベントにtrace_idとsession_idを付与し、ロールバック/再試行を容易に。
	•	拡張性: Manifest 解決/生成（前SOWの12–30節）と直結。

⸻

2) ハイレベル・アーキテクチャ（ASCII）
[Browser/Client]
  |  Mic/Keyboard
  v
[Ingest Edge] (Vercel Edge Fn / Cloud Run)
  |  (WebSocket/SSE)   ──────►  Event Stream to Client (partial transcripts, intents, actions)
  v
[Streaming Pipeline]
  ├─ (A) Transcriber (ASR)  [optional/音声時]  → transcript chunks
  ├─ (B) Chunker            [scope-aware: window/semantic/topic/role]
  ├─ (C) Summarizer         [rolling summary + slot filling state]
  ├─ (D) Intent Recognizer  [Gemini 2.5 Pro JSON mode]
  ├─ (E) Policy Engine      [cost/risk/tenant budget]
  ├─ (F) Manifest Resolver  [exact/semantic → missing?]
  ├─ (G) Action Dispatcher  [invoke service; or draft manifest]
  └─ (H) Telemetry Sink     [metrics/logs/traces]
         |
         ├─ Firestore: sessions/intents/actions/cache
         ├─ VectorDB (optional): embeddings for semantic recall
         └─ Monitoring: error rates / latency / cost

3) スコープ/チャンク戦略（“実施範囲”の定義）

スコープ（例）
	•	tenantId, projectId, allowedDomains（例: “calendar|ats|kb”）, maxContextTokens, maxCostUSD, piiPolicy, lang.
	•	これをセッション作成時に固定。チャンク処理・検索対象・アクション許可に反映。

チャンク化
	•	階層:
	•	短期バッファ（sliding window: Nトークン, stride S）
	•	セマンティック束（対話のトピック境界で切る, sentence-BERT/embedding）
	•	ローリング要約（200–400tokens）＋slot store（entities/intents/constraints）
	•	範囲制御: スコープ外のドキュメント/コマンドは収集/実行しない。
	•	RAG/Graph（任意）: allowedDomainsに応じてKB照会（Graph-RAG/検索）を有効化。

⸻

4) API契約（主要エンドポイント）

4.1 Create Session

POST /v1/sessions
Body:
{
  "tenantId": "t1",
  "projectId": "p1",
  "scope": {
    "allowedDomains": ["ats","calendar"],
    "maxContextTokens": 4000,
    "maxCostUSD": 5,
    "piiPolicy": "mask",
    "lang": "ja"
  },
  "client": { "ua": "...", "origin": "https://app.example.com" }
}
→ 200
{
  "sessionId": "sess_...",
  "streamUrl": "wss://.../v1/stream?sess=...",
  "ingestUrl": "https://.../v1/ingest?sess=..."
}

4.2 Ingest（テキスト/音声）
	•	テキスト: POST /v1/ingest（JSONL allowed）
	•	音声: WS /v1/stream にバイナリ（Opus/PCM）でPush or POST /v1/ingest/audio

POST /v1/ingest?sess=...
{ "type":"text", "text":"次の候補者の2次面接の予定を入れて", "timestamp": 173... }

4.3 Stream（SSE/WS）
	•	サーバからクライアントへイベント多重化（JSON Lines）
	•	イベント種別: transcript.partial|final, chunk.update, summary.update,
intent.update, policy.decision, action.dispatched, error.

イベント例（intent.update）

{
  "type": "intent.update",
  "sessionId": "sess_...",
  "traceId": "tr_...",
  "intent": "schedule_meeting",
  "slots": { "candidate":"山田太郎", "stage":"二次面接", "time":"来週水曜午前" },
  "confidence": 0.83,
  "safety_flags": [],
  "candidate_manifest_traits": ["calendar","cloud_run"],
  "ts": 1730000000000
}

4.4 One-shot 判定（任意）

POST /v1/infer?sess=...
{ "text": "...", "snapshot": true }
→ { intentResult, resolution, decision }

4.5 アクション実行（サーバ内部で自動 or 外部から手動）

POST /v1/actions/dispatch
{ "sessionId": "...", "action": {...}, "dryRun": false }
→ { "status":"ok", "result": {...}, "rollbackToken":"rb_..." }

5) イベント状態機械（簡易）

[transcript/ingest] 
   → Chunker.buffer
   → (if boundary) Summarizer.roll()
   → IntentRecognizer(Gemini).infer()
   → Policy.evaluate()
       ├─ deny/review → emit policy.decision
       └─ auto → ManifestResolver.resolve()
                ├─ exact/semantic → ActionDispatcher.run()
                └─ missing → (Intent: generate_manifest ? Generator.draft : review)

6) 最小スキーマ（Zod）

// shared/schemas.ts
import { z } from "zod";

export const Scope = z.object({
  allowedDomains: z.array(z.string()),
  maxContextTokens: z.number().default(4000),
  maxCostUSD: z.number().default(5),
  piiPolicy: z.enum(["mask","deny","allow"]).default("mask"),
  lang: z.string().default("ja")
});

export const Intent = z.object({
  intent: z.string(),
  slots: z.record(z.any()).default({}),
  confidence: z.number().min(0).max(1),
  safety_flags: z.array(z.string()).default([]),
  candidate_manifest_traits: z.array(z.string()).default([]),
  require_human_review: z.boolean().default(false)
});

7) ストリーミング・サーバ（最小スケルトン/TypeScript, Fastify）

// server/index.ts
import Fastify from "fastify";
import { WebSocketServer } from "ws";
import { Scope, Intent } from "./shared/schemas";
import { recognizeIntent } from "./llm";
import { policyEval } from "./policy";
import { resolveManifest, dispatchAction } from "./router";
import { chunkPush } from "./chunker";

const app = Fastify({ logger: true });
const wss = new WebSocketServer({ noServer: true });

const sessions = new Map<string, { scope: any, clients: Set<any>, state: any }>();

app.post("/v1/sessions", async (req, res) => {
  const body = req.body as any;
  const scope = Scope.parse(body.scope);
  const id = "sess_" + crypto.randomUUID();
  sessions.set(id, { scope, clients: new Set(), state: { summary: "", slots:{} }});
  return res.send({ sessionId: id, streamUrl: `/v1/stream?sess=${id}`, ingestUrl: `/v1/ingest?sess=${id}` });
});

app.post("/v1/ingest", async (req, res) => {
  const sess = (req.query as any).sess;
  const s = sessions.get(sess); if (!s) return res.status(404).send();
  const { type, text } = req.body as any;
  if (type === "text" && text) {
    const boundary = chunkPush(sess, text, s.scope); // returns {chunks, boundary?}
    if (boundary) await runPipeline(sess);
    broadcast(sess, { type:"transcript.final", text });
  }
  res.send({ ok: true });
});

app.server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url!, "http://x");
  if (url.pathname === "/v1/stream") {
    wss.handleUpgrade(req, socket, head, ws => {
      const sess = url.searchParams.get("sess")!;
      const s = sessions.get(sess); if (!s) return ws.close();
      s.clients.add(ws);
      ws.on("close", () => s.clients.delete(ws));
    });
  }
});

async function runPipeline(sessId: string) {
  const s = sessions.get(sessId)!;
  const text = s.state.latestChunkedText; // from chunker/summary
  const intent = await recognizeIntent({ text, context: { scope: s.scope, summary: s.state.summary }});
  const ir = Intent.parse(intent);
  broadcast(sessId, { type:"intent.update", ...ir });

  const decision = policyEval(ir, s.scope);
  broadcast(sessId, { type:"policy.decision", decision });

  if (decision === "auto") {
    const { kind, doc } = await resolveManifest(ir, s.scope);
    if (kind === "missing" && ir.intent === "generate_manifest") {
      broadcast(sessId, { type:"action.dispatched", mode:"draft" });
      // call generator...
      return;
    }
    const result = await dispatchAction({ manifest: doc, intent: ir });
    broadcast(sessId, { type:"action.dispatched", result });
  }
}

function broadcast(sessId: string, payload: any) {
  const s = sessions.get(sessId)!;
  for (const c of s.clients) c.send(JSON.stringify(payload));
}

app.listen({ port: 8080, host: "0.0.0.0" });

8) チャンクャー/サマライザ（最小ロジック）

// server/chunker.ts
const buf = new Map<string, { text: string[], tokens: number }>();

export function chunkPush(sess: string, text: string, scope: any) {
  const s = buf.get(sess) ?? { text: [], tokens: 0 };
  s.text.push(text);
  s.tokens += estTokens(text);
  const boundary = s.tokens > Math.min(scope.maxContextTokens, 1200);
  if (boundary) {
    // summarize and reset
    const merged = s.text.join(" ");
    const summary = summarizeLocally(merged, 300); // or LLM small
    buf.set(sess, { text: [], tokens: 0 });
    // persist to session.state.latestChunkedText/summary（省略）
  } else {
    buf.set(sess, s);
  }
  return { boundary };
}

9) Policy/Gate（最小）

// server/policy.ts
export function policyEval(ir: any, scope: any): "deny"|"review"|"auto" {
  if (ir.require_human_review) return "review";
  if (ir.confidence < 0.7) return "review";
  if (!scope.allowedDomains.some(d => ir.candidate_manifest_traits.includes(d))) return "deny";
  // 予算・PII・権限越境の実チェックは省略
  return "auto";
}

10) クライアント実装（ブラウザ：テキスト & 音声取り込み）

// client/stream.ts
export async function startSession() {
  const r = await fetch("/api/proxy/sessions", { method:"POST", body: JSON.stringify({ scope: {/*…*/}})});
  const { sessionId, streamUrl, ingestUrl } = await r.json();

  const ws = new WebSocket(streamUrl);
  ws.onmessage = (e) => {
    const ev = JSON.parse(e.data);
    // UI反映: transcript/intent/policy/action
  };

  return {
    sessionId, ingestUrl,
    async sendText(text: string) {
      await fetch(ingestUrl, { method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ type:"text", text }) });
    },
    async sendAudio(stream: MediaStream) {
      const rec = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      rec.ondataavailable = async (e) => {
        // 省略：/v1/ingest/audio にバイナリPOST or WS送信
      };
      rec.start(250);
    }
  };
}

11) SLO/レイテンシ予算（目安）
	•	ASR: P50 150–300ms / P95 600ms（音声ありの場合）
	•	Chunk/Summary: P50 20–80ms（ローカル/軽量）
	•	LLM Intent (Gemini 2.5 Pro): P50 300–600ms / P95 1.2–1.8s（JSON mode）
	•	Policy/Resolve/Dispatch: P50 50–150ms
	•	全体: P95 2.2s 以内で intent.update → action.dispatched まで到達

フォールバック順: cache → mini model（flash）→ Pro → review.

⸻

12) 観測/監査
	•	Metrics: asr_latency_ms, chunk_boundary_rate, intent_confidence_hist,
policy_decision{deny|review|auto}, dispatch_success_rate, cost_usd.
	•	Logs: すべてに sessionId/traceId/tenantId/actorId、LLM出力は要約+ハッシュで保持（原文はPII方針に従いマスク/短期破棄）。
	•	Traces: Ingest→Chunk→LLM→Policy→Resolve→Dispatchのspan分割。

⸻

13) セキュリティ/ガバナンス
	•	スコープ強制（サーバ側）: allowedDomains外のアクションは禁止。
	•	CORS & mTLS/IAP: エッジ→CoreはmTLS推奨。
	•	RBAC: actorId/rolesにより起動可能アクションを制限。
	•	コストガード: セッション/テナント予算越えは自動 review。

⸻

14) ロールアウト手順（要点）
	1.	セッション/ストリームの影絵運転（actionはdry-run, 意図/ポリシーのみ配信）。
	2.	Canary: 10%テナントで auto 許容。
	3.	Gate違反/コスト超で自動切戻し（スイッチで review-only）。

⸻

15) 既存SOW（12–30節）との接続
	•	ManifestResolver と Generator を ActionDispatcherの下に配置。
	•	missing かつ intent==="generate_manifest" でドラフト生成→pending→レビューUIへ。
	•	ログ/評価ハーネスはそのまま流用（F1/Top-1 命中/レビュー通過率）。

⸻

まとめ
	•	できます。上記の設計で、通常の会話をそのまま取り込み、スコープ制約下でチャンク→意図→ポリシー→実行まで一気通貫に回せます。
	•	最重要は スコープをセッション開始で固定し、LLMはJSON出力に限定、意思決定はPolicyコードで決定論化すること。
	•	必要なら、この設計に合わせた Next.js + Cloud Run の実コード雛形（音声WS/ASR統合込み）や**レビューUI（差分承認）**も出せます。                	         