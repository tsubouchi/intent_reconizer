import fs from 'fs/promises'
import path from 'path'
import yaml from 'js-yaml'
import { routerConfig } from '../config'

export interface ManifestRecord {
  name: string
  filePath: string
  manifest: any
  lastModified: string
  source: 'filesystem' | 'generated'
}

export interface ManifestRevisionMetadata {
  jobId: string
  generatedAt: string
  generatedBy: string
  confidence: number
  profile: string
  notes?: string
}

export class ManifestRepository {
  private cache: Map<string, ManifestRecord> = new Map()

  async listManifests(): Promise<ManifestRecord[]> {
    await this.loadFromDisk()
    return Array.from(this.cache.values())
  }

  async getManifest(serviceName: string): Promise<ManifestRecord | undefined> {
    await this.loadFromDisk()
    return this.cache.get(serviceName)
  }

  async saveRevision(
    serviceName: string,
    manifest: unknown,
    metadata: ManifestRevisionMetadata
  ): Promise<string> {
    const manifestYml = yaml.dump(manifest, { lineWidth: 120 })
    const filename = `${serviceName}-${metadata.jobId}.yml`
    const directory = routerConfig.manifestHistoryDirectory

    await fs.mkdir(directory, { recursive: true })
    const filePath = path.join(directory, filename)
    await fs.writeFile(filePath, manifestYml, 'utf-8')

    this.cache.set(serviceName, {
      name: serviceName,
      filePath,
      manifest,
      lastModified: metadata.generatedAt,
      source: 'generated'
    })

    return filePath
  }

  private async loadFromDisk(): Promise<void> {
    if (this.cache.size) return

    const directory = routerConfig.manifestDirectory
    const entries = await fs.readdir(directory)

    const loadPromises = entries
      .filter((entry) => entry.endsWith('.yml') || entry.endsWith('.yaml'))
      .map(async (entry) => {
        const filePath = path.join(directory, entry)
        const stats = await fs.stat(filePath)
        const file = await fs.readFile(filePath, 'utf-8')
        const manifest = yaml.load(file)

        if (manifest && typeof manifest === 'object') {
          const name = this.extractName(manifest) || path.parse(entry).name
          this.cache.set(name, {
            name,
            filePath,
            manifest,
            lastModified: stats.mtime.toISOString(),
            source: 'filesystem'
          })
        }
      })

    await Promise.all(loadPromises)
  }

  private extractName(manifest: any): string | undefined {
    return manifest?.metadata?.name
  }
}

export const manifestRepository = new ManifestRepository()
