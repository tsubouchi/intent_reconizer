import { test } from 'node:test'
import assert from 'node:assert/strict'

const API_URL = 'https://agi-egg-isr-router-1028435695123.us-central1.run.app'
const FRONTEND_URL = 'http://localhost:3000'

// Helper function to test intent recognition
async function testIntentRecognition(text, expectedFields = []) {
  const response = await fetch(`${API_URL}/intent/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text })
  })

  assert.ok(response.ok, `API responded with status ${response.status}`)

  const data = await response.json()

  // Check required fields
  assert.ok(data.recognizedIntent, 'Response should have recognizedIntent')
  assert.ok(typeof data.recognizedIntent.category === 'string', 'Category should be a string')
  assert.ok(typeof data.recognizedIntent.confidence === 'number', 'Confidence should be a number')
  assert.ok(data.recognizedIntent.confidence >= 0 && data.recognizedIntent.confidence <= 1, 'Confidence should be between 0 and 1')

  assert.ok(data.routing, 'Response should have routing information')
  assert.ok(data.routing.targetService, 'Routing should have targetService')

  assert.ok(data.metadata, 'Response should have metadata')
  assert.ok(typeof data.metadata.processingTime === 'number', 'Processing time should be a number')

  // Check optional expected fields
  for (const field of expectedFields) {
    assert.ok(field.path.split('.').reduce((obj, key) => obj?.[key], data), `Missing expected field: ${field.path}`)
  }

  return data
}

// Test suite
test('Intent Recognition E2E Tests', async (t) => {

  await t.test('should recognize payment intent', async () => {
    const result = await testIntentRecognition(
      'User wants to complete payment for the premium subscription'
    )

    assert.ok(
      ['payment', 'billing', 'transaction'].includes(result.recognizedIntent.category.toLowerCase()),
      `Expected payment-related category, got: ${result.recognizedIntent.category}`
    )

    console.log(`✓ Payment intent recognized: ${result.recognizedIntent.category} (confidence: ${result.recognizedIntent.confidence})`)
  })

  await t.test('should recognize authentication intent', async () => {
    const result = await testIntentRecognition(
      'I forgot my password and need to reset it'
    )

    assert.ok(
      ['authentication', 'security', 'password', 'auth'].includes(result.recognizedIntent.category.toLowerCase()),
      `Expected auth-related category, got: ${result.recognizedIntent.category}`
    )

    console.log(`✓ Auth intent recognized: ${result.recognizedIntent.category} (confidence: ${result.recognizedIntent.confidence})`)
  })

  await t.test('should recognize analytics intent', async () => {
    const result = await testIntentRecognition(
      'Generate a weekly engagement metrics dashboard with user retention data'
    )

    assert.ok(
      ['analytics', 'reporting', 'metrics', 'data'].includes(result.recognizedIntent.category.toLowerCase()),
      `Expected analytics-related category, got: ${result.recognizedIntent.category}`
    )

    console.log(`✓ Analytics intent recognized: ${result.recognizedIntent.category} (confidence: ${result.recognizedIntent.confidence})`)
  })

  await t.test('should recognize support intent', async () => {
    const result = await testIntentRecognition(
      'I need help with my account settings and preferences'
    )

    assert.ok(
      ['support', 'help', 'assistance', 'customer_service'].includes(result.recognizedIntent.category.toLowerCase()),
      `Expected support-related category, got: ${result.recognizedIntent.category}`
    )

    console.log(`✓ Support intent recognized: ${result.recognizedIntent.category} (confidence: ${result.recognizedIntent.confidence})`)
  })

  await t.test('should handle complex multi-intent scenarios', async () => {
    const result = await testIntentRecognition(
      'I want to cancel my subscription, get a refund for the last month, and delete my account'
    )

    assert.ok(result.recognizedIntent.category, 'Complex intent should be categorized')
    assert.ok(result.recognizedIntent.confidence > 0, 'Complex intent should have confidence score')

    console.log(`✓ Complex intent recognized: ${result.recognizedIntent.category} (confidence: ${result.recognizedIntent.confidence})`)
  })

  await t.test('should include sentiment analysis', async () => {
    const result = await testIntentRecognition(
      'This service is terrible! I want my money back immediately!'
    )

    if (result.recognizedIntent.sentiment) {
      assert.ok(
        ['negative', 'neutral', 'positive'].includes(result.recognizedIntent.sentiment),
        'Sentiment should be valid'
      )
      console.log(`✓ Sentiment detected: ${result.recognizedIntent.sentiment}`)
    }
  })

  await t.test('should handle technical queries', async () => {
    const result = await testIntentRecognition(
      'How do I integrate your API with my React application using TypeScript?'
    )

    assert.ok(
      ['technical', 'documentation', 'integration', 'api', 'development'].some(
        cat => result.recognizedIntent.category.toLowerCase().includes(cat)
      ),
      `Expected technical category, got: ${result.recognizedIntent.category}`
    )

    console.log(`✓ Technical intent recognized: ${result.recognizedIntent.category}`)
  })

  await t.test('should provide consistent routing for similar intents', async () => {
    const results = await Promise.all([
      testIntentRecognition('Reset my password'),
      testIntentRecognition('I need to change my password'),
      testIntentRecognition('Forgot password help')
    ])

    const services = results.map(r => r.routing.targetService)
    const uniqueServices = [...new Set(services)]

    assert.ok(
      uniqueServices.length <= 2,
      `Similar intents should route to similar services. Got: ${uniqueServices.join(', ')}`
    )

    console.log(`✓ Consistent routing verified: ${uniqueServices.join(', ')}`)
  })

  await t.test('should handle edge cases gracefully', async () => {
    // Empty text
    const emptyResponse = await fetch(`${API_URL}/intent/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '' })
    })

    // Very long text
    const longText = 'I need help with ' + 'many different things '.repeat(100)
    const longResponse = await fetch(`${API_URL}/intent/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: longText })
    })

    // Special characters
    const specialResponse = await fetch(`${API_URL}/intent/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '!@#$%^&*() Help me! 😊🚀' })
    })

    // All should return valid responses (success or error)
    assert.ok([200, 400, 422].includes(emptyResponse.status), 'Empty text should be handled')
    assert.ok([200, 400, 413].includes(longResponse.status), 'Long text should be handled')
    assert.ok([200, 400].includes(specialResponse.status), 'Special characters should be handled')

    console.log('✓ Edge cases handled gracefully')
  })

  await t.test('should measure performance metrics', async () => {
    const startTime = Date.now()
    const promises = []

    // Send 10 concurrent requests
    for (let i = 0; i < 10; i++) {
      promises.push(
        testIntentRecognition(`Test request number ${i}: Help with payment processing`)
      )
    }

    const results = await Promise.all(promises)
    const endTime = Date.now()
    const totalTime = endTime - startTime
    const avgTime = totalTime / 10

    // Check all requests succeeded
    assert.ok(results.every(r => r.recognizedIntent), 'All concurrent requests should succeed')

    // Check response times
    const processingTimes = results.map(r => r.metadata.processingTime)
    const avgProcessingTime = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length

    console.log(`✓ Performance test completed:`)
    console.log(`  - Total time for 10 requests: ${totalTime}ms`)
    console.log(`  - Average time per request: ${avgTime.toFixed(2)}ms`)
    console.log(`  - Average processing time: ${avgProcessingTime.toFixed(2)}ms`)

    assert.ok(avgProcessingTime < 5000, `Average processing time should be under 5 seconds. Got: ${avgProcessingTime}ms`)
  })
})

// Run tests
console.log('Starting Intent Recognition E2E Tests...')
console.log(`API Endpoint: ${API_URL}/intent/analyze`)
console.log('-----------------------------------')