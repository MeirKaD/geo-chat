

import { z } from 'zod';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PipelineState, PipelineStateUpdate, createProgressUpdate } from '../pipelineState.js';
import { PlaceData } from '../../../types/pipeline.js';
import { normalizeUrl, isValidUrl } from '../../../utils/urlUtils.js';

/**
 * Zod schema for a single place
 */
const placeDataSchema = z.object({
  name: z.string().describe('Place name'),
  address: z.string().describe('Full address'),
  coordinates: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional()
    .describe('Coordinates if available in the content'),
  category: z.string().optional().describe('Place category: restaurant, hotel, cafe, bar, beach, ski_resort, museum, park, shopping, gym, spa, hospital, school, or other'),
  rating: z.number().min(0).max(5).optional().describe('Rating (0-5 scale)'),
  reviewCount: z.number().optional().describe('Number of reviews'),
  priceLevel: z.string().optional().describe('Price level: $, $$, $$$, or $$$$'),
  price: z.number().optional().describe('Actual price if mentioned'),
  description: z.string().optional().describe('Description or summary'),
  url: z.string().describe('Source URL'),
  phone: z.string().optional().describe('Phone number'),
  website: z.string().optional().describe('Website URL'),
  hours: z.string().optional().describe('Business hours'),
  amenities: z.array(z.string()).optional().describe('Amenities/features list'),
  photos: z.array(z.string()).optional().describe('Photo URLs'),
});

/**
 * Zod schema for extraction result (array of places)
 */
const extractPlacesSchema = z.object({
  places: z.array(placeDataSchema).describe('Array of extracted places'),
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
    throw new Error('GEMINI_API_KEY is required for data extraction');
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
 * Create extraction prompt based on intent
 */
function createExtractionPrompt(
  placeTypes: string[],
  scrapedContent: string,
  filters: Record<string, any>
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

  return `You are an expert at extracting structured place information from web content.

**Task**: Extract place listings from the content below.

**Place Types**: ${placeTypes.join(', ')}
${filterText ? `**User Filters**: ${filterText}` : ''}

**Instructions**:
1. Find all place listings in the content
2. Extract structured data for each place
3. Include as much information as available
4. Skip entries that don't have at least a name and address
5. Infer price level from context if exact price not mentioned
6. **CRITICAL**: Look carefully for coordinates (latitude/longitude) in the content - they may be in URLs, data attributes, or embedded in the page. Extract them whenever possible to ensure accurate map placement.

**Field Guidelines**:
- **name**: The business/place name
- **address**: COMPLETE street address including street name and number. NEVER use just city name. If no street address is visible, skip this place.
- **category**: The type of place. MUST be one of: restaurant, hotel, cafe, bar, beach, ski_resort, museum, park, shopping, gym, spa, hospital, school, airport, theater, cinema, nightclub, bakery, pizza, sushi, burger, ice_cream, winery, brewery, or other
- **rating**: Numeric rating (convert from stars/text to 0-5 scale)
- **reviewCount**: Number of reviews if mentioned
- **priceLevel**: $ (cheap), $$ (moderate), $$$ (expensive), $$$$ (luxury)
- **price**: Actual price/rate if mentioned (numeric)
- **description**: Brief description or highlights
- **url**: The source URL for this place
- **phone**: Phone number if present
- **website**: Website URL if different from source
- **hours**: Operating hours if mentioned
- **amenities**: List of features/amenities (e.g., ["pool", "wifi", "parking"])

**IMPORTANT**: Extract the most specific address available. Look for street addresses, but if only landmarks or area names are available, include those.

**Examples of good extractions**:

For hotels:
{
  "name": "Grand Hotel Downtown",
  "address": "123 Main Street, New York, NY 10001",
  "category": "hotel",
  "rating": 4.5,
  "reviewCount": 328,
  "priceLevel": "$$$",
  "price": 250,
  "description": "Luxury hotel in the heart of downtown",
  "amenities": ["pool", "gym", "free wifi", "restaurant"]
}

For restaurants:
{
  "name": "Luigi's Italian Kitchen",
  "address": "456 Oak Ave, Brooklyn, NY 11201",
  "category": "restaurant",
  "rating": 4.2,
  "reviewCount": 156,
  "priceLevel": "$$",
  "description": "Authentic Italian cuisine with homemade pasta",
  "amenities": ["outdoor seating", "reservations accepted"]
}

Extract places from the content now:

---

${scrapedContent}

---

Return a JSON object with a "places" array containing all extracted place data.`;
}

/**
 * Extract places from a single page
 */
async function extractFromPage(
  structuredModel: any,
  page: { url: string; markdown: string },
  placeTypes: string[],
  filters: Record<string, any>
): Promise<PlaceData[]> {
  try {
    // Limit content to avoid token limits
    const content = page.markdown

    const promptText = createExtractionPrompt(placeTypes, content, filters);

    const extractedData = await structuredModel.invoke(promptText) as z.infer<typeof extractPlacesSchema>;

    // Ensure all places have the source URL and metadata
    const places = extractedData.places.map(place => {
      const originalUrl = place.url || page.url;
      const normalizedUrl = normalizeUrl(originalUrl, page.url);

      // Log URL transformation for debugging
      if (originalUrl !== normalizedUrl) {
        console.log(`[Data Extraction] URL normalized: ${originalUrl} -> ${normalizedUrl}`);
      }

      return {
        ...place,
        url: normalizedUrl,
        metadata: {}, // Initialize empty metadata object
      };
    }) as PlaceData[];

    return places;
  } catch (error) {
    console.error(`[Data Extraction] Failed to extract from ${page.url}:`, error);
    return [];
  }
}

/**
 * Validate and filter extracted places
 */
function validatePlaces(places: any[], sourceUrls: string[]): PlaceData[] {
  const validPlaces: PlaceData[] = [];

  for (const place of places) {
    // Must have name and address
    if (!place.name || !place.address) {
      console.warn('[Data Extraction] Skipping place without name/address:', place);
      continue;
    }

    // Ensure URL is set (use first source URL if not provided)
    if (!place.url && sourceUrls.length > 0) {
      place.url = sourceUrls[0];
    }

    // Validate URL is absolute and valid
    if (!isValidUrl(place.url)) {
      console.warn('[Data Extraction] Skipping place with invalid URL:', place.name, place.url);
      continue;
    }

    // Ensure metadata exists
    if (!place.metadata) {
      place.metadata = {};
    }

    validPlaces.push(place as PlaceData);
  }

  return validPlaces;
}

/**
 * Node function: Extract Places
 */
export async function extractPlaces(state: PipelineState): Promise<PipelineStateUpdate> {
  console.log('[Node 4: Extract Places] Starting...');
  console.log('Scraped pages:', state.scrapedContent.length);

  try {
    // Check if we have scraped content
    if (!state.scrapedContent || state.scrapedContent.length === 0) {
      console.warn('[Node 4: Extract Places] No scraped content to extract from');

      return {
        ...createProgressUpdate('data_extraction', 64),
        extractedPlaces: [],
      };
    }

    // Get intent for context
    const intent = state.extractedIntent;
    if (!intent) {
      console.warn('[Node 4: Extract Places] No intent available');

      return {
        ...createProgressUpdate('data_extraction', 64),
        extractedPlaces: [],
      };
    }

    // Get the model and configure with structured output
    const model = getModel();
    const structuredModel = model.withStructuredOutput(extractPlacesSchema, {
      name: 'extract_places_from_content',
      strict: true,
    });

    // Process all pages in parallel for better performance
    console.log(`[Node 4: Extract Places] Processing ${state.scrapedContent.length} pages in parallel...`);

    const extractionPromises = state.scrapedContent.map((page) =>
      extractFromPage(structuredModel, page, intent.placeTypes, intent.filters)
    );

    // Wait for all extractions to complete
    const extractionResults = await Promise.all(extractionPromises);

    // Flatten all results into a single array
    const allPlaces: PlaceData[] = extractionResults.flat();

    console.log(`[Node 4: Extract Places] Total extracted: ${allPlaces.length} places from ${state.scrapedContent.length} pages`);

    // Validate and filter places
    const sourceUrls = state.scrapedContent.map((p) => p.url);
    const validPlaces = validatePlaces(allPlaces, sourceUrls);

    console.log(`[Node 4: Extract Places] ${validPlaces.length} valid places after filtering`);

    // Log sample for debugging
    if (validPlaces.length > 0) {
      console.log('[Node 4: Extract Places] Sample place:', JSON.stringify(validPlaces[0], null, 2));
    }

    return {
      ...createProgressUpdate('data_extraction', 64),
      extractedPlaces: validPlaces,
    };
  } catch (error) {
    console.error('[Node 4: Extract Places] Error:', error);

    // On error, return empty results
    return {
      ...createProgressUpdate('data_extraction', 64),
      extractedPlaces: [],
      errors: [
        {
          node: 'extract_places',
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date(),
        },
      ],
    };
  }
}
