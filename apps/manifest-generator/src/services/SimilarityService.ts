import { IntentProfile, RepositoryManifest, TemplateSelection } from '../types'
import { cosineSimilarity, tokenize } from '../utils/text'

export class SimilarityService {
  rankManifests(
    intent: IntentProfile,
    manifests: RepositoryManifest[],
    limit = 5
  ): TemplateSelection[] {
    const intentTokens = tokenize(intent.rawText)

    const scored = manifests
      .map((manifest) => {
        const manifestTokens = tokenize(manifest.textRepresentation)
        const similarity = cosineSimilarity(intentTokens, manifestTokens)
        const categoryBoost = manifest.categories.includes(intent.category) ? 0.15 : 0
        const score = similarity + categoryBoost

        return {
          manifest,
          reason: this.buildReason(similarity, categoryBoost, manifest),
          score
        }
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)

    return scored.slice(0, limit)
  }

  private buildReason(
    similarity: number,
    categoryBoost: number,
    manifest: RepositoryManifest
  ): string {
    const reasons = [`similarity=${similarity.toFixed(2)}`]
    if (categoryBoost) {
      reasons.push(`category-match:${manifest.categories.join(',')}`)
    }
    return reasons.join(', ')
  }
}
