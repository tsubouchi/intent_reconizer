# Intelligent Manifest Generator CLI

This package implements the Phase 1 Intelligent Manifest Generator described in `INTELLIGENT_MANIFEST_GENERATOR_DESIGN.md`. It analyses service intent, reuses existing Cloud Run manifests as templates, tunes scaling and resource parameters, and emits a ready-to-apply Knative Service manifest. The CLI can now also push the generated YAML straight to Cloud Run.

## Prerequisites

- Node.js 18+
- Google Cloud SDK (only when using the deployment flag)
- Access to the repository's `manifests/` directory (used as the manifest knowledge base)

Install dependencies once:

```bash
cd backend/manifest-generator
npm install --ignore-scripts
```

## Build

```bash
npm run build
```

## Usage

```bash
node dist/index.js --input path/to/request.json --output ./out/service.yaml
```

Optional flags:

- `--manifest-dir` – override the default location of the manifest repository (auto-detected otherwise)
- `--stdout` – print the generated manifest to `stdout`
- `--deploy` – immediately run `gcloud run services replace` with the generated manifest
  - `--gcloud-project` / `--gcloud-region` – forwarded to `gcloud`
  - `--gcloud-bin` – use a custom `gcloud` binary path
  - `--gcloud-arg` – append extra arguments to the `gcloud` invocation (repeatable)
- `--intent-endpoint` – URL of the intent router (`/intent/analyze` appended if missing)
  - `--intent-api-key` – bearer/API key forwarded to the intent router
  - `--intent-timeout-ms` – override the remote intent classification timeout (default 5000ms)

### Deploy in one shot

```bash
node dist/index.js \
  --input examples/content-recommendation.json \
  --output ../../manifests/generated/content-recommendation.yaml \
  --deploy \
  --gcloud-project=my-project \
  --gcloud-region=asia-northeast1
```

The command writes the manifest (and companion metadata) locally, then executes `gcloud run services replace` using that YAML.

## Intent service integration

The generator still ships with a heuristic classifier, but you can plug in the existing `intent-router` service by passing `--intent-endpoint http://localhost:8080`. When enabled, the CLI sends the request text to `/intent/analyze`, blends the returned category/confidence with the heuristics, and continues the template selection flow. The `--intent-api-key` flag sets both `Authorization` and `x-api-key` headers.

## Input Shape

The CLI validates requests against the schema inspired by the design document. Minimal example:

```json
{
  "serviceName": "Realtime Notification Service",
  "description": "Push notifications API for mobile clients",
  "requirements": {
    "performance": { "expectedRPS": 800 },
    "resources": { "cpu": "2", "memory": "2Gi" }
  },
  "deployment": {
    "projectId": "project-id",
    "imageTag": "v1.0.0"
  }
}
```

See `examples/content-recommendation.json` for a more comprehensive request.

## Next Steps

- Extend the repository with additional manifests to improve template coverage.
- Plug in real ML models or hosted classifiers to supersede the heuristics completely.
- Expand deployment automation with health checks and rollout policies around the `gcloud` step.
