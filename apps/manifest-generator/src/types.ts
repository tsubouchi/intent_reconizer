export interface PerformanceRequirements {
  expectedRPS?: number
  responseTimeMs?: number
}

export interface ResourceRequirements {
  cpu?: string
  memory?: string
  gpu?: boolean
}

export interface IntegrationRequirements {
  databases?: string[]
  apis?: string[]
  messaging?: string[]
}

export interface RequirementSpecification {
  language?: string
  framework?: string
  dependencies?: string[]
  performance?: PerformanceRequirements
  resources?: ResourceRequirements
  integration?: IntegrationRequirements
  security?: {
    requiresVPC?: boolean
    allowUnauthenticated?: boolean
  }
}

export interface DeploymentPreferences {
  projectId?: string
  image?: string
  imageTag?: string
  region?: string
  serviceAccount?: string
  port?: number
  env?: Record<string, string>
  secrets?: Array<{
    name: string
    key: string
    envVar: string
  }>
  volumes?: Array<{
    name: string
    mountPath: string
    source?: {
      configMap?: string
      secret?: string
    }
  }>
}

export interface ManifestGenerationRequest {
  serviceName: string
  description: string
  intent?: string
  requirements?: RequirementSpecification
  deployment?: DeploymentPreferences
  similarTo?: string[]
  baseTemplate?: string
  metadata?: Record<string, string>
}

export interface IntentProfile {
  category: string
  confidence: number
  keywords: string[]
  trafficTier: 'low' | 'medium' | 'high' | 'extreme'
  expectedRPS: number
  responseTimeMs?: number
  resourceHints: ResourceRequirements
  rawText: string
}

export interface RepositoryManifest {
  name: string
  path: string
  content: any
  textRepresentation: string
  categories: string[]
  serviceAccount?: string
  containerImage?: string
}

export interface TemplateSelection {
  manifest: RepositoryManifest
  reason: string
  score: number
}

export interface ScalingParameters {
  minScale: number
  maxScale: number
  concurrency: number
  timeoutSeconds: number
}

export interface ResourceParameters {
  cpu: string
  memory: string
}

export interface GeneratedParameters {
  scaling: ScalingParameters
  resources: ResourceParameters
  containerName: string
  env: Array<{ name: string; value?: string; valueFrom?: any }>
  serviceAccount?: string
  image: string
  port: number
  volumes: Array<{
    name: string
    mountPath: string
    configMap?: string
    secret?: string
  }>
}

export interface GeneratedManifestMetadata {
  generatedAt: string
  confidence: number
  baseTemplate: string
  optimizations: string[]
  notes?: string[]
}

export interface GeneratedManifest {
  manifest: any
  metadata: GeneratedManifestMetadata
}

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}
