import { genkit } from 'genkit';
import { vertexAI } from '@genkit-ai/vertexai';

export const ai = genkit({
  plugins: [
    vertexAI({
      location: 'us-central1',
      projectId: 'just-handled-b5743' // Explicitly set ensuring SA credentials work for this project
    })
  ],
  model: 'vertexai/gemini-2.5-flash',
});
