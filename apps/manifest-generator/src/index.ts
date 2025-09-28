#!/usr/bin/env node
import path from 'path'
import fs from 'fs'
import { promises as fsp } from 'fs'
import { spawn, execFile } from 'child_process'
import { promisify } from 'util'
import YAML from 'yaml'
import { manifestGenerationRequestSchema } from './schema'
import { ManifestGenerationRequest } from './types'
import { IntelligentManifestGenerator } from './IntelligentManifestGenerator'

const execFileAsync = promisify(execFile)

interface CliOptions {
  inputPath?: string
  outputPath?: string
  manifestDir?: string
  stdout: boolean
  deploy: boolean
  gcloudProject?: string
  gcloudRegion?: string
  gcloudBin?: string
  gcloudArgs: string[]
  intentEndpoint?: string
  intentApiKey?: string
  intentTimeoutMs?: number
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    stdout: false,
    deploy: false,
    gcloudArgs: []
  }

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--input':
      case '-i':
        options.inputPath = argv[++i]
        break
      case '--output':
      case '-o':
        options.outputPath = argv[++i]
        break
      case '--manifest-dir':
      case '-m':
        options.manifestDir = argv[++i]
        break
      case '--stdout':
        options.stdout = true
        break
      case '--deploy':
        options.deploy = true
        break
      case '--gcloud-project':
        options.gcloudProject = argv[++i]
        break
      case '--gcloud-region':
        options.gcloudRegion = argv[++i]
        break
      case '--gcloud-bin':
        options.gcloudBin = argv[++i]
        break
      case '--gcloud-arg':
        options.gcloudArgs.push(argv[++i])
        break
      case '--intent-endpoint':
        options.intentEndpoint = argv[++i]
        break
      case '--intent-api-key':
        options.intentApiKey = argv[++i]
        break
      case '--intent-timeout-ms':
        options.intentTimeoutMs = Number(argv[++i])
        break
      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
        break
      default:
        if (arg.startsWith('-')) {
          console.warn(`Unknown option: ${arg}`)
        }
        break
    }
  }

  return options
}

function printHelp() {
  console.log(`Usage: manifest-generator --input request.json [--output out.yaml]\n\nOptions:\n  --input, -i             Path to manifest generation request JSON (required)\n  --output, -o            Destination file for generated manifest (YAML)\n  --manifest-dir, -m      Directory containing base manifests (default: auto-detect)\n  --stdout                Print manifest to stdout instead of writing to file\n  --deploy                Execute \\"gcloud run services replace\\" with the generated manifest\n  --gcloud-project        Project ID for deployment\n  --gcloud-region         Region for deployment\n  --gcloud-bin            Custom path to gcloud binary\n  --gcloud-arg            Additional argument passed to gcloud (repeatable)\n  --intent-endpoint       Intent router endpoint (e.g. http://localhost:8080)\n  --intent-api-key        API key/bearer token for the intent router\n  --intent-timeout-ms     Timeout for remote intent classification\n  --help, -h              Show this help message\n`)
}

function resolveManifestDir(provided?: string): string {
  if (provided && fs.existsSync(provided)) {
    return path.resolve(provided)
  }

  const candidates = [
    path.resolve(process.cwd(), 'manifests'),
    path.resolve(process.cwd(), '../manifests'),
    path.resolve(process.cwd(), '../../manifests'),
    path.resolve(__dirname, '../../../manifests'),
    path.resolve(__dirname, '../../../../manifests'),
    path.resolve(__dirname, '../../manifests')
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error(
    'Unable to locate manifest repository. Please specify --manifest-dir explicitly.'
  )
}

async function readRequest(inputPath: string): Promise<ManifestGenerationRequest> {
  const raw = await fsp.readFile(inputPath, 'utf8')
  const parsedJson = JSON.parse(raw)
  const parsed = manifestGenerationRequestSchema.parse(parsedJson)

  const requirements = parsed.requirements
  if (requirements?.performance) {
    const performance: any = requirements.performance
    if (performance.responseTime && !performance.responseTimeMs) {
      performance.responseTimeMs = performance.responseTime
      delete performance.responseTime
    }
  }

  return parsed as ManifestGenerationRequest
}

async function writeOutput(pathname: string, content: string) {
  await fsp.mkdir(path.dirname(pathname), { recursive: true })
  await fsp.writeFile(pathname, content, 'utf8')
}

async function ensureGcloudAvailable(binary: string) {
  try {
    await execFileAsync(binary, ['--version'])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `gcloud CLI not found (tried \\"${binary}\\"). Install the Google Cloud SDK or pass --gcloud-bin. Original error: ${message}`
    )
  }
}

async function runCommand(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} exited with code ${code}`))
      }
    })
  })
}

async function deployWithGcloud(
  manifestPath: string,
  options: CliOptions,
  serviceName: string
) {
  const binary = options.gcloudBin ?? 'gcloud'
  await ensureGcloudAvailable(binary)

  const args = ['run', 'services', 'replace', manifestPath, '--quiet']
  if (options.gcloudProject) {
    args.push(`--project=${options.gcloudProject}`)
  }
  if (options.gcloudRegion) {
    args.push(`--region=${options.gcloudRegion}`)
  }
  args.push(...options.gcloudArgs)

  console.log(`Deploying with: ${binary} ${args.join(' ')}`)
  await runCommand(binary, args)
  console.log(`✔ Deployed ${serviceName} via gcloud run services replace`)
}

async function main() {
  try {
    const options = parseArgs(process.argv)
    if (!options.inputPath) {
      printHelp()
      console.error('Error: --input is required')
      process.exitCode = 1
      return
    }

    if (options.deploy && !options.outputPath) {
      throw new Error('Deployment requires --output so the manifest can be streamed to gcloud')
    }

    const manifestDir = resolveManifestDir(options.manifestDir)
    const request = await readRequest(path.resolve(options.inputPath))

    const generator = IntelligentManifestGenerator.create({
      manifestRoot: manifestDir,
      intentEndpoint: options.intentEndpoint,
      intentAuthToken: options.intentApiKey,
      intentTimeoutMs: options.intentTimeoutMs
    })

    const result = await generator.generate(request)
    const yamlContent = YAML.stringify(result.manifest)

    if (options.stdout || !options.outputPath) {
      console.log(yamlContent)
    }

    let manifestPath: string | null = null
    if (options.outputPath) {
      manifestPath = path.resolve(options.outputPath)
      await writeOutput(manifestPath, yamlContent)
    }

    const metadataPath = options.outputPath
      ? `${options.outputPath.replace(/\.ya?ml$/, '')}.meta.json`
      : null

    const metadataPayload = {
      ...result.metadata,
      templateReason: result.templateReason
    }

    if (metadataPath) {
      await writeOutput(path.resolve(metadataPath), JSON.stringify(metadataPayload, null, 2))
    }

    console.log('---')
    console.log(`✔ Generated manifest for ${request.serviceName}`)
    console.log(`Template: ${result.metadata.baseTemplate}`)
    console.log(`Confidence: ${(result.metadata.confidence * 100).toFixed(1)}%`)
    if (metadataPayload.notes?.length) {
      console.log(`Notes: ${metadataPayload.notes.join('; ')}`)
    }
    if (manifestPath) {
      console.log(`Manifest written to ${manifestPath}`)
    }
    if (metadataPath) {
      console.log(`Metadata written to ${path.resolve(metadataPath)}`)
    }

    if (options.deploy && manifestPath) {
      console.log('Starting Cloud Run deployment...')
      await deployWithGcloud(manifestPath, options, result.manifest?.metadata?.name ?? request.serviceName)
    }
  } catch (error: any) {
    console.error('Manifest generation failed:')
    console.error(error.message ?? error)
    process.exitCode = 1
  }
}

main()
