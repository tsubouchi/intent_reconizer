import { z } from 'zod'

const performanceSchema = z
  .object({
    expectedRPS: z.number().positive().optional(),
    responseTime: z.number().positive().optional(),
    responseTimeMs: z.number().positive().optional()
  })
  .partial()

const resourceSchema = z
  .object({
    cpu: z.string().optional(),
    memory: z.string().optional(),
    gpu: z.boolean().optional()
  })
  .partial()

const integrationSchema = z
  .object({
    databases: z.array(z.string()).optional(),
    apis: z.array(z.string()).optional(),
    messaging: z.array(z.string()).optional()
  })
  .partial()

const securitySchema = z
  .object({
    requiresVPC: z.boolean().optional(),
    allowUnauthenticated: z.boolean().optional()
  })
  .partial()

const requirementSchema = z
  .object({
    language: z.string().optional(),
    framework: z.string().optional(),
    dependencies: z.array(z.string()).optional(),
    performance: performanceSchema.optional(),
    resources: resourceSchema.optional(),
    integration: integrationSchema.optional(),
    security: securitySchema.optional()
  })
  .partial()

const deploymentSchema = z
  .object({
    projectId: z.string().optional(),
    image: z.string().optional(),
    imageTag: z.string().optional(),
    region: z.string().optional(),
    serviceAccount: z.string().optional(),
    port: z.number().int().positive().optional(),
    env: z.record(z.string()).optional(),
    secrets: z
      .array(
        z.object({
          name: z.string(),
          key: z.string(),
          envVar: z.string()
        })
      )
      .optional(),
    volumes: z
      .array(
        z.object({
          name: z.string(),
          mountPath: z.string(),
          source: z
            .object({
              configMap: z.string().optional(),
              secret: z.string().optional()
            })
            .partial()
            .optional()
        })
      )
      .optional()
  })
  .partial()

export const manifestGenerationRequestSchema = z.object({
  serviceName: z.string().min(1),
  description: z.string().min(1),
  intent: z.string().optional(),
  requirements: requirementSchema.optional(),
  deployment: deploymentSchema.optional(),
  similarTo: z.array(z.string()).optional(),
  baseTemplate: z.string().optional(),
  metadata: z.record(z.string()).optional()
})

export type ManifestGenerationRequestInput = z.infer<typeof manifestGenerationRequestSchema>
