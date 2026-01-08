

import { z } from 'zod';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { PipelineState, PipelineStateUpdate, createProgressUpdate } from '../pipelineState.js';
import { ExtractedIntent } from '../../../types/pipeline.js';

/**
 * Zod schema for intent extraction
 * This defines the structure the LLM must return
 */
const extractIntentSchema = z.object({
  query: z.string().describe('Natural language query describing what the user wants'),
  location: z.string().describe('Geographic location (city, address, region, etc.). If not mentioned, return "Unknown"'),
  countryCode: z
    .string()
    .length(2)
    .toLowerCase()
    .optional()
    .describe('ISO 3166-1 alpha-2 country code inferred from the location (e.g., "us", "zw"). Omit if unknown'),
  placeTypes: z.array(z.string()).describe('Types of places the user is looking for (e.g., ["hotel", "restaurant", "ski_resort", "hospital", "store"])'),
  filters: z.object({
    maxPrice: z.number().optional().describe('Maximum price/budget'),
    minPrice: z.number().optional().describe('Minimum price'),
    beds: z.number().optional().describe('Number of bedrooms (for real estate)'),
    baths: z.number().optional().describe('Number of bathrooms (for real estate)'),
    cuisine: z.string().optional().describe('Cuisine type (for restaurants)'),
    features: z.array(z.string()).optional().describe('Features/amenities'),
    dates: z.string().optional().describe('Date range'),
    specialty: z.string().optional().describe('Medical specialty (for healthcare)'),
    budgetPerNight: z.number().optional().describe('Budget per night (for hotels)'),
    starRating: z.number().optional().describe('Star rating (for hotels)'),
    guests: z.number().optional().describe('Number of guests'),
    radius: z.number().optional().describe('Distance/radius from location in miles'),
    openNow: z.boolean().optional().describe('Open now?'),
    minRating: z.number().optional().describe('Minimum rating (1-5)'),
  }).describe('Extracted constraints and filters'),
  requiresMap: z.boolean().describe('Should we display results on the map?'),
  requiresDistance: z.boolean().describe('Does this query require distance/travel-time calculations?'),
  requiresComparison: z.boolean().optional().describe('Is this query about comparing places?'),
});

/**
 * Create the intent extraction tool
 */
function createIntentExtractionTool() {
  return new DynamicStructuredTool({
    name: 'extract_user_intent',
    description: 'Extract structured intent from user message about finding places',
    schema: extractIntentSchema,
    func: async (input) => {
      // This function won't actually be called - we just need the schema for tool calling
      return JSON.stringify(input);
    },
  });
}

/**
 * Get or create the model instance
 */
let modelCache: ChatGoogleGenerativeAI | null = null;

function getModel(): ChatGoogleGenerativeAI {
  if (modelCache) {
    return modelCache;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required for intent extraction');
  }

  const modelName = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash-exp';

  modelCache = new ChatGoogleGenerativeAI({
    apiKey,
    model: modelName,
    temperature: 0,
  });

  return modelCache;
}

/**
 * Prompt template for intent extraction
 */
const INTENT_EXTRACTION_PROMPT = `You are an expert at understanding user queries about finding places and locations.

Analyze the user's message and extract structured information:

1. **Query**: What is the user looking for in natural language?
2. **Location**: Where are they looking? (city, neighborhood, address, etc.)
   - If no location is mentioned, return "Unknown"
3. **Country Code**: ISO 3166-1 alpha-2 country code for the location (lowercase).
   - If you can infer it, return it (e.g., "zw" for Zimbabwe). If unknown, return "Unknown" or omit.
4. **Place Types**: What types of places? Examples:
   - hotel, restaurant, cafe, bar, store, hospital, pharmacy, gym, park
   - real_estate (for homes/apartments), ski_resort, beach, museum, theater
5. **Filters**: Any constraints mentioned?
   - Price ranges, ratings, amenities, dates, number of guests, etc.
6. **Requires Map**: Should results be shown on a map? (usually yes for location-based queries)
7. **Requires Distance**: Does the user need travel-time or distance calculations?
   - Examples: "within 10 minutes", "nearby", "walking distance"

Examples:

User: "Find Italian restaurants in Brooklyn under $50"
→ query: "Italian restaurants", location: "Brooklyn", countryCode: "us", placeTypes: ["restaurant"],
   filters: {cuisine: "Italian", maxPrice: 50}, requiresMap: true, requiresDistance: false

User: "Hotels in Manhattan with pool and gym"
→ query: "Hotels with pool and gym", location: "Manhattan", countryCode: "us", placeTypes: ["hotel"],
   filters: {features: ["pool", "gym"]}, requiresMap: true, requiresDistance: false

User: "Pharmacies near me open now"
→ query: "Pharmacies open now", location: "Unknown", countryCode: "Unknown", placeTypes: ["pharmacy"],
   filters: {openNow: true}, requiresMap: true, requiresDistance: true

User: "3 bedroom apartments in San Francisco under $4000"
→ query: "3 bedroom apartments", location: "San Francisco", countryCode: "us", placeTypes: ["real_estate"],
   filters: {beds: 3, maxPrice: 4000}, requiresMap: true, requiresDistance: false

Now extract intent from the user's message.`;

/**
 * Node function: Extract Intent
 */
export async function extractIntent(state: PipelineState): Promise<PipelineStateUpdate> {
  console.log('[Node 1: Extract Intent] Starting...');
  console.log('User message:', state.userMessage);

  try {
    // Create the intent extraction tool
    const tool = createIntentExtractionTool();

    // Get the model and bind the tool with forced tool choice
    const model = getModel();
    const modelWithTools = model.bindTools([tool], {
      tool_choice: 'extract_user_intent'  // Force the LLM to use the tool
    });

    // Create the prompt
    const messages = [
      {
        role: 'system' as const,
        content: INTENT_EXTRACTION_PROMPT,
      },
      {
        role: 'user' as const,
        content: state.userMessage,
      },
    ];

    // Invoke the model
    console.log('[Node 1: Extract Intent] Calling LLM...');
    const response = await modelWithTools.invoke(messages);

    // Extract tool calls from response
    if (!response.tool_calls || response.tool_calls.length === 0) {
      console.warn('[Node 1: Extract Intent] No tool calls in response, using fallback');

      // Fallback: create a basic intent
      const fallbackIntent: ExtractedIntent = {
        query: state.userMessage,
        location: 'Unknown',
        placeTypes: ['generic'],
        filters: {},
        requiresMap: true,
        requiresDistance: false,
      };

      return {
        ...createProgressUpdate('intent_extraction', 16),
        extractedIntent: fallbackIntent,
      };
    }

    // Parse the tool call result
    const toolCall = response.tool_calls[0];

    // Type guard: ensure toolCall exists and has args
    if (!toolCall || !toolCall.args) {
      console.warn('[Node 1: Extract Intent] Tool call missing args, using fallback');

      const fallbackIntent: ExtractedIntent = {
        query: state.userMessage,
        location: 'Unknown',
        placeTypes: ['generic'],
        filters: {},
        requiresMap: true,
        requiresDistance: false,
      };

      return {
        ...createProgressUpdate('intent_extraction', 16),
        extractedIntent: fallbackIntent,
      };
    }

    const extractedData = toolCall.args as z.infer<typeof extractIntentSchema>;

    console.log('[Node 1: Extract Intent] Extracted intent:', JSON.stringify(extractedData, null, 2));

    // Convert to ExtractedIntent type
    const intent: ExtractedIntent = {
      query: extractedData.query,
      location: extractedData.location,
      countryCode: extractedData.countryCode,
      placeTypes: extractedData.placeTypes,
      filters: extractedData.filters,
      requiresMap: extractedData.requiresMap,
      requiresDistance: extractedData.requiresDistance,
      requiresComparison: extractedData.requiresComparison,
    };

    // Return state update
    return {
      ...createProgressUpdate('intent_extraction', 16),
      extractedIntent: intent,
    };
  } catch (error) {
    console.error('[Node 1: Extract Intent] Error:', error);

    // On error, create a minimal fallback intent
    const fallbackIntent: ExtractedIntent = {
      query: state.userMessage,
      location: 'Unknown',
      placeTypes: ['generic'],
      filters: {},
      requiresMap: true,
      requiresDistance: false,
    };

    return {
      ...createProgressUpdate('intent_extraction', 16),
      extractedIntent: fallbackIntent,
      errors: [
        {
          node: 'extract_intent',
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date(),
        },
      ],
    };
  }
}
