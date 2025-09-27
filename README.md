# AGI Egg - Neural Network Router System

A modern, AI-powered intent routing system that intelligently directs requests to appropriate backend services using advanced natural language processing and meta-routing capabilities.

## 🚀 Features

### Core Capabilities
- **Intelligent Intent Recognition**: Uses Google's Gemini AI to analyze and classify user intents with high accuracy
- **Meta-Routing Engine**: Dynamic service selection based on intent confidence scores and context
- **Real-time Health Monitoring**: Track service availability and performance metrics
- **Cloud Run Manifest Management**: AI-assisted manifest optimization and versioning
- **Beautiful Modern UI**: Glassmorphism design with real-time status updates

### Technical Stack
- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, TypeScript
- **AI Integration**: Google Gemini API for intent analysis
- **Infrastructure**: Designed for Google Cloud Run deployment
- **Monitoring**: Built-in metrics and health check endpoints

## 📁 Project Structure

```
hackathon0928/
├── nextjs-frontend/          # Frontend application
│   ├── app/                  # Next.js app directory
│   ├── components/           # React components
│   │   ├── intent/          # Intent analysis components
│   │   ├── routing/         # Routing visualization
│   │   ├── monitoring/      # Service health monitoring
│   │   └── analytics/       # Metrics display
│   └── lib/                 # API clients and utilities
│
├── backend/
│   ├── intent-router/       # Main routing service
│   │   ├── src/
│   │   │   ├── routes/     # API endpoints
│   │   │   ├── services/   # Business logic
│   │   │   └── models/     # Data models
│   │   └── manifests/      # Cloud Run configurations
│   │
│   └── manifest-generator/  # Manifest optimization service
│       └── src/
│           ├── services/   # AI-powered optimization
│           └── repositories/ # Manifest storage
│
└── docker-compose.yml       # Local development setup
```

## 🛠 Installation

### Prerequisites
- Node.js 18+ and pnpm
- Google Cloud account (for Gemini API)
- Docker and Docker Compose (for local development)

### Environment Setup

1. Clone the repository:
```bash
git clone https://github.com/tsubouchi/agi_egg.git
cd agi_egg
```

2. Install dependencies:
```bash
pnpm install
```

3. Configure environment variables:

Create `.env.local` in `nextjs-frontend/`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8080
```

Create `.env` in `backend/intent-router/`:
```env
PORT=8080
GEMINI_API_KEY=your_gemini_api_key_here
```

### Running Locally

#### Using Docker Compose (Recommended):
```bash
docker-compose up --build
```

#### Manual Setup:

1. Start the backend services:
```bash
# Terminal 1 - Intent Router
cd backend/intent-router
pnpm dev

# Terminal 2 - Manifest Generator
cd backend/manifest-generator
pnpm dev
```

2. Start the frontend:
```bash
# Terminal 3 - Frontend
cd nextjs-frontend
pnpm dev
```

Access the application at `http://localhost:3000`

## 🎯 Usage

### Intent Recognition
1. Navigate to the **Router** tab
2. Enter your intent description or use sample requests
3. View the AI-powered routing decision and confidence scores

### Service Monitoring
- Switch to the **Services** tab to view real-time health status
- Monitor individual service metrics and availability

### Analytics Dashboard
- Access the **Analytics** tab for traffic patterns and performance metrics
- View intent classification distribution and success rates

### Manifest Management
- Use the **Manifest** tab to generate optimized Cloud Run configurations
- Review and approve AI-suggested improvements

## 🔌 API Endpoints

### Intent Router Service (Port 8080)

#### POST /api/intent/recognize
Analyzes intent and returns routing decision
```json
{
  "text": "User wants to reset their password",
  "context": {
    "userId": "user-123",
    "metadata": {}
  }
}
```

#### GET /api/health
Returns service health status

#### GET /api/metrics
Provides performance metrics

### Manifest Generator Service (Port 8081)

#### POST /api/manifests/refresh
Generates optimized manifest suggestions

#### GET /api/manifests/:id
Retrieves specific manifest version

## 🚢 Deployment

### Google Cloud Run

1. Build and push container images:
```bash
# Build and push intent-router
cd backend/intent-router
gcloud builds submit --tag gcr.io/YOUR_PROJECT/intent-router

# Build and push frontend
cd nextjs-frontend
gcloud builds submit --tag gcr.io/YOUR_PROJECT/frontend
```

2. Deploy services:
```bash
# Deploy intent-router
gcloud run deploy intent-router \
  --image gcr.io/YOUR_PROJECT/intent-router \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated

# Deploy frontend
gcloud run deploy frontend \
  --image gcr.io/YOUR_PROJECT/frontend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

## 🧪 Testing

Run tests across all packages:
```bash
pnpm test
```

Type checking:
```bash
pnpm type-check
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🏆 Acknowledgments

- Built for the AGI Hackathon 2024
- Powered by Google Gemini AI
- Designed with modern web technologies

## 📧 Contact

For questions or support, please open an issue in the GitHub repository.

---

Built with ❤️ by the AGI Egg Team