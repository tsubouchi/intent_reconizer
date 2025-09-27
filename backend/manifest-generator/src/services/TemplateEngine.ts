import path from 'path'
import { ManifestGenerationRequest, IntentProfile, TemplateSelection } from '../types'
import { ManifestRepository } from '../repositories/ManifestRepository'
import { SimilarityService } from './SimilarityService'

export class TemplateEngine {
  constructor(
    private readonly repository: ManifestRepository,
    private readonly similarityService: SimilarityService
  ) {}

  async selectTemplate(
    request: ManifestGenerationRequest,
    intent: IntentProfile
  ): Promise<TemplateSelection> {
    if (request.baseTemplate) {
      const direct = await this.repository.findByHint(request.baseTemplate)
      if (direct) {
        return {
          manifest: direct,
          score: 1,
          reason: `baseTemplate: ${request.baseTemplate}`
        }
      }
    }

    if (request.similarTo?.length) {
      for (const hint of request.similarTo) {
        const candidate = await this.repository.findByHint(hint)
        if (candidate) {
          return {
            manifest: candidate,
            score: 0.9,
            reason: `similarTo: ${hint}`
          }
        }
      }
    }

    const all = await this.repository.getAll()
    const ranked = this.similarityService.rankManifests(intent, all, 5)
    if (ranked.length) {
      return ranked[0]
    }

    const fallback = await this.findFallbackTemplate(intent)
    if (fallback) {
      return fallback
    }

    if (!all.length) {
      throw new Error('Manifest repository is empty. Please add base manifests.')
    }

    const first = all[0]
    return {
      manifest: first,
      score: 0.2,
      reason: `fallback:first:${path.basename(first.path)}`
    }
  }

  private async findFallbackTemplate(intent: IntentProfile): Promise<TemplateSelection | null> {
    const manifests = await this.repository.getAll()
    const matchingCategory = manifests.find((manifest) =>
      manifest.categories.includes(intent.category)
    )
    if (matchingCategory) {
      return {
        manifest: matchingCategory,
        score: 0.4,
        reason: `fallback:category:${intent.category}`
      }
    }

    const general = manifests.find((manifest) => manifest.categories.includes('general'))
    if (general) {
      return {
        manifest: general,
        score: 0.3,
        reason: 'fallback:general'
      }
    }

    return null
  }
}
