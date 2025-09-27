#!/usr/bin/env node
const { spawnSync } = require('node:child_process')

function tryResolve(moduleId) {
  try {
    return require.resolve(moduleId)
  } catch (error) {
    return null
  }
}

const eslintEntry = tryResolve('eslint/bin/eslint.js')

if (!eslintEntry) {
  console.warn('[lint] Skipping lint because eslint is not installed in this workspace.')
  process.exit(0)
}

const args = process.argv.slice(2)
const result = spawnSync(process.execPath, [eslintEntry, ...args], {
  stdio: 'inherit',
})

if (result.error) {
  console.error(result.error)
  process.exit(1)
}

process.exit(result.status ?? 0)
