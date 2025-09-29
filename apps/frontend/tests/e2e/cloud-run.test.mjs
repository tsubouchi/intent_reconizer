import { test } from 'node:test'
import assert from 'node:assert/strict'

const baseUrl = process.env.FRONTEND_BASE_URL?.replace(/\/$/, '') ?? 'http://localhost:3004'
const cloudRunBaseUrl = process.env.CLOUD_RUN_BASE_URL?.replace(/\/$/, '') ?? 'https://agi-egg-isr-router-1028435695123.us-central1.run.app'

async function fetchHtml(path) {
  const url = `${baseUrl}${path}`
  const response = await fetch(url, {
    headers: { Accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
  })

  const body = await response.text()

  return { response, body }
}

async function assertPage(path, matcher, description) {
  const { response, body } = await fetchHtml(path)

  assert.ok(response.ok, `${description} should return 2xx but received ${response.status}`)
  assert.match(
    body,
    matcher,
    `${description} should contain ${matcher} but response was ${body.slice(0, 200)}...`
  )
}

test('router console is reachable', { timeout: 30_000 }, async () => {
  await assertPage('/router', /Intent Operations Console/i, 'Router console')
  await assertPage('/router', /Intent Recognizer/i, 'Router console')
})

test('services dashboard is reachable', { timeout: 30_000 }, async () => {
  await assertPage('/services', /Distributed Service Health/i, 'Services dashboard')
})

test('analytics dashboard is reachable', { timeout: 30_000 }, async () => {
  await assertPage('/analytics', /Routing Analytics Dashboard/i, 'Analytics dashboard')
})

test('manifests workbench is reachable', { timeout: 30_000 }, async () => {
  await assertPage('/manifests', /Manifest Automation Workbench/i, 'Manifest workbench')
})

test('cloud run health endpoint responds', { timeout: 30_000 }, async () => {
  const url = `${cloudRunBaseUrl}/health`
  const response = await fetch(url)
  assert.ok(response.ok, `Cloud Run health should return 2xx but received ${response.status}`)

  try {
    const json = await response.json()
    if (typeof json?.status === 'string') {
      assert.match(json.status, /ok|healthy|up/i)
    }
  } catch (error) {
    // Non-JSON body is acceptable; just ignore parse errors
    void error
  }
})
