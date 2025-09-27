import {
  GeneratedParameters,
  IntentProfile,
  ManifestGenerationRequest,
  RepositoryManifest
} from '../types'

function toKebabCase(input: string): string {
  return input
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

function determineScaling(intent: IntentProfile): GeneratedParameters['scaling'] {
  const rps = intent.expectedRPS
  if (rps <= 100) {
    return { minScale: 1, maxScale: 10, concurrency: 80, timeoutSeconds: 60 }
  }
  if (rps <= 500) {
    return { minScale: 2, maxScale: 30, concurrency: 200, timeoutSeconds: 60 }
  }
  if (rps <= 2000) {
    return { minScale: 5, maxScale: 60, concurrency: 500, timeoutSeconds: 60 }
  }
  return { minScale: 10, maxScale: 100, concurrency: 1000, timeoutSeconds: 60 }
}

function adjustTimeoutSeconds(base: number, responseTimeMs?: number): number {
  if (!responseTimeMs) {
    return base
  }
  const seconds = Math.ceil(responseTimeMs / 1000)
  const adjusted = Math.max(base, seconds + 5)
  return Math.min(adjusted, 900)
}

export class ParameterGenerator {
  generate(
    request: ManifestGenerationRequest,
    intent: IntentProfile,
    template: RepositoryManifest
  ): GeneratedParameters {
    const templateContainer =
      template.content?.spec?.template?.spec?.containers?.[0] ?? {}
    const baseScaling = determineScaling(intent)
    const timeoutSeconds = adjustTimeoutSeconds(
      baseScaling.timeoutSeconds,
      intent.responseTimeMs
    )

    const resources = this.determineResources(request, intent, templateContainer)

    const env = this.mergeEnvironmentVariables(templateContainer, request)
    const port = this.pickPort(request, templateContainer)
    const serviceAccount =
      request.deployment?.serviceAccount ??
      template.content?.spec?.template?.spec?.serviceAccountName

    const volumes = this.mergeVolumes(template, request)

    return {
      scaling: { ...baseScaling, timeoutSeconds },
      resources,
      containerName: templateContainer?.name || toKebabCase(request.serviceName),
      env,
      serviceAccount,
      image: this.resolveImage(request),
      port,
      volumes
    }
  }

  private determineResources(
    request: ManifestGenerationRequest,
    intent: IntentProfile,
    templateContainer: any
  ): GeneratedParameters['resources'] {
    const requested = request.requirements?.resources
    if (requested?.cpu || requested?.memory) {
      return {
        cpu: requested.cpu ?? intent.resourceHints?.cpu ?? '1',
        memory: requested.memory ?? intent.resourceHints?.memory ?? '512Mi'
      }
    }

    if (templateContainer?.resources?.limits) {
      return {
        cpu:
          templateContainer.resources.limits.cpu ??
          intent.resourceHints?.cpu ??
          '1',
        memory:
          templateContainer.resources.limits.memory ??
          intent.resourceHints?.memory ??
          '512Mi'
      }
    }

    return {
      cpu: intent.resourceHints?.cpu ?? '1',
      memory: intent.resourceHints?.memory ?? '512Mi'
    }
  }

  private mergeEnvironmentVariables(
    templateContainer: any,
    request: ManifestGenerationRequest
  ): GeneratedParameters['env'] {
    const envMap = new Map<string, { name: string; value?: string; valueFrom?: any }>()

    if (Array.isArray(templateContainer?.env)) {
      for (const item of templateContainer.env) {
        if (item?.name) {
          envMap.set(item.name, { ...item })
        }
      }
    }

    const deploymentEnv = request.deployment?.env
    if (deploymentEnv) {
      for (const [name, value] of Object.entries(deploymentEnv)) {
        envMap.set(name, { name, value })
      }
    }

    const secrets = request.deployment?.secrets ?? []
    for (const secret of secrets) {
      envMap.set(secret.envVar, {
        name: secret.envVar,
        valueFrom: {
          secretKeyRef: {
            name: secret.name,
            key: secret.key
          }
        }
      })
    }

    return Array.from(envMap.values())
  }

  private pickPort(request: ManifestGenerationRequest, templateContainer: any): number {
    if (request.deployment?.port) {
      return request.deployment.port
    }

    const port = templateContainer?.ports?.[0]?.containerPort
    if (typeof port === 'number') {
      return port
    }

    return 8080
  }

  private mergeVolumes(
    template: RepositoryManifest,
    request: ManifestGenerationRequest
  ): GeneratedParameters['volumes'] {
    const container = template.content?.spec?.template?.spec?.containers?.[0]
    const mounts = Array.isArray(container?.volumeMounts) ? container.volumeMounts : []
    const volumes = Array.isArray(template.content?.spec?.template?.spec?.volumes)
      ? template.content.spec.template.spec.volumes
      : []

    const volumeMap = new Map<string, GeneratedParameters['volumes'][number]>()

    for (const mount of mounts) {
      const source = volumes.find((vol: any) => vol.name === mount.name) ?? {}
      volumeMap.set(mount.name, {
        name: mount.name,
        mountPath: mount.mountPath,
        configMap: source?.configMap?.name,
        secret: source?.secret?.secretName ?? source?.secret?.name
      })
    }

    for (const volume of request.deployment?.volumes ?? []) {
      volumeMap.set(volume.name, {
        name: volume.name,
        mountPath: volume.mountPath,
        configMap: volume.source?.configMap,
        secret: volume.source?.secret
      })
    }

    return Array.from(volumeMap.values())
  }

  private resolveImage(request: ManifestGenerationRequest): string {
    if (request.deployment?.image) {
      if (request.deployment.imageTag) {
        return `${request.deployment.image}:${request.deployment.imageTag}`
      }
      return request.deployment.image
    }

    const projectId = request.deployment?.projectId ?? 'project-id'
    const tag = request.deployment?.imageTag ?? 'latest'
    const serviceSlug = toKebabCase(request.serviceName)
    return `gcr.io/${projectId}/${serviceSlug}:${tag}`
  }
}
