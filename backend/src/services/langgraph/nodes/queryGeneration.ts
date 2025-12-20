/**
 * Node 2: Query Generation
 *
 * This node uses the LLM to generate optimized search queries based on the extracted intent.
 * Unlike the old hardcoded approach, the LLM dynamically decides:
 * - Which domains/websites to search
 * - How to structure the query
 * - How many queries to generate
 *
 * The LLM gets domain hints but makes the final decisions.
 */

import { z } from 'zod';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { PipelineState, PipelineStateUpdate, createProgressUpdate } from '../pipelineState.js';
import { GeneratedQuery } from '../../../types/pipeline.js';

/**
 * Zod schema for query generation
 */
const generateQueriesSchema = z.object({
  queries: z
    .array(z.string())
    .min(2)
    .max(4)
    .describe('Array of 2-4 optimized search queries with site: operators'),
  searchStrategy: z
    .enum(['multi_source', 'single_authority', 'aggregator', 'direct'])
    .describe('Search strategy to use'),
  maxResults: z
    .number()
    .min(5)
    .max(20)
    .describe('Maximum number of results to fetch per query'),
  domains: z
    .array(z.string())
    .optional()
    .describe('Suggested domains/websites used in queries'),
});

/**
 * Create the query generation tool
 */
function createQueryGenerationTool() {
  return new DynamicStructuredTool({
    name: 'generate_search_queries',
    description: 'Generate optimized Google search queries for finding places',
    schema: generateQueriesSchema,
    func: async (input) => {
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
    throw new Error('GEMINI_API_KEY is required for query generation');
  }

  const modelName = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash-exp';

  modelCache = new ChatGoogleGenerativeAI({
    apiKey,
    model: modelName,
    temperature: 0.3, // Slightly higher temperature for query variety
  });

  return modelCache;
}

/**
 * Domain hints for common place types
 * These are suggestions - the LLM can choose to use them or not
 */
const DOMAIN_HINTS: Record<string, string[]> = {
  hotel: ['booking.com', 'hotels.com', 'expedia.com', 'tripadvisor.com'],
  restaurant: ['yelp.com', 'opentable.com', 'tripadvisor.com', 'maps.google.com'],
  real_estate: ['zillow.com', 'redfin.com', 'realtor.com', 'trulia.com'],
  apartment: ['apartments.com', 'zillow.com', 'rent.com'],
  ski_resort: ['skiresort.info', 'onthesnow.com', 'booking.com'],
  healthcare: ['healthgrades.com', 'zocdoc.com', 'vitals.com', 'maps.google.com'],
  hospital: ['healthgrades.com', 'maps.google.com'],
  pharmacy: ['cvs.com', 'walgreens.com', 'maps.google.com'],
  store: ['yelp.com', 'maps.google.com'],
  gym: ['classpass.com', 'yelp.com', 'maps.google.com'],
  cafe: ['yelp.com', 'tripadvisor.com', 'maps.google.com'],
  bar: ['yelp.com', 'tripadvisor.com'],
  museum: ['tripadvisor.com', 'maps.google.com'],
  park: ['maps.google.com', 'alltrails.com'],
  beach: ['tripadvisor.com', 'beachsearcher.com'],
};

/**
 * Get domain hints for place types
 */
function getDomainHints(placeTypes: string[]): string[] {
  const hints = new Set<string>();

  for (const placeType of placeTypes) {
    const normalizedType = placeType.toLowerCase().replace(/[_\s]+/g, '_');
    const domains = DOMAIN_HINTS[normalizedType];

    if (domains) {
      domains.forEach((domain) => hints.add(domain));
    }
  }

  // Always include Google Maps as a fallback
  hints.add('maps.google.com');

  return Array.from(hints);
}

/**
 * Prompt template for query generation
 */
function createQueryPrompt(
  query: string,
  location: string,
  placeTypes: string[],
  filters: Record<string, any>,
  domainHints: string[]
): string {
  const filterText = Object.entries(filters)
    .filter(([_, value]) => value !== undefined && value !== null)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}: ${value.join(', ')}`;
      }
      return `${key}: ${value}`;
    })
    .join(', ');

  return `You are an expert at creating Google search queries to find places.

User is looking for: ${query}
Location: ${location}
Place types: ${placeTypes.join(', ')}
${filterText ? `Filters: ${filterText}` : ''}

**Domain Suggestions** (use these as hints, but you can choose others if better):
${domainHints.map((d) => `- ${d}`).join('\n')}

**Your Task:**
Generate 2-4 optimized Google search queries using the \`site:\` operator.

**Guidelines:**
1. **Use site: operator** - Target authoritative sources (e.g., "site:yelp.com")
2. **Be specific** - Include location, filters, and key terms
3. **Vary sources** - Use different domains to get diverse results
4. **Optimize for results** - Structure queries to return relevant listings

**Examples:**

Query: "Italian restaurants in Brooklyn under $50"
→ [
    "site:yelp.com Italian restaurants Brooklyn under $50",
    "site:opentable.com Italian Brooklyn reservations",
    "site:maps.google.com Italian restaurant Brooklyn"
  ]

Query: "Hotels in Manhattan with pool and gym"
→ [
    "site:booking.com hotels Manhattan pool gym",
    "site:hotels.com Manhattan hotel amenities pool fitness",
    "site:tripadvisor.com Manhattan hotels facilities"
  ]

Query: "3 bedroom apartments in San Francisco under $4000"
→ [
    "site:zillow.com 3 bedroom apartments San Francisco $4000",
    "site:apartments.com San Francisco 3br under 4000",
    "site:redfin.com San Francisco rental 3 bed"
  ]

**Search Strategy:**
- "multi_source": Use multiple different domains (recommended for most queries)
- "single_authority": Focus on one authoritative source (for specific needs)
- "aggregator": Use aggregator sites like Google Maps or TripAdvisor
- "direct": Direct search without site: operator (rare)

**Max Results:** Choose 5-20 based on query complexity and expected result count.

Generate the queries now:`;
}

/**
 * Node function: Generate Queries
 */
export async function generateQueries(state: PipelineState): Promise<PipelineStateUpdate> {
  console.log('[Node 2: Generate Queries] Starting...');
  console.log('Intent:', state.extractedIntent);

  try {
    // Check if we have extracted intent
    if (!state.extractedIntent) {
      console.warn('[Node 2: Generate Queries] No extracted intent, using fallback');

      return {
        ...createProgressUpdate('query_generation', 32),
        generatedQueries: {
          queries: [state.userMessage],
          searchStrategy: 'direct',
          maxResults: 10,
        },
      };
    }

    const { query, location, placeTypes, filters } = state.extractedIntent;

    // Get domain hints based on place types
    const domainHints = getDomainHints(placeTypes);
    console.log('[Node 2: Generate Queries] Domain hints:', domainHints);

    // Create the tool
    const tool = createQueryGenerationTool();

    // Get the model and bind the tool
    const model = getModel();
    const modelWithTools = model.bindTools([tool]);

    // Create the prompt
    const promptText = createQueryPrompt(query, location, placeTypes, filters, domainHints);

    const messages = [
      {
        role: 'system' as const,
        content: promptText,
      },
      {
        role: 'user' as const,
        content: `Generate search queries for: "${query}" in ${location}`,
      },
    ];

    // Invoke the model
    console.log('[Node 2: Generate Queries] Calling LLM...');
    const response = await modelWithTools.invoke(messages);

    // Extract tool calls
    if (!response.tool_calls || response.tool_calls.length === 0) {
      console.warn('[Node 2: Generate Queries] No tool calls, using fallback');

      // Fallback: create a simple query
      const fallbackQuery = `${query} ${location !== 'Unknown' ? location : ''}`.trim();

      return {
        ...createProgressUpdate('query_generation', 32),
        generatedQueries: {
          queries: [fallbackQuery],
          searchStrategy: 'direct',
          maxResults: 10,
        },
      };
    }

    const toolCall = response.tool_calls[0];

    // Type guard
    if (!toolCall || !toolCall.args) {
      console.warn('[Node 2: Generate Queries] Tool call missing args, using fallback');

      const fallbackQuery = `${query} ${location !== 'Unknown' ? location : ''}`.trim();

      return {
        ...createProgressUpdate('query_generation', 32),
        generatedQueries: {
          queries: [fallbackQuery],
          searchStrategy: 'direct',
          maxResults: 10,
        },
      };
    }

    const extractedData = toolCall.args as z.infer<typeof generateQueriesSchema>;

    console.log('[Node 2: Generate Queries] Generated queries:', JSON.stringify(extractedData, null, 2));

    // Convert to GeneratedQuery type
    const generatedQueries: GeneratedQuery = {
      queries: extractedData.queries,
      searchStrategy: extractedData.searchStrategy,
      maxResults: extractedData.maxResults,
      domains: extractedData.domains,
    };

    return {
      ...createProgressUpdate('query_generation', 32),
      generatedQueries,
    };
  } catch (error) {
    console.error('[Node 2: Generate Queries] Error:', error);

    // On error, create a minimal fallback
    const fallbackQuery = state.extractedIntent
      ? `${state.extractedIntent.query} ${state.extractedIntent.location !== 'Unknown' ? state.extractedIntent.location : ''}`.trim()
      : state.userMessage;

    return {
      ...createProgressUpdate('query_generation', 32),
      generatedQueries: {
        queries: [fallbackQuery],
        searchStrategy: 'direct',
        maxResults: 10,
      },
      errors: [
        {
          node: 'generate_queries',
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date(),
        },
      ],
    };
  }
}
