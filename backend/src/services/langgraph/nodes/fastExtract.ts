

import { z } from 'zod';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PipelineState, PipelineStateUpdate, createProgressUpdate } from '../pipelineState.js';
import { PlaceData } from '../../../types/pipeline.js';

/**
 * Simplified schema for fast extraction
 */
const fastPlaceSchema = z.object({
  name: z.string().describe('Place name'),
  address: z.string().describe('Address or location mentioned'),
  category: z.string().optional().describe('Place category: restaurant, hotel, cafe, bar, beach, ski_resort, museum, park, shopping, gym, spa, hospital, school, airport, theater, cinema, nightclub, bakery, pizza, sushi, burger, ice_cream, winery, brewery, or other'),
  rating: z.number().min(0).max(5).optional().describe('Rating if mentioned'),
  priceLevel: z.string().optional().describe('Price level: $, $$, $$$, or $$$$'),
  price: z.number().optional().describe('Actual price if mentioned'),
  description: z.string().optional().describe('Brief description from snippet'),
  sourceIndex: z.number().describe('The index number from the search results (e.g., 1, 2, 3...)'),
});

const fastExtractSchema = z.object({
  places: z.array(fastPlaceSchema).describe('Array of extracted places'),
});

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
    throw new Error('GEMINI_API_KEY is required for fast extraction');
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
 * Create extraction prompt for search results
 */
function createFastExtractionPrompt(
  placeTypes: string[],
  location: string,
  searchResults: Array<{ title: string; snippet: string; url: string }>
): string {
  const resultsText = searchResults
    .map((r, i) => `[${i + 1}] Title: ${r.title}\nSnippet: ${r.snippet}\nURL: ${r.url}`)
    .join('\n\n');

  return `Extract place information from these search results.

**Looking for**: ${placeTypes.join(', ')} in ${location}

**Instructions**:
1. Extract place names and addresses from titles and snippets
2. Look for ratings, prices, and descriptions
3. The address should include the location "${location}" if not explicitly mentioned
4. Skip results that are clearly not place listings (articles, guides, etc.)
5. **IMPORTANT**: For each place, include the "sourceIndex" field matching the number in brackets (e.g., if the place came from [3], use sourceIndex: 3). This is used to link the place to its original URL.
6. Assign a category to each place. MUST be one of: restaurant, hotel, cafe, bar, beach, ski_resort, museum, park, shopping, gym, spa, hospital, school, airport, theater, cinema, nightclub, bakery, pizza, sushi, burger, ice_cream, winery, brewery, or other

**Search Results**:

${resultsText}

Return a JSON object with a "places" array containing the extracted data.`;
}

/**
 * Fast Extract Node Function
 *
 * Extracts places from search result snippets using LLM.
 * Much faster than scraping pages.
 */
export async function fastExtract(state: PipelineState): Promise<PipelineStateUpdate> {
  console.log('[Fast Extract] Starting...');
  console.log('Search results to process:', state.searchResults.length);

  try {
    if (!state.searchResults || state.searchResults.length === 0) {
      console.warn('[Fast Extract] No search results to extract from');
      return {
        ...createProgressUpdate('fast_extract', 60),
        extractedPlaces: [],
      };
    }

    const intent = state.extractedIntent;
    if (!intent) {
      console.warn('[Fast Extract] No intent available');
      return {
        ...createProgressUpdate('fast_extract', 60),
        extractedPlaces: [],
      };
    }

    // Prepare search results for extraction
    const searchData = state.searchResults.map((r) => ({
      title: r.title,
      snippet: r.snippet || '',
      url: r.url,
    }));

    // Get the model and configure with structured output
    const model = getModel();
    const structuredModel = model.withStructuredOutput(fastExtractSchema, {
      name: 'extract_places_from_search',
      strict: true,
    });

    // Create prompt and invoke
    const prompt = createFastExtractionPrompt(
      intent.placeTypes,
      intent.location,
      searchData
    );

    console.log('[Fast Extract] Calling LLM for extraction...');
    const extractedData = await structuredModel.invoke(prompt) as z.infer<typeof fastExtractSchema>;

    // Map to PlaceData format
    const places: PlaceData[] = extractedData.places.map((place) => {
      // Use sourceIndex to get the correct URL (sourceIndex is 1-based, array is 0-based)
      const sourceUrl = searchData[place.sourceIndex - 1]?.url || searchData[0]?.url || '';

      return {
        name: place.name,
        address: place.address,
        category: place.category,
        rating: place.rating,
        priceLevel: place.priceLevel,
        price: place.price,
        description: place.description,
        url: sourceUrl,
        metadata: {},
      };
    });

    console.log(`[Fast Extract] Extracted ${places.length} places`);

    if (places.length > 0) {
      console.log('[Fast Extract] Sample place:', JSON.stringify(places[0], null, 2));
    }

    return {
      ...createProgressUpdate('fast_extract', 60),
      extractedPlaces: places,
    };
  } catch (error) {
    console.error('[Fast Extract] Error:', error);

    return {
      ...createProgressUpdate('fast_extract', 60),
      extractedPlaces: [],
      errors: [
        {
          node: 'fast_extract',
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date(),
        },
      ],
    };
  }
}
