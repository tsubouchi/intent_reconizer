import {
  GeneratedParameters,
  GeneratedManifest,
  GeneratedManifestMetadata,
  IntentProfile,
  ManifestGenerationRequest,
  TemplateSelection
} from '../types'

function cloneManifest<T>(input: T): T {
  return JSON.parse(JSON.stringify(input))
}

function toKebabCase(input: string): string {
  return input
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

function ensureObject(target: any, key: string): any {
  if (!target[key] || typeof target[key] !== 'object') {
    target[key] = {}
  }
  return target[key]
}

function calculateRequests(limitCpu: string, limitMemory: string): { cpu: string; memory: string } {
  const cpuValue = parseFloat(limitCpu)
  const cpuRequest = Number.isFinite(cpuValue) ? Math.max(0.5, cpuValue * 0.5) : 1
  const formattedCpu = cpuRequest % 1 ? cpuRequest.toFixed(2) : cpuRequest.toString()
  const memoryRequest = limitMemory || '512Mi'
  return {
    cpu: formattedCpu,
    memory: memoryRequest
  }
}

export class ManifestBuilder {
  build(
    request: ManifestGenerationRequest,
    intent: IntentProfile,
    template: TemplateSelection,
    parameters: GeneratedParameters
  ): GeneratedManifest {
    const manifest = cloneManifest(template.manifest.content)

    manifest.apiVersion = 'serving.knative.dev/v1'
    manifest.kind = 'Service'

    manifest.metadata = manifest.metadata || {}
    manifest.metadata.name = toKebabCase(request.serviceName)
    manifest.metadata.namespace = manifest.metadata.namespace || 'default'
    manifest.metadata.annotations = manifest.metadata.annotations || {}

    manifest.metadata.annotations['generated-by'] = 'intelligent-manifest-generator'
    manifest.metadata.annotations['generation-version'] = 'v0.1.0'
    manifest.metadata.annotations['confidence-score'] = intent.confidence.toFixed(2)
    manifest.metadata.annotations['base-template'] = template.manifest.name
    manifest.metadata.annotations['generation-date'] = new Date().toISOString()

    if (request.metadata) {
      for (const [key, value] of Object.entries(request.metadata)) {
        manifest.metadata.annotations[`generator.meta/${toKebabCase(key)}`] = value
      }
    }

    const spec = ensureObject(manifest, 'spec')
    const templateSpec = ensureObject(ensureObject(spec, 'template'), 'spec')
    const templateMetadata = ensureObject(ensureObject(spec, 'template'), 'metadata')

    templateMetadata.annotations = templateMetadata.annotations || {}
    templateMetadata.annotations['autoscaling.knative.dev/minScale'] = String(
      parameters.scaling.minScale
    )
    templateMetadata.annotations['autoscaling.knative.dev/maxScale'] = String(
      parameters.scaling.maxScale
    )

    templateSpec.containerConcurrency = parameters.scaling.concurrency
    templateSpec.timeoutSeconds = parameters.scaling.timeoutSeconds

    if (parameters.serviceAccount) {
      templateSpec.serviceAccountName = parameters.serviceAccount
    }

    if (!Array.isArray(templateSpec.containers) || !templateSpec.containers.length) {
      templateSpec.containers = [{}]
    }

    const container = templateSpec.containers[0]
    container.name = parameters.containerName
    container.image = parameters.image
    container.env = parameters.env

    container.ports = [
      {
        name: 'http1',
        containerPort: parameters.port
      }
    ]

    container.resources = container.resources || {}
    container.resources.limits = {
      cpu: parameters.resources.cpu,
      memory: parameters.resources.memory
    }
    const requests = calculateRequests(parameters.resources.cpu, parameters.resources.memory)
    container.resources.requests = {
      cpu: requests.cpu,
      memory: requests.memory
    }

    this.applyVolumes(templateSpec, container, parameters)

    const metadata: GeneratedManifestMetadata = {
      generatedAt: new Date().toISOString(),
      confidence: intent.confidence,
      baseTemplate: template.manifest.name,
      optimizations: ['resource-balancing', 'autoscaling-adjustment'],
      notes: [template.reason]
    }

    return {
      manifest,
      metadata
    }
  }

  private applyVolumes(templateSpec: any, container: any, parameters: GeneratedParameters) {
    if (!parameters.volumes.length) {
      delete container.volumeMounts
      delete templateSpec.volumes
      return
    }

    container.volumeMounts = parameters.volumes.map((volume) => ({
      name: volume.name,
      mountPath: volume.mountPath,
      readOnly: true
    }))

    templateSpec.volumes = parameters.volumes.map((volume) => {
      const result: any = { name: volume.name }
      if (volume.configMap) {
        result.configMap = { name: volume.configMap }
      }
      if (volume.secret) {
        result.secret = { secretName: volume.secret }
      }
      return result
    })
  }
}
