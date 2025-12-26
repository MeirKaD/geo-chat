import dotenv from 'dotenv';
dotenv.config();

import { z } from 'zod';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { DynamicStructuredTool } from '@langchain/core/tools';

const extractIntentSchema = z.object({
  query: z.string().describe('Natural language query describing what the user wants'),
  location: z.string().describe('Geographic location. If not mentioned, return "Unknown"'),
  placeTypes: z.array(z.string()).describe('Types of places (e.g., restaurant, hotel, store)'),
  filters: z.object({
    maxPrice: z.number().optional(),
    cuisine: z.string().optional(),
    features: z.array(z.string()).optional(),
  }).describe('Filters and constraints'),
  requiresMap: z.boolean().describe('Show results on map?'),
  requiresDistance: z.boolean().describe('Needs distance calculations?'),
});

async function test() {
  const apiKey = process.env.GEMINI_API_KEY;

  const model = new ChatGoogleGenerativeAI({
    apiKey,
    model: 'gemini-2.0-flash-exp',
    temperature: 0,
  });

  const tool = new DynamicStructuredTool({
    name: 'extract_user_intent',
    description: 'Extract structured intent from user message about finding places',
    schema: extractIntentSchema,
    func: async (input) => JSON.stringify(input),
  });

  // Try forcing tool choice
  const modelWithTools = model.bindTools([tool], {
    tool_choice: 'extract_user_intent'  // Force this specific tool
  });

  const messages = [
    { role: 'user' as const, content: 'Find asian cuisines in ashkelon' },
  ];

  console.log('Testing with tool_choice forced...');
  const response = await modelWithTools.invoke(messages);
  
  console.log('Tool calls:', JSON.stringify(response.tool_calls, null, 2));
}

test().catch(console.error);
