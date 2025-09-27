import { RequirementSpecification } from '../types'

export class ManifestOptimizer {
  private appliedOptimizations: string[] = []

  optimize(manifest: any, requirements?: RequirementSpecification) {
    this.appliedOptimizations = []

    this.enforceConcurrencyLimits(manifest)
    this.applySecurityPreferences(manifest, requirements)

    return manifest
  }

  getAppliedOptimizations(): string[] {
    return this.appliedOptimizations
  }

  private enforceConcurrencyLimits(manifest: any) {
    const concurrency = manifest?.spec?.template?.spec?.containerConcurrency
    if (typeof concurrency === 'number' && concurrency > 1000) {
      manifest.spec.template.spec.containerConcurrency = 1000
      this.appliedOptimizations.push('cap-concurrency-to-1000')
    }
  }

  private applySecurityPreferences(manifest: any, requirements?: RequirementSpecification) {
    if (!requirements?.security) {
      return
    }

    const spec = manifest.spec ?? (manifest.spec = {})
    const template = spec.template ?? (spec.template = {})
    const metadata = template.metadata ?? (template.metadata = {})
    const annotations = metadata.annotations ?? (metadata.annotations = {})

    if (requirements.security.requiresVPC) {
      annotations['run.googleapis.com/ingress'] = 'internal-and-cloud-load-balancing'
      this.appliedOptimizations.push('enforce-vpc-ingress')
    }

    if (requirements.security.allowUnauthenticated === false) {
      annotations['run.googleapis.com/authentication'] = 'authenticated'
      this.appliedOptimizations.push('restrict-unauthenticated-access')
    }
  }
}
