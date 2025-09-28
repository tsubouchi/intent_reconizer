import { GoogleGenerativeAI } from '@google/generative-ai';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

let genAI: GoogleGenerativeAI | null = null;

async function getGeminiClient(): Promise<GoogleGenerativeAI> {
  if (genAI) return genAI;

  let apiKey = process.env.GEMINI_API_KEY;

  // In production, fetch from Secret Manager
  if (process.env.NODE_ENV === 'production' && !apiKey) {
    const secretClient = new SecretManagerServiceClient();
    const projectId = process.env.GCP_PROJECT_ID;
    const [version] = await secretClient.accessSecretVersion({
      name: `projects/${projectId}/secrets/gemini-api-key/versions/latest`,
    });
    apiKey = version.payload?.data?.toString();
  }

  if (!apiKey) {
    throw new Error('Gemini API key not found');
  }

  genAI = new GoogleGenerativeAI(apiKey);
  return genAI;
}

export interface Intent {
  label: string;
  confidence: number;
  entities: Record<string, any>;
  modelUsed: string;
}

export async function recognizeIntent(
  text: string,
  context?: Record<string, any>
): Promise<Intent> {
  try {
    const client = await getGeminiClient();
    const model = client.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const prompt = `
    Analyze the following text and identify the user's intent.
    Return a JSON response with the following structure:
    {
      "label": "intent_label",
      "confidence": 0.0-1.0,
      "entities": { extracted entities as key-value pairs }
    }

    Text: "${text}"
    ${context ? `Context: ${JSON.stringify(context)}` : ''}

    Response (JSON only):`;

    const result = await model.generateContent(prompt);
    const response = result.response.text();

    try {
      const parsed = JSON.parse(response);
      return {
        ...parsed,
        modelUsed: 'gemini-2.0-flash-exp'
      };
    } catch {
      // Fallback if JSON parsing fails
      return {
        label: 'unknown',
        confidence: 0.5,
        entities: { rawText: text },
        modelUsed: 'gemini-2.0-flash-exp'
      };
    }
  } catch (error) {
    console.error('Gemini API error:', error);
    throw new Error('Failed to recognize intent');
  }
}