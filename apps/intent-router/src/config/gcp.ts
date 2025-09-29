/**
 * GCP Configuration for ISR and IMS
 * Based on SOW v3.1 specifications
 */

export const gcpConfig = {
  project: {
    id: process.env.GCP_PROJECT_ID || 'agi-egg-production',
    region: process.env.GCP_REGION || 'us-central1',
  },

  firestore: {
    database: process.env.FIRESTORE_DATABASE || '(default)',
    collections: {
      sessions: 'isr_sessions',
      intents: 'isr_intents',
      policies: 'isr_policies',
      manifests: 'isr_manifests',
      telemetry: 'isr_telemetry',
      playbooks: 'aol_playbooks',
      actions: 'aol_actions',
    },
  },

  secretManager: {
    geminiApiKey: process.env.GEMINI_API_KEY_SECRET || 'gemini-api-key',
    firebaseConfig: process.env.FIREBASE_CONFIG_SECRET || 'firebase-config',
  },

  pubsub: {
    topics: {
      intentStream: 'isr-intent-stream',
      telemetryStream: 'isr-telemetry-stream',
      aolActions: 'aol-actions',
    },
    subscriptions: {
      intentProcessor: 'isr-intent-processor-sub',
      telemetryProcessor: 'isr-telemetry-processor-sub',
      aolProcessor: 'aol-processor-sub',
    },
  },

  cloudRun: {
    services: {
      isrCore: 'isr-core',
      imsSelector: 'ims-selector',
      aolOrchestrator: 'aol-orchestrator',
    },
    maxInstances: parseInt(process.env.MAX_INSTANCES || '100'),
    minInstances: parseInt(process.env.MIN_INSTANCES || '1'),
  },

  monitoring: {
    metrics: {
      namespace: 'agi-egg/isr',
      labels: {
        environment: process.env.NODE_ENV || 'development',
        service: 'intent-router',
        version: process.env.SERVICE_VERSION || '3.1.0',
      },
    },
  },
}