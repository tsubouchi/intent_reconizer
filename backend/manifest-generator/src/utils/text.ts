export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenize(input: string): string[] {
  if (!input) {
    return []
  }
  const normalized = normalizeText(input)
  return normalized ? normalized.split(' ') : []
}

export function termFrequency(tokens: string[]): Map<string, number> {
  const frequencies = new Map<string, number>()
  for (const token of tokens) {
    if (!token) continue
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1)
  }
  return frequencies
}

export function cosineSimilarity(tokensA: string[], tokensB: string[]): number {
  if (!tokensA.length || !tokensB.length) {
    return 0
  }

  const tfA = termFrequency(tokensA)
  const tfB = termFrequency(tokensB)

  const allTokens = new Set<string>([...tfA.keys(), ...tfB.keys()])

  let dotProduct = 0
  let magnitudeA = 0
  let magnitudeB = 0

  for (const token of allTokens) {
    const freqA = tfA.get(token) ?? 0
    const freqB = tfB.get(token) ?? 0
    dotProduct += freqA * freqB
    magnitudeA += freqA * freqA
    magnitudeB += freqB * freqB
  }

  if (!magnitudeA || !magnitudeB) {
    return 0
  }

  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB))
}

export function uniqueTokens(tokens: string[]): string[] {
  return Array.from(new Set(tokens))
}

export function countKeywordMatches(tokens: string[], keywords: string[]): number {
  const tokenSet = new Set(tokens)
  let count = 0
  for (const keyword of keywords) {
    if (tokenSet.has(keyword)) {
      count += 1
    }
  }
  return count
}
