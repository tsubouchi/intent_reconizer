import { ValidationResult } from '../types'

export class ManifestValidator {
  validate(manifest: any): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (manifest.apiVersion !== 'serving.knative.dev/v1') {
      errors.push('apiVersion must be serving.knative.dev/v1')
    }

    if (manifest.kind !== 'Service') {
      errors.push('kind must be Service')
    }

    if (!manifest?.metadata?.name) {
      errors.push('metadata.name is required')
    }

    const templateSpec = manifest?.spec?.template?.spec
    if (!templateSpec) {
      errors.push('spec.template.spec is required')
    } else {
      const container = templateSpec.containers?.[0]
      if (!container) {
        errors.push('At least one container definition is required')
      } else {
        if (!container.image) {
          errors.push('Container image is required')
        }
        if (!Array.isArray(container.env)) {
          warnings.push('Container env should be an array')
        }
      }

      if (typeof templateSpec.timeoutSeconds !== 'number') {
        warnings.push('timeoutSeconds should be a number')
      }

      if (
        templateSpec.containerConcurrency &&
        templateSpec.containerConcurrency > 1000
      ) {
        warnings.push('containerConcurrency exceeds Cloud Run maximum (1000)')
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    }
  }
}
