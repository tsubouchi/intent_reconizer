import { readFile } from 'fs/promises'
import path from 'path'
import fg from 'fast-glob'
import YAML from 'yaml'
import { RepositoryManifest } from '../types'
import { normalizeText } from '../utils/text'

export interface ManifestRepositoryOptions {
  manifestRoot: string
}

export class ManifestRepository {
  private manifests: RepositoryManifest[] | null = null

  constructor(private readonly options: ManifestRepositoryOptions) {}

  async load(): Promise<RepositoryManifest[]> {
    if (this.manifests) {
      return this.manifests
    }

    const files = await fg('**/*.y?(a)ml', {
      cwd: this.options.manifestRoot,
      absolute: true
    })

    const loaded: RepositoryManifest[] = []

    for (const file of files) {
      try {
        const raw = await readFile(file, 'utf8')
        const parsed = YAML.parse(raw)
        if (!parsed || typeof parsed !== 'object') {
          continue
        }

        const metadataName = parsed?.metadata?.name as string | undefined
        const name = metadataName || path.basename(file)
        const categories = this.deriveCategories(parsed)
        const textRepresentation = normalizeText(
          [
            metadataName ?? '',
            parsed?.metadata?.annotations ? JSON.stringify(parsed.metadata.annotations) : '',
            parsed?.spec ? JSON.stringify(parsed.spec) : '',
            path.basename(file)
          ]
            .filter(Boolean)
            .join(' ')
        )

        loaded.push({
          name,
          path: file,
          content: parsed,
          categories,
          serviceAccount: parsed?.spec?.template?.spec?.serviceAccountName,
          containerImage: parsed?.spec?.template?.spec?.containers?.[0]?.image,
          textRepresentation
        })
      } catch (error) {
        // Skip invalid manifests but keep note for diagnostics if needed
        console.warn(`Failed to load manifest ${file}:`, error)
      }
    }

    this.manifests = loaded
    return loaded
  }

  async getAll(): Promise<RepositoryManifest[]> {
    return this.load()
  }

  async findByName(name: string): Promise<RepositoryManifest | undefined> {
    const manifests = await this.load()
    const normalized = name.trim().toLowerCase()
    return manifests.find((manifest) => manifest.name.toLowerCase() === normalized)
  }

  async findByFileName(fileName: string): Promise<RepositoryManifest | undefined> {
    const manifests = await this.load()
    const normalized = fileName.trim().toLowerCase()
    return manifests.find((manifest) => path.basename(manifest.path).toLowerCase() === normalized)
  }

  async findByHint(hint: string): Promise<RepositoryManifest | undefined> {
    const manifests = await this.load()
    const normalized = hint.trim().toLowerCase()
    return manifests.find((manifest) =>
      manifest.name.toLowerCase().includes(normalized) ||
      path.basename(manifest.path).toLowerCase().includes(normalized)
    )
  }

  private deriveCategories(manifest: any): string[] {
    const categories = new Set<string>()
    const text = JSON.stringify(manifest).toLowerCase()

    if (text.includes('auth') || text.includes('jwt') || text.includes('oauth')) {
      categories.add('auth')
    }
    if (text.includes('payment') || text.includes('billing') || text.includes('stripe')) {
      categories.add('payment')
    }
    if (text.includes('email') || text.includes('smtp') || text.includes('sendgrid')) {
      categories.add('email')
    }
    if (text.includes('ml') || text.includes('model') || text.includes('inference')) {
      categories.add('ml')
    }
    if (text.includes('cache') || text.includes('redis') || text.includes('memcache')) {
      categories.add('cache')
    }
    if (text.includes('analytics') || text.includes('metrics') || text.includes('bigquery')) {
      categories.add('analytics')
    }
    if (text.includes('image') || text.includes('media') || text.includes('video')) {
      categories.add('media')
    }
    if (text.includes('api') || text.includes('gateway')) {
      categories.add('api')
    }

    if (!categories.size) {
      categories.add('general')
    }

    return Array.from(categories)
  }
}
