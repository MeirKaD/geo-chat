

import { z } from 'zod';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { PipelineState, PipelineStateUpdate, createProgressUpdate } from '../pipelineState.js';
import { ExtractedIntent, ConversationMessage } from '../../../types/pipeline.js';

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

  const modelName = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

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
   - If you can infer it, return it (e.g., "zw" for Zimbabwe, "il" for Israel). If unknown, omit.
4. **Place Types**: What types of places? Examples:
   - hotel, restaurant, cafe, bar, store, hospital, pharmacy, gym, park
   - real_estate (for homes/apartments), ski_resort, beach, museum, theater
5. **Filters**: Any constraints mentioned?
   - Price ranges, ratings, amenities, dates, number of guests, etc.
6. **Requires Map**: Should results be shown on a map? (usually yes for location-based queries)
7. **Requires Distance**: Does the user need travel-time or distance calculations?
   - Examples: "within 10 minutes", "nearby", "walking distance"

## Handling Conversation Context (IMPORTANT)

If previous conversation context is provided, you MUST use it to understand follow-up messages.
When the current message is a follow-up (e.g., just a location, a filter, or a clarification):
- **MERGE** the new information with the previous intent
- **INHERIT** fields from the previous intent that are not mentioned in the current message
- The current message takes priority ONLY for fields it explicitly mentions

Examples of follow-up handling:

Previous: User asked for "indian restaurants for lunch with family"
Current: "ramat gan"
→ This is a LOCATION follow-up. Inherit the query, placeTypes, and filters from previous.
→ Result: query: "indian restaurants for lunch with family", location: "Ramat Gan", countryCode: "il",
   placeTypes: ["restaurant"], filters: {cuisine: "Indian"}, requiresMap: true

Previous: User asked for "hotels in NYC"
Current: "under $200 with a pool"
→ This is a FILTER follow-up. Inherit the query, location, placeTypes from previous.
→ Result: query: "hotels with pool", location: "NYC", countryCode: "us", placeTypes: ["hotel"],
   filters: {maxPrice: 200, features: ["pool"]}, requiresMap: true

Previous: User asked for "cafes in Berlin"
Current: "actually, make it restaurants"
→ This is a CORRECTION. Update the placeTypes but keep the location.
→ Result: query: "restaurants", location: "Berlin", countryCode: "de", placeTypes: ["restaurant"],
   requiresMap: true

## Examples (First Message - No Context)

User: "Find Italian restaurants in Brooklyn under $50"
→ query: "Italian restaurants", location: "Brooklyn", countryCode: "us", placeTypes: ["restaurant"],
   filters: {cuisine: "Italian", maxPrice: 50}, requiresMap: true, requiresDistance: false

User: "Hotels in Manhattan with pool and gym"
→ query: "Hotels with pool and gym", location: "Manhattan", countryCode: "us", placeTypes: ["hotel"],
   filters: {features: ["pool", "gym"]}, requiresMap: true, requiresDistance: false

User: "Pharmacies near me open now"
→ query: "Pharmacies open now", location: "Unknown", placeTypes: ["pharmacy"],
   filters: {openNow: true}, requiresMap: true, requiresDistance: true

User: "3 bedroom apartments in San Francisco under $4000"
→ query: "3 bedroom apartments", location: "San Francisco", countryCode: "us", placeTypes: ["real_estate"],
   filters: {beds: 3, maxPrice: 4000}, requiresMap: true, requiresDistance: false

Now extract intent from the user's message, considering any conversation context provided.`;

/**
 * Format conversation history for the LLM prompt
 */
function formatConversationHistory(messages: ConversationMessage[]): string {
  if (messages.length === 0) return '';

  // Only include the last few messages to avoid context overflow
  const recentMessages = messages.slice(-6);

  return recentMessages
    .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n');
}

/**
 * Format previous intent for the LLM prompt
 */
function formatPreviousIntent(intent: ExtractedIntent): string {
  const parts: string[] = [];

  if (intent.query) parts.push(`Query: "${intent.query}"`);
  if (intent.location && intent.location !== 'Unknown') parts.push(`Location: ${intent.location}`);
  if (intent.countryCode) parts.push(`Country: ${intent.countryCode}`);
  if (intent.placeTypes?.length) parts.push(`Place types: ${intent.placeTypes.join(', ')}`);

  const filterParts: string[] = [];
  if (intent.filters) {
    if (intent.filters.cuisine) filterParts.push(`cuisine: ${intent.filters.cuisine}`);
    if (intent.filters.maxPrice) filterParts.push(`max price: ${intent.filters.maxPrice}`);
    if (intent.filters.minPrice) filterParts.push(`min price: ${intent.filters.minPrice}`);
    if (intent.filters.features?.length) filterParts.push(`features: ${intent.filters.features.join(', ')}`);
    if (intent.filters.minRating) filterParts.push(`min rating: ${intent.filters.minRating}`);
    if (intent.filters.dates) filterParts.push(`dates: ${intent.filters.dates}`);
    if (intent.filters.guests) filterParts.push(`guests: ${intent.filters.guests}`);
  }

  if (filterParts.length > 0) {
    parts.push(`Filters: ${filterParts.join(', ')}`);
  }

  return parts.join(' | ');
}

/**
 * Detect if the current message is likely a follow-up that should inherit from previous intent
 */
function isLikelyFollowUp(message: string, hasPreviousIntent: boolean): boolean {
  if (!hasPreviousIntent) return false;

  const trimmed = message.trim().toLowerCase();

  // Very short messages are likely follow-ups (locations, filters, etc.)
  if (trimmed.split(/\s+/).length <= 4) {
    return true;
  }

  // Messages that start with certain patterns are likely follow-ups
  const followUpPatterns = [
    /^(in|at|near|around)\s+/i,           // Location additions: "in Tel Aviv", "near the beach"
    /^(under|below|above|over)\s+\$?\d/i, // Price filters: "under $50"
    /^(with|without)\s+/i,                 // Feature filters: "with pool", "without parking"
    /^(for|on)\s+/i,                       // Date/occasion: "for Saturday", "on weekends"
    /^(actually|but|instead|make it)/i,   // Corrections: "actually, make it..."
    /^(also|and)\s+/i,                     // Additions: "also with wifi"
    /^(yes|no|ok|sure)/i,                  // Confirmations that might include details
    /^(cheaper|nicer|closer|better)/i,    // Comparative filters
  ];

  return followUpPatterns.some((pattern) => pattern.test(trimmed));
}

/**
 * Merge current extracted intent with previous intent for follow-up messages
 * Current values take priority when explicitly set
 */
function mergeIntents(previous: ExtractedIntent, current: ExtractedIntent): ExtractedIntent {
  // Determine what the current message explicitly provides
  const currentHasLocation = current.location && current.location !== 'Unknown';
  const currentHasQuery = current.query && !isGenericQuery(current.query);
  const currentHasPlaceTypes = current.placeTypes?.length > 0 && !current.placeTypes.includes('generic');

  // Merge filters - current takes priority, but inherit missing filters from previous
  const mergedFilters = {
    ...previous.filters,
    ...Object.fromEntries(
      Object.entries(current.filters || {}).filter(([_, v]) => v !== undefined && v !== null)
    ),
  };

  return {
    // Use current query if it's meaningful, otherwise inherit
    query: currentHasQuery ? current.query : previous.query,

    // Use current location if provided, otherwise inherit
    location: currentHasLocation ? current.location : previous.location,

    // Use current country code if location changed, otherwise inherit
    countryCode: currentHasLocation ? current.countryCode : (current.countryCode || previous.countryCode),

    // Use current place types if meaningful, otherwise inherit
    placeTypes: currentHasPlaceTypes ? current.placeTypes : previous.placeTypes,

    // Merged filters
    filters: mergedFilters,

    // These flags should generally be inherited unless explicitly different
    requiresMap: current.requiresMap ?? previous.requiresMap,
    requiresDistance: current.requiresDistance ?? previous.requiresDistance,
    requiresComparison: current.requiresComparison ?? previous.requiresComparison,
  };
}

/**
 * Check if a query is generic/empty
 */
function isGenericQuery(query: string): boolean {
  const genericPatterns = [
    /^(search|find|show|get|look for)?\s*(places?|results?|options?)?$/i,
    /^unknown$/i,
    /^$/,
  ];
  return genericPatterns.some((p) => p.test(query.trim()));
}

/**
 * Node function: Extract Intent
 */
export async function extractIntent(state: PipelineState): Promise<PipelineStateUpdate> {
  console.log('[Node 1: Extract Intent] Starting...');
  console.log('User message:', state.userMessage);

  // Get conversation context
  const conversationHistory = state.conversationHistory;
  const previousMessages = conversationHistory?.messages || [];
  const previousIntent = conversationHistory?.previousIntent || null;

  console.log(`[Node 1: Extract Intent] Previous messages: ${previousMessages.length}`);
  console.log(`[Node 1: Extract Intent] Has previous intent: ${!!previousIntent}`);

  try {
    // Create the intent extraction tool
    const tool = createIntentExtractionTool();

    // Get the model and bind the tool with forced tool choice
    const model = getModel();
    const modelWithTools = model.bindTools([tool], {
      tool_choice: 'extract_user_intent'  // Force the LLM to use the tool
    });

    // Build the prompt with conversation context if available
    let userContent = state.userMessage;

    if (previousMessages.length > 0 || previousIntent) {
      const contextParts: string[] = [];

      if (previousMessages.length > 0) {
        contextParts.push('## Previous Conversation:\n' + formatConversationHistory(previousMessages));
      }

      if (previousIntent) {
        contextParts.push('## Previous Intent (use this to understand what the user was looking for):\n' + formatPreviousIntent(previousIntent));
      }

      contextParts.push('## Current User Message:\n' + state.userMessage);

      userContent = contextParts.join('\n\n');
      console.log('[Node 1: Extract Intent] Using conversation context for intent extraction');
    }

    // Create the prompt
    const messages = [
      {
        role: 'system' as const,
        content: INTENT_EXTRACTION_PROMPT,
      },
      {
        role: 'user' as const,
        content: userContent,
      },
    ];

    // Invoke the model
    console.log('[Node 1: Extract Intent] Calling LLM...');
    const response = await modelWithTools.invoke(messages);

    // Extract tool calls from response
    if (!response.tool_calls || response.tool_calls.length === 0) {
      console.warn('[Node 1: Extract Intent] No tool calls in response, using fallback');

      // Fallback: create a basic intent, but merge with previous if available
      let fallbackIntent: ExtractedIntent = {
        query: state.userMessage,
        location: 'Unknown',
        placeTypes: ['generic'],
        filters: {},
        requiresMap: true,
        requiresDistance: false,
      };

      // If we have previous intent, merge the fallback with it
      if (previousIntent) {
        fallbackIntent = mergeIntents(previousIntent, fallbackIntent);
      }

      return {
        ...createProgressUpdate('intent_extraction', 16),
        extractedIntent: fallbackIntent,
        conversationHistory: {
          messages: previousMessages,
          previousIntent: fallbackIntent,
        },
      };
    }

    // Parse the tool call result
    const toolCall = response.tool_calls[0];

    // Type guard: ensure toolCall exists and has args
    if (!toolCall || !toolCall.args) {
      console.warn('[Node 1: Extract Intent] Tool call missing args, using fallback');

      let fallbackIntent: ExtractedIntent = {
        query: state.userMessage,
        location: 'Unknown',
        placeTypes: ['generic'],
        filters: {},
        requiresMap: true,
        requiresDistance: false,
      };

      // If we have previous intent, merge the fallback with it
      if (previousIntent) {
        fallbackIntent = mergeIntents(previousIntent, fallbackIntent);
      }

      return {
        ...createProgressUpdate('intent_extraction', 16),
        extractedIntent: fallbackIntent,
        conversationHistory: {
          messages: previousMessages,
          previousIntent: fallbackIntent,
        },
      };
    }

    const extractedData = toolCall.args as z.infer<typeof extractIntentSchema>;

    console.log('[Node 1: Extract Intent] Raw extracted intent:', JSON.stringify(extractedData, null, 2));

    // Convert to ExtractedIntent type
    let intent: ExtractedIntent = {
      query: extractedData.query,
      location: extractedData.location,
      countryCode: extractedData.countryCode,
      placeTypes: extractedData.placeTypes,
      filters: extractedData.filters,
      requiresMap: extractedData.requiresMap,
      requiresDistance: extractedData.requiresDistance,
      requiresComparison: extractedData.requiresComparison,
    };

    // If this looks like a follow-up message and we have a previous intent, merge them
    if (previousIntent && isLikelyFollowUp(state.userMessage, true)) {
      console.log('[Node 1: Extract Intent] Detected follow-up message, merging with previous intent');
      intent = mergeIntents(previousIntent, intent);
      console.log('[Node 1: Extract Intent] Merged intent:', JSON.stringify(intent, null, 2));
    }

    console.log('[Node 1: Extract Intent] Final intent:', JSON.stringify(intent, null, 2));

    // Return state update with the intent stored for future turns
    return {
      ...createProgressUpdate('intent_extraction', 16),
      extractedIntent: intent,
      // Store this intent for the next turn
      conversationHistory: {
        messages: previousMessages,
        previousIntent: intent,
      },
    };
  } catch (error) {
    console.error('[Node 1: Extract Intent] Error:', error);

    // On error, create a minimal fallback intent
    let fallbackIntent: ExtractedIntent = {
      query: state.userMessage,
      location: 'Unknown',
      placeTypes: ['generic'],
      filters: {},
      requiresMap: true,
      requiresDistance: false,
    };

    // If we have previous intent, merge the fallback with it
    if (previousIntent) {
      fallbackIntent = mergeIntents(previousIntent, fallbackIntent);
    }

    return {
      ...createProgressUpdate('intent_extraction', 16),
      extractedIntent: fallbackIntent,
      conversationHistory: {
        messages: previousMessages,
        previousIntent: fallbackIntent,
      },
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
