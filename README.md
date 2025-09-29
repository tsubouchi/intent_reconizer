# AGI Egg - Autonomous Intelligent Router

An AI-powered intent routing system that intelligently directs requests to appropriate backend services using Google's Gemini AI for natural language processing and meta-routing capabilities.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│                 Users                        │
│  (Browser / Mobile / Local Development)      │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│              Frontend                        │
│         Next.js on Vercel                    │
│    (localhost:3000 / agi-egg.vercel.app)     │
└─────────────────┬───────────────────────────┘
                  │ HTTPS API Calls
                  ▼
┌─────────────────────────────────────────────┐
│           Backend API                        │
│        GCP Cloud Run (Always)                │
│  https://intent-router-1028435695123         │
│       .asia-northeast1.run.app               │
└─────────────────┬───────────────────────────┘
                  │
        ┌─────────┴──────────┐
        ▼                    ▼
┌───────────────┐    ┌──────────────────┐
│  Gemini API   │    │   Redis Cloud    │
│  (AI/ML)      │    │   (Cache Layer)  │
└───────────────┘    └──────────────────┘
```

### GCP Architecture Details

```
┌────────────────────────────────────────────────────────┐
│                  Google Cloud Platform                  │
├────────────────────────────────────────────────────────┤
│                                                        │
│  ┌──────────────────────────────────────────────┐    │
│  │            Cloud Run Service                   │    │
│  │                                                │    │
│  │  Service: intent-router                       │    │
│  │  Region: asia-northeast1                      │    │
│  │  Memory: 2Gi / CPU: 2                         │    │
│  │  Min Instances: 0 / Max: 10                   │    │
│  │  Autoscaling: Request-based                   │    │
│  │                                                │    │
│  │  Environment:                                  │    │
│  │  - GEMINI_API_KEY (Gemini 2.5 Flash/Pro)     │    │
│  │  - Redis Cloud Credentials                    │    │
│  │  - NODE_ENV=production                        │    │
│  └──────────────────────────────────────────────┘    │
│                         │                              │
│                         ▼                              │
│  ┌──────────────────────────────────────────────┐    │
│  │        Container Registry (GCR)               │    │
│  │                                                │    │
│  │  gcr.io/agi-egg-production/intent-router      │    │
│  │  Platform: linux/amd64                        │    │
│  │  Multi-stage Docker build                     │    │
│  └──────────────────────────────────────────────┘    │
│                                                        │
└────────────────────────────────────────────────────────┘

External Services:
┌──────────────────────────────────────────────┐
│           Google Gemini API                  │
│  Models:                                      │
│  - models/gemini-2.5-flash (default)         │
│  - models/gemini-2.5-pro (complex)           │
│  - models/gemini-flash-lite-latest (fast)    │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│           Redis Cloud (Redis Labs)           │
│  Host: redis-13585.c274.us-east-1-3.         │
│        ec2.redns.redis-cloud.com             │
│  Port: 13585                                 │
│  TLS: Enabled                                │
│  Purpose: Intent caching, session storage    │
└──────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- pnpm 8+
- Access to GCP Cloud Run backend (already deployed)

### Installation
```bash
# Clone the repository
git clone https://github.com/your-org/hackathon0928.git
cd hackathon0928

# Install dependencies
pnpm install
```

### Development Commands

```bash
# フロントエンド開発サーバー（Cloud Run API に接続）
pnpm dev
pnpm dev:frontend
pnpm dev:frontend:only
pnpm start

# アーキテクチャ / 環境情報
pnpm run info

# ルートワークスペースのビルドと品質チェック
pnpm build
pnpm type-check
pnpm lint

# デプロイ手順の確認
pnpm run deploy:frontend
pnpm run deploy:backend
```

### Testing & QA Commands

```bash
# ルートスクリプト
pnpm test            # 意図認識 E2E スイート（apps/frontend/tests/e2e）
pnpm test:intent     # 意図認識シナリオにフォーカスした E2E
pnpm test:curl       # Cloud Run API を curl で検証（tests/curl-intent-test.sh）
pnpm test:quick      # ヘルスチェック + 簡易意図テスト（tests/quick-test.sh）

# フロントエンド（Next.js）
pnpm --dir apps/frontend dev              # Next.js 開発のみ
pnpm --dir apps/frontend build            # Next.js 本番ビルド
pnpm --dir apps/frontend lint             # Next.js プリセットでの ESLint
pnpm --dir apps/frontend type-check       # TypeScript 型チェック
pnpm --dir apps/frontend test             # ローカルテスト
pnpm --dir apps/frontend test:ci          # CI 向けヘッドレステスト

# インテントルーター（Cloud Run サービス）
pnpm --dir apps/intent-router build
pnpm --dir apps/intent-router type-check
pnpm --dir apps/intent-router lint
pnpm --dir apps/intent-router format      # Prettier 整形
pnpm --dir apps/intent-router test        # Jest テスト
pnpm --dir apps/intent-router test:unit   # 単体テスト

# マニフェストジェネレーター
pnpm --dir apps/manifest-generator build
pnpm --dir apps/manifest-generator type-check
pnpm --dir apps/manifest-generator lint
pnpm --dir apps/manifest-generator test:unit
```


## 🎯 Key Features

- **AI-Powered Intent Recognition**: Google Gemini AI による高度な意図理解と分類
- **Intelligent Routing**: 適切なバックエンドサービスへの自動ルーティング
- **Real-time Processing**: WebSocket/SSE によるストリーミングレスポンス対応
- **Scalable Architecture**: Cloud Run の自動スケーリングと Redis キャッシング
- **Glassmorphism UI**: モダンで応答性の高いユーザーインターフェース

## ⚠️ Important: Cloud-First Development

**このプロジェクトはクラウドファーストアーキテクチャを採用しています:**
- ❌ **使用しない**: ローカルバックエンド (localhost:8080)
- ✅ **使用する**: GCP Cloud Run バックエンド（全環境共通）
- ✅ **使用する**: Redis Cloud（ローカル Redis は使用しない）

これにより、開発環境が本番環境と完全に一致します。

## 📁 Project Structure

```
hackathon0928/
├── apps/
│   ├── frontend/            # Next.js フロントエンドアプリケーション
│   │   ├── app/            # App Router ページ
│   │   ├── components/     # React コンポーネント
│   │   ├── hooks/          # カスタム React フック
│   │   └── lib/            # ユーティリティライブラリ
│   ├── intent-router/      # Express.js バックエンドサービス
│   │   └── src/
│   │       ├── routes/     # API ルート
│   │       ├── services/   # ビジネスロジック
│   │       └── types/      # TypeScript 定義
│   └── manifest-generator/ # マニフェスト生成サービス
├── deploy/
│   └── cloud-run/          # デプロイメント設定
├── docs/                   # ドキュメント
└── tools/                  # 開発ツール
```

## 🔧 Configuration

### Environment Variables

環境変数の設定にはサンプルファイルをコピーして使用します：

```bash
# Frontend configuration
cp apps/frontend/.env.local.sample apps/frontend/.env.local

# Backend configuration (for local development reference)
cp apps/intent-router/.env.example apps/intent-router/.env
```

### Frontend Environment (.env.local)
```env
NEXT_PUBLIC_API_URL=https://intent-router-1028435695123.asia-northeast1.run.app
NEXT_PUBLIC_MANIFEST_API_URL=https://intent-router-1028435695123.asia-northeast1.run.app
```

## 🚢 Deployment

### Frontend (Vercel)

フロントエンドは main ブランチへのプッシュで自動的に Vercel にデプロイされます：

```bash
git add .
git commit -m "Your changes"
git push origin main
```

### Backend (GCP Cloud Run)

バックエンドのデプロイについては、デプロイメントガイドを参照してください：

```bash
# デプロイ手順を表示
pnpm run deploy:backend

# 詳細ガイドを確認
cat deploy/cloud-run/DEPLOYMENT_GUIDE.md
```

## 🔍 Monitoring

- **Frontend Health**: https://agi-egg.vercel.app/api/health
- **Backend Health**: https://intent-router-1028435695123.asia-northeast1.run.app/health
- **Metrics**: https://intent-router-1028435695123.asia-northeast1.run.app/metrics

## 📊 Latest Deployment Status

### Production Environment (2025-09-29)
- ✅ **Backend Service**: Deployed to Cloud Run
  - URL: `https://intent-router-1028435695123.asia-northeast1.run.app`
  - Region: asia-northeast1
  - Status: Active & Healthy
  - Response Time: ~300ms (intent analysis)

- ✅ **Gemini API Integration**: Fully operational
  - Model: models/gemini-2.5-flash (default)
  - IMS (Intelligent Model Selector) enabled

- ✅ **Redis Cloud**: Connected & caching
  - TLS: Enabled
  - Connection: Stable

- ✅ **Docker Image**: Built & pushed
  - Registry: `gcr.io/agi-egg-production/intent-router:latest`
  - Platform: linux/amd64

### Test Results
```bash
# Health Check
curl https://intent-router-1028435695123.asia-northeast1.run.app/health
# Response: {"status":"ok","timestamp":"2025-09-29T00:59:52.761Z"}

# Intent Analysis
curl -X POST https://intent-router-1028435695123.asia-northeast1.run.app/intent/analyze \
  -H "Content-Type: application/json" \
  -d '{"text": "I need help with payment processing"}'
# Response: Successfully routed to payment-processing-service

# Intent Recognition
curl -X POST https://intent-router-1028435695123.asia-northeast1.run.app/intent/recognize \
  -H "Content-Type: application/json" \
  -d '{"text": "Generate a PDF report"}'
# Response: Successfully routed to pdf-generator-service
```

## 🛠️ Technologies

### Frontend
- **Framework**: Next.js 14 (App Router)
- **UI**: React 18, TypeScript
- **Styling**: Tailwind CSS, Glassmorphism design
- **Deployment**: Vercel Edge Network

### Backend
- **Runtime**: Node.js, Express.js
- **AI/ML**: Google Gemini API
- **Cache**: Redis Cloud
- **Deployment**: Google Cloud Run
- **Monitoring**: Prometheus metrics

### Infrastructure
- **Container Registry**: Google Artifact Registry
- **CDN**: Vercel Edge Network
- **Observability**: Cloud Logging & Monitoring

## 📝 Documentation

- [Statement of Work v3.2](./SOW_Deployment_v3_2.md) - 詳細なデプロイメントアーキテクチャ
- [Deployment Guide](./deploy/cloud-run/DEPLOYMENT_GUIDE.md) - Cloud Run デプロイメント手順
- [API Documentation](./docs/api/openapi.yaml) - OpenAPI仕様書
- [Claude Instructions](./CLAUDE.md) - AI アシスタントガイドライン

## 🤝 Contributing

1. フィーチャーブランチを作成
2. 変更を実装
3. テストとリンティングを実行
4. プルリクエストを送信

### Commit Convention
- `feat:` - 新機能
- `fix:` - バグ修正
- `docs:` - ドキュメント更新
- `chore:` - その他のメンテナンス

## 📄 License

[MIT License](./LICENSE)

## 🆘 Support

問題や質問がある場合：
- [Deployment Guide](./deploy/cloud-run/DEPLOYMENT_GUIDE.md) を確認
- [SOW v3.2](./SOW_Deployment_v3_2.md) でアーキテクチャの詳細を確認
- リポジトリに Issue を作成

---

**Version**: 0.1.0
**Status**: Production Deployed
**Last Updated**: 2025-09-29
**Team**: AGI Egg Team
