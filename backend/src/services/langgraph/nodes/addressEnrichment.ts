/**
 * Node 4b: Address Enrichment
 *
 * Some scraped places come with only city-level addresses (e.g., "Tel Aviv, Israel").
 * This node searches for each place's precise street address and updates the place data
 * before geocoding, improving marker accuracy.
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PipelineState, PipelineStateUpdate, createProgressUpdate } from '../pipelineState.js';
import { PlaceData, SearchResult } from '../../../types/pipeline.js';
import { loadToolBundle } from '../../mcp/tools.js';

const MAX_ENRICH = 30;

let toolBundleCache: Awaited<ReturnType<typeof loadToolBundle>> | null = null;
async function getToolBundle() {
  if (!toolBundleCache) {
    toolBundleCache = await loadToolBundle();
  }
  return toolBundleCache;
}

let modelCache: ChatGoogleGenerativeAI | null = null;
function getModel(): ChatGoogleGenerativeAI | null {
  if (modelCache) return modelCache;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[Address Enrichment] GEMINI_API_KEY not set; skipping enrichment');
    return null;
  }

  const modelName = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash-exp';
  modelCache = new ChatGoogleGenerativeAI({
    apiKey,
    model: modelName,
    temperature: 0,
  });
  return modelCache;
}

function needsAddressEnrichment(place: PlaceData): boolean {
  const addr = place.address?.trim() ?? '';
  if (!addr) return true;
  const hasStreetNumber = /\d/.test(addr);
  if (hasStreetNumber) return false;

  // If there's no street number, treat it as needing enrichment even if it has multiple segments
  // (e.g., "Tel Aviv, Tel Aviv District" is still too vague)
  const segments = addr.split(',').map((s) => s.trim()).filter(Boolean);
  if (segments.length <= 3) {
    return true;
  }

  // Catch long but still number-less addresses
  return true;
}

async function searchForAddress(query: string): Promise<SearchResult[]> {
  try {
    const { mcpTools } = await getToolBundle();
    const searchTool = mcpTools.find((tool) => tool.name === 'brightdata__search_engine');
    if (!searchTool) {
      console.warn('[Address Enrichment] Search tool not available');
      return [];
    }

    const result = await searchTool.invoke({ query });
    const parsed = typeof result === 'string' ? safeJson(result) ?? {} : result;
    const organic = Array.isArray(parsed?.organic) ? parsed.organic : [];

    return organic.slice(0, 5).map((item: any, idx: number) => ({
      title: item.title || '',
      url: item.link || '',
      snippet: item.description || '',
      position: idx + 1,
    }));
  } catch (error) {
    console.warn('[Address Enrichment] Search error:', error);
    return [];
  }
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildPrompt(place: PlaceData, locationHint: string, results: SearchResult[]): string {
  const resultsText = results
    .map(
      (r, i) => `Result ${i + 1}:
Title: ${r.title}
Snippet: ${r.snippet || ''}
URL: ${r.url}`
    )
    .join('\n\n');

  return `Find the most precise street address (with street name and number if available) for the place:
Name: "${place.name}"
User location: "${locationHint}"

Use ONLY the information in the search results below. Return a single-line address, not a sentence.
If unsure, return exactly "UNKNOWN".

Search results:
${resultsText}

Answer with just the address line.`;
}

function normalizeAddress(candidate: string): string | null {
  const cleaned = candidate.replace(/^[\\"']+|[\\"']+$/g, '').trim();
  if (!cleaned || cleaned.toUpperCase() === 'UNKNOWN') return null;
  // Require some minimal structure
  if (!/\d/.test(cleaned) && cleaned.split(',').length < 2) return null;
  return cleaned;
}

function parseRetryDelayMs(delay?: string): number | null {
  if (!delay) return null;
  const match = delay.match(/(\d+)(ms|s|m)?/i);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  if (Number.isNaN(value)) return null;
  if (unit === 'm') return value * 60_000;
  if (unit === 's' || !unit) return value * 1000;
  if (unit === 'ms') return value;
  return null;
}

function getRetryDelayFromError(error: any): number | null {
  const direct = error?.retryDelay;
  const directMs = typeof direct === 'string' ? parseRetryDelayMs(direct) : null;
  if (directMs) return directMs;

  const details = Array.isArray(error?.errorDetails) ? error.errorDetails : [];
  for (const d of details) {
    if (d?.retryDelay) {
      const parsed = parseRetryDelayMs(d.retryDelay);
      if (parsed) return parsed;
    }
  }
  return null;
}

async function invokeWithRetry(model: ChatGoogleGenerativeAI, prompt: string, maxAttempts = 3): Promise<any> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxAttempts) {
    try {
      return await model.invoke(prompt);
    } catch (error) {
      lastError = error;
      const delayMs = getRetryDelayFromError(error);
      attempt += 1;

      if (!delayMs || attempt >= maxAttempts) {
        throw error;
      }

      console.warn(`[Address Enrichment] Rate limited. Retrying after ${delayMs}ms (attempt ${attempt}/${maxAttempts})`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

async function extractAddress(place: PlaceData, locationHint: string, results: SearchResult[]): Promise<string | null> {
  const model = getModel();
  if (!model) return null;
  if (results.length === 0) return null;

  const prompt = buildPrompt(place, locationHint, results);
  const response = await invokeWithRetry(model, prompt);
  const content = (response as any)?.content;
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((c) => (typeof c === 'string' ? c : c?.text ?? '')).join(' ')
        : '';

  return normalizeAddress(text);
}

export async function enrichAddresses(state: PipelineState): Promise<PipelineStateUpdate> {
  console.log('[Node 4b: Address Enrichment] Starting...');
  const places = state.extractedPlaces || [];

  if (places.length === 0) {
    console.warn('[Node 4b: Address Enrichment] No places to enrich');
    return {
      ...createProgressUpdate('address_enrichment', 70),
      extractedPlaces: [],
    };
  }

  const locationHint = state.extractedIntent?.location ?? '';
  const candidates = places
    .map((place, index) => ({ place, index }))
    .filter(({ place }) => needsAddressEnrichment(place))
    .slice(0, MAX_ENRICH);

  if (candidates.length === 0) {
    console.log('[Node 4b: Address Enrichment] All places already have detailed addresses');
    return {
      ...createProgressUpdate('address_enrichment', 70),
      extractedPlaces: places,
    };
  }

  const updated = [...places];
  await Promise.all(
    candidates.map(async ({ place, index }) => {
      const queryParts = [place.name, place.address || locationHint, 'address']
        .filter(Boolean)
        .join(' ')
        .trim();

      const searchResults = await searchForAddress(queryParts);
      const enrichedAddress = await extractAddress(place, locationHint, searchResults);

      if (enrichedAddress) {
        updated[index] = { ...place, address: enrichedAddress };
        console.log(`[Node 4b: Address Enrichment] Updated address for "${place.name}" -> ${enrichedAddress}`);
      } else {
        console.log(`[Node 4b: Address Enrichment] No better address found for "${place.name}"`);
      }
    })
  );

  return {
    ...createProgressUpdate('address_enrichment', 70),
    extractedPlaces: updated,
  };
}
