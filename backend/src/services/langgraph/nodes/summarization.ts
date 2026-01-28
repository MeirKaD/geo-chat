
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PipelineState, PipelineStateUpdate, createProgressUpdate } from '../pipelineState.js';
import { MapMarker } from '../../tools/schemas.js';
import { ExtractedIntent } from '../../../types/pipeline.js';

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
    throw new Error('GEMINI_API_KEY is required for summarization');
  }

  const modelName = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

  modelCache = new ChatGoogleGenerativeAI({
    apiKey,
    model: modelName,
    temperature: 0.7, // Higher temperature for more natural, varied responses
  });

  return modelCache;
}

/**
 * Format marker data for the prompt
 */
function formatMarkersForPrompt(markers: MapMarker[]): string {
  if (markers.length === 0) {
    return 'No places found.';
  }

  return markers
    .slice(0, 10) // Limit to top 10 to avoid token limits
    .map((marker, index) => {
      const parts: string[] = [`${index + 1}. **${marker.title}**`];

      // Add rating if available
      if (marker.data?.rating) {
        const reviewText = marker.data?.reviewCount ? ` (${marker.data.reviewCount} reviews)` : '';
        parts.push(`Rating: ${marker.data.rating}/5${reviewText}`);
      }

      // Add price if available
      if (marker.data?.priceLevel) {
        parts.push(`Price: ${marker.data.priceLevel}`);
      } else if (marker.data?.price) {
        parts.push(`Price: $${marker.data.price}`);
      }

      // Add address
      if (marker.data?.address) {
        parts.push(`Address: ${marker.data.address}`);
      }

      // Add description
      if (marker.description) {
        parts.push(`Description: ${marker.description}`);
      }

      // Add amenities (first 3)
      if (marker.data?.amenities && marker.data.amenities.length > 0) {
        const amenities = marker.data.amenities.slice(0, 3).join(', ');
        parts.push(`Amenities: ${amenities}`);
      }

      return parts.join('\n   ');
    })
    .join('\n\n');
}

/**
 * Create summarization prompt
 */
function createSummarizationPrompt(
  userMessage: string,
  intent: ExtractedIntent | null,
  markers: MapMarker[],
  hasErrors: boolean
): string {
  const intentText = intent
    ? `
**User Intent:**
- Looking for: ${intent.query}
- Location: ${intent.location}
- Place types: ${intent.placeTypes.join(', ')}
${Object.keys(intent.filters).length > 0 ? `- Filters: ${JSON.stringify(intent.filters)}` : ''}
`
    : '';

  const markersText = formatMarkersForPrompt(markers);

  return `You are a friendly AI assistant helping users find places on a map.

**User's Original Request:**
"${userMessage}"

${intentText}

**Search Results:**
Found ${markers.length} place${markers.length !== 1 ? 's' : ''}

${markersText}

${hasErrors ? '**Note:** Some errors occurred during the search, but we still found results.' : ''}

**Your Task:**
Generate a friendly, concise response (2-4 sentences) that:
1. Acknowledges what the user was looking for
2. Highlights the best 2-3 options (highest rated or most relevant)
3. Mentions key details that match their criteria
4. If no results found, suggest alternatives or ask for clarification

**Tone:** Friendly, helpful, conversational
**Length:** 2-4 sentences maximum
**Focus:** Actionable information the user can use right away

**Examples:**

User: "Find Italian restaurants in Brooklyn under $50"
Response: "I found 8 Italian restaurants in Brooklyn that fit your budget! Luigi's Italian Kitchen (4.2/5, $$) and Pasta Paradise (4.5/5, $$) are highly rated options with great reviews. All locations are now marked on your map - click any marker for details like hours and amenities."

User: "Hotels near Times Square with a pool"
Response: "I've marked 5 hotels near Times Square with pools on your map! The Grand Hotel (4.5/5, $$$) and Skyline Suites (4.3/5, $$) are top-rated options. Check the map markers for pricing, amenities, and booking links."

User: "Coffee shops in Seattle"
Response: "Found 12 coffee shops in Seattle! The top picks include Seattle Coffee Works (4.7/5) and Espresso Vivace (4.6/5), both known for excellent espresso. Click the markers on the map to see hours, photos, and exact locations."

Generate your response now:`;
}

/**
 * Generate a fallback summary when LLM fails
 */
function generateFallbackSummary(userMessage: string, markerCount: number): string {
  if (markerCount === 0) {
    return `I couldn't find any places matching "${userMessage}". Try broadening your search or specifying a different location.`;
  }

  if (markerCount === 1) {
    return `I found 1 place matching your request. Check the map marker for details!`;
  }

  return `I found ${markerCount} places matching your request. Check the map markers for details about each location!`;
}

/**
 * Node function: Summarize Results
 */
export async function summarize(state: PipelineState): Promise<PipelineStateUpdate> {
  console.log('[Node 6: Summarize] Starting...');
  console.log('Markers found:', state.markers.length);

  try {
    const markerCount = state.markers.length;
    const hasErrors = state.errors.length > 0;

    // Generate fallback summary first
    const fallbackSummary = generateFallbackSummary(state.userMessage, markerCount);

    // If no markers and errors occurred, use a more informative fallback
    if (markerCount === 0 && hasErrors) {
      return {
        ...createProgressUpdate('complete', 100),
        finalMessage: `I encountered some issues while searching for "${state.userMessage}". Please try rephrasing your request or being more specific about the location.`,
      };
    }

    // If we have very few results, we can use a simple fallback
    if (markerCount === 0) {
      return {
        ...createProgressUpdate('complete', 100),
        finalMessage: fallbackSummary,
      };
    }

    // Get the model
    const model = getModel();

    // Create the prompt
    const promptText = createSummarizationPrompt(
      state.userMessage,
      state.extractedIntent,
      state.markers,
      hasErrors
    );

    const messages = [
      {
        role: 'system' as const,
        content: 'You are a helpful AI assistant that summarizes search results in a friendly, concise way.',
      },
      {
        role: 'user' as const,
        content: promptText,
      },
    ];

    // Invoke the model
    console.log('[Node 6: Summarize] Calling LLM for summary...');
    const response = await model.invoke(messages);

    // Extract the text content
    const summaryText = typeof response.content === 'string'
      ? response.content
      : response.content.toString();

    if (!summaryText || summaryText.trim().length === 0) {
      console.warn('[Node 6: Summarize] LLM returned empty summary, using fallback');
      return {
        ...createProgressUpdate('complete', 100),
        finalMessage: fallbackSummary,
      };
    }

    console.log('[Node 6: Summarize] Summary generated:', summaryText);

    return {
      ...createProgressUpdate('complete', 100),
      finalMessage: summaryText.trim(),
    };
  } catch (error) {
    console.error('[Node 6: Summarize] Error:', error);

    // On error, return a simple fallback summary
    const fallbackSummary = generateFallbackSummary(state.userMessage, state.markers.length);

    return {
      ...createProgressUpdate('complete', 100),
      finalMessage: fallbackSummary,
      errors: [
        {
          node: 'summarize',
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date(),
        },
      ],
    };
  }
}
