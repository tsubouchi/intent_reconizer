import { Firestore } from '@google-cloud/firestore'

let firestore: Firestore | null = null

function getFirestore(): Firestore {
  if (firestore) return firestore

  firestore = new Firestore({
    projectId: process.env.GCP_PROJECT_ID,
    databaseId: process.env.FIRESTORE_DATABASE || 'agi-egg-production'
  })

  return firestore
}

export async function createSession(session: any): Promise<void> {
  const db = getFirestore()
  await db.collection('sessions').doc(session.id).set(session)
}

export async function getSession(sessionId: string): Promise<any | null> {
  const db = getFirestore()
  const doc = await db.collection('sessions').doc(sessionId).get()
  return doc.exists ? doc.data() : null
}

export async function updateSession(sessionId: string, updates: any): Promise<void> {
  const db = getFirestore()
  await db.collection('sessions').doc(sessionId).update({
    ...updates,
    updatedAt: new Date()
  })
}

export async function saveIntent(intent: any): Promise<void> {
  const db = getFirestore()
  await db.collection('intents').add({
    ...intent,
    createdAt: new Date()
  })
}
