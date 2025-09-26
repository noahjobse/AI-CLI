import OpenAI from 'openai';

let openaiInstance: OpenAI | null = null;
let apiKey: string | null = null;

export function getOpenAIClient(apiKeyParam: string): OpenAI {
  if (!openaiInstance || apiKeyParam !== apiKey) {
    openaiInstance = new OpenAI({ apiKey: apiKeyParam });
    apiKey = apiKeyParam;
  }
  return openaiInstance;
}
