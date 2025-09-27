import { ManifestRepository } from './repositories/ManifestRepository'
import { IntentClassifier } from './services/IntentClassifier'
import { SimilarityService } from './services/SimilarityService'
import { TemplateEngine } from './services/TemplateEngine'
import { ParameterGenerator } from './services/ParameterGenerator'
import { ManifestBuilder } from './services/ManifestBuilder'
import { ManifestOptimizer } from './services/ManifestOptimizer'
import { ManifestValidator } from './services/ManifestValidator'
import {
  GeneratedManifest,
  ManifestGenerationRequest,
  ValidationResult
} from './types'

export interface GeneratorOptions {
  manifestRoot: string
  intentEndpoint?: string
  intentAuthToken?: string
  intentTimeoutMs?: number
}

export interface GeneratorResult extends GeneratedManifest {
  validation: ValidationResult
  templateReason: string
}

export class IntelligentManifestGenerator {
  private readonly repository: ManifestRepository
  private readonly intentClassifier: IntentClassifier
  private readonly similarityService: SimilarityService
  private readonly templateEngine: TemplateEngine
  private readonly parameterGenerator: ParameterGenerator
  private readonly manifestBuilder: ManifestBuilder
  private readonly optimizer: ManifestOptimizer
  private readonly validator: ManifestValidator

  constructor(repository: ManifestRepository, options: GeneratorOptions) {
    this.repository = repository
    this.intentClassifier = new IntentClassifier({
      endpoint: options.intentEndpoint,
      apiKey: options.intentAuthToken,
      timeoutMs: options.intentTimeoutMs
    })
    this.similarityService = new SimilarityService()
    this.templateEngine = new TemplateEngine(this.repository, this.similarityService)
    this.parameterGenerator = new ParameterGenerator()
    this.manifestBuilder = new ManifestBuilder()
    this.optimizer = new ManifestOptimizer()
    this.validator = new ManifestValidator()
  }

  static create(options: GeneratorOptions): IntelligentManifestGenerator {
    const repository = new ManifestRepository({ manifestRoot: options.manifestRoot })
    return new IntelligentManifestGenerator(repository, options)
  }

  async generate(request: ManifestGenerationRequest): Promise<GeneratorResult> {
    const intent = await this.intentClassifier.classify(request)
    await this.repository.load()

    const template = await this.templateEngine.selectTemplate(request, intent)
    const parameters = this.parameterGenerator.generate(request, intent, template.manifest)
    const generated = this.manifestBuilder.build(request, intent, template, parameters)

    const optimizedManifest = this.optimizer.optimize(generated.manifest, request.requirements)
    const appliedOptimizations = this.optimizer.getAppliedOptimizations()

    generated.metadata.optimizations = Array.from(
      new Set([...generated.metadata.optimizations, ...appliedOptimizations])
    )

    const validation = this.validator.validate(optimizedManifest)
    if (!validation.isValid) {
      throw new Error(`Manifest validation failed: ${validation.errors.join('; ')}`)
    }

    if (validation.warnings.length) {
      generated.metadata.notes = [
        ...(generated.metadata.notes ?? []),
        ...validation.warnings.map((warning) => `warning: ${warning}`)
      ]
    }

    return {
      manifest: optimizedManifest,
      metadata: generated.metadata,
      validation,
      templateReason: template.reason
    }
  }
}
