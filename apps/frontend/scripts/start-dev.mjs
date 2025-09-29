import { spawn } from 'node:child_process'

const keysToStrip = [
  'NPM_CONFIG_STREAM',
  'npm_config_stream',
  'NPM_CONFIG_RECURSIVE',
  'npm_config_recursive',
  'NPM_CONFIG_WORKSPACE_CONCURRENCY',
  'npm_config_workspace_concurrency',
  'NPM_CONFIG_VERIFY_DEPS_BEFORE_RUN',
  'npm_config_verify_deps_before_run',
  'NPM_CONFIG__JSR_REGISTRY',
  'npm_config__jsr_registry'
]

const env = { ...process.env }
for (const key of keysToStrip) {
  if (key in env) {
    delete env[key]
  }
}

const devProcess = spawn('next', ['dev'], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit'
})

devProcess.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})

devProcess.on('error', (error) => {
  console.error('Failed to start Next.js dev server:', error)
  process.exit(1)
})
