# Vercel Environment Variables Setup

This guide explains how to configure Vercel environment variables for the AGI Egg frontend application.

## Environment Variables Required

The following environment variables need to be configured in the Vercel dashboard:

### Production Environment Variables

```bash
# API Configuration
NEXT_PUBLIC_API_URL=https://agi-egg-isr-router-1028435695123.us-central1.run.app
NEXT_PUBLIC_MANIFEST_API_URL=https://agi-egg-isr-router-1028435695123.us-central1.run.app

# GCP Configuration
NEXT_PUBLIC_GCP_PROJECT_ID=agi-egg-production
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyDX8EkeJkVhsqK76SWz-S_euDYhV4gHGKU
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=agi-egg-production.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=agi-egg-production

# Gemini API
GEMINI_API_KEY=AIzaSyDX8EkeJkVhsqK76SWz-S_euDYhV4gHGKU
NEXT_PUBLIC_GEMINI_API_KEY=AIzaSyDX8EkeJkVhsqK76SWz-S_euDYhV4gHGKU
```

## Setup Instructions

### Via Vercel Dashboard (Recommended)

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select the `agi-egg` project
3. Navigate to **Settings** → **Environment Variables**
4. Add each variable listed above with the corresponding value
5. Select the appropriate environment (Production/Preview/Development)
6. Click **Save**

### Via Vercel CLI

```bash
# Install Vercel CLI if not already installed
npm i -g vercel

# Login to Vercel
vercel login

# Set environment variables for production
vercel env add NEXT_PUBLIC_API_URL production
vercel env add NEXT_PUBLIC_MANIFEST_API_URL production
vercel env add NEXT_PUBLIC_GCP_PROJECT_ID production
vercel env add NEXT_PUBLIC_FIREBASE_API_KEY production
vercel env add NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN production
vercel env add NEXT_PUBLIC_FIREBASE_PROJECT_ID production
vercel env add GEMINI_API_KEY production
vercel env add NEXT_PUBLIC_GEMINI_API_KEY production
```

## Integration with GCP Secret Manager

While Vercel doesn't directly integrate with GCP Secret Manager, you can use GitHub Actions to sync secrets:

### GitHub Actions Workflow

Create `.github/workflows/sync-secrets.yml`:

```yaml
name: Sync Secrets to Vercel

on:
  workflow_dispatch:
  schedule:
    - cron: '0 0 * * 0' # Weekly sync

jobs:
  sync-secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Authenticate to GCP
        uses: google-github-actions/auth@v1
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v1

      - name: Fetch secrets from GCP
        run: |
          echo "NEXT_PUBLIC_API_URL=$(gcloud secrets versions access latest --secret=frontend-api-url)" >> $GITHUB_ENV
          echo "GEMINI_API_KEY=$(gcloud secrets versions access latest --secret=gemini-api-key)" >> $GITHUB_ENV

      - name: Update Vercel Environment Variables
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
          VERCEL_TEAM_ID: ${{ secrets.VERCEL_TEAM_ID }}
        run: |
          # Use Vercel API to update environment variables
          curl -X POST "https://api.vercel.com/v10/projects/$VERCEL_PROJECT_ID/env" \
            -H "Authorization: Bearer $VERCEL_TOKEN" \
            -H "Content-Type: application/json" \
            -d '{
              "key": "NEXT_PUBLIC_API_URL",
              "value": "'$NEXT_PUBLIC_API_URL'",
              "type": "production",
              "target": ["production"]
            }'
```

## Verification

After setting up environment variables:

1. Trigger a new deployment in Vercel
2. Check the build logs for any missing environment variable errors
3. Visit the deployed application and verify:
   - API connections are working
   - Firebase authentication is functional
   - Gemini API integration is operational

## Security Considerations

- **NEXT_PUBLIC_** prefixed variables are exposed to the browser
- Keep sensitive secrets (like API keys) in server-side only variables when possible
- Rotate API keys regularly
- Use Vercel's environment variable encryption for sensitive values

## Troubleshooting

### Environment Variables Not Loading

1. Ensure variables are set for the correct environment (Production/Preview/Development)
2. Trigger a new deployment after adding variables
3. Check that variable names match exactly (case-sensitive)

### API Connection Issues

1. Verify the Cloud Run service URL is correct
2. Check CORS configuration on the backend
3. Ensure the backend service is running and accessible

### Firebase Authentication Errors

1. Verify Firebase project ID matches in all configurations
2. Check that Firebase API key is valid and not restricted
3. Ensure Firebase Auth is enabled in the Firebase Console