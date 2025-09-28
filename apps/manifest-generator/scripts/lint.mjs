import { promises as fs } from 'fs'
import path from 'path'
import fg from 'fast-glob'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const patterns = ['src/**/*.ts']

const files = await fg(patterns, {
  cwd: projectRoot,
  dot: false
})

if (!files.length) {
  console.log('No TypeScript files found to lint.')
  process.exit(0)
}

const consoleAllowed = new Set(['src/index.ts'])

const issues = []

for (const relativePath of files) {
  const absPath = path.join(projectRoot, relativePath)
  const content = await fs.readFile(absPath, 'utf8')
  const lines = content.split(/\r?\n/)

  lines.forEach((line, index) => {
    const lineNumber = index + 1

    const consoleForbidden = !consoleAllowed.has(relativePath)
    if (consoleForbidden && /console\.(log|debug)\s*\(/.test(line) && !line.includes('/* lint-allow:console */')) {
      issues.push({
        file: relativePath,
        line: lineNumber,
        message: 'Unexpected console logging. Remove or annotate with /* lint-allow:console */.'
      })
    }

    if (/\s+$/.test(line) && line.trim().length) {
      issues.push({
        file: relativePath,
        line: lineNumber,
        message: 'Trailing whitespace detected.'
      })
    }
  })

  if (/TODO|FIXME/.test(content)) {
    issues.push({
      file: relativePath,
      line: 0,
      message: 'TODO/FIXME comment found. Resolve or remove before commit.'
    })
  }
}

if (issues.length) {
  console.error('Lint found issues:')
  for (const issue of issues) {
    const location = issue.line ? `${issue.file}:${issue.line}` : issue.file
    console.error(`  - ${location}: ${issue.message}`)
  }
  process.exit(1)
}

console.log(`Lint passed for ${files.length} files.`)
