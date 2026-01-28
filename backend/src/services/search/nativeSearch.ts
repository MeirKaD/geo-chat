/**
 * Native Bright Data Search API
 *
 * Uses the Bright Data API directly for search with geo-location support.
 * MCP is still used for scraping, but search uses native API to support
 * the `gl` parameter for geo-targeting.
 */

import axios from 'axios';
import { SearchResult } from '../../types/pipeline.js';

const UNLOCKER_ZONE = 'unblocker';

/**
 * Build Google search URL with geo-location parameter
 */
function buildSearchUrl(query: string, countryCode?: string, start: number = 0): string {
  const encodedQuery = encodeURIComponent(query);
  let url = `https://www.google.com/search?q=${encodedQuery}&start=${start}`;

  // Add geo-location parameter if provided
  if (countryCode) {
    url += `&gl=${countryCode.toLowerCase()}`;
  }

  return url;
}

/**
 * Get API headers for Bright Data requests
 */
function getApiHeaders(clientName?: string): Record<string, string> {
  const token = process.env.BRIGHTDATA_API_TOKEN;

  if (!token) {
    throw new Error('BRIGHTDATA_API_TOKEN is required for native search');
  }

  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(clientName && { 'X-Client-Name': clientName }),
  };
}

/**
 * Clean and structure Google search response
 */
function cleanGoogleSearchPayload(data: any): { organic: any[] } {
  // Handle the parsed_light format from Bright Data
  if (data.organic && Array.isArray(data.organic)) {
    return {
      organic: data.organic.map((item: any, index: number) => ({
        title: item.title || '',
        link: item.link || item.url || '',
        description: item.description || item.snippet || '',
        position: index + 1,
      })),
    };
  }

  // Fallback for other formats
  if (data.results && Array.isArray(data.results)) {
    return {
      organic: data.results.map((item: any, index: number) => ({
        title: item.title || '',
        link: item.link || item.url || '',
        description: item.description || item.snippet || '',
        position: index + 1,
      })),
    };
  }

  return { organic: [] };
}

export interface NativeSearchOptions {
  /** Search query */
  query: string;
  /** ISO 3166-1 alpha-2 country code for geo-targeting (e.g., 'us', 'il', 'gb') */
  countryCode?: string;
  /** Pagination start (default: 0) */
  start?: number;
  /** Client name for tracking */
  clientName?: string;
}

/**
 * Execute a search using Bright Data's native API with geo-location support
 */
export async function executeNativeSearch(options: NativeSearchOptions): Promise<SearchResult[]> {
  const { query, countryCode, start = 0, clientName } = options;

  console.log(`[Native Search] Executing search for: "${query}"${countryCode ? ` (gl=${countryCode})` : ''}`);

  try {
    const url = buildSearchUrl(query, countryCode, start);

    const response = await axios({
      url: 'https://api.brightdata.com/request',
      method: 'POST',
      data: {
        url: url,
        zone: UNLOCKER_ZONE,
        format: 'raw',
        data_format: 'parsed_light',
      },
      headers: getApiHeaders(clientName),
      responseType: 'text',
      timeout: 30000, // 30 second timeout
    });

    // Parse the response
    let searchData: any;
    try {
      searchData = JSON.parse(response.data);
    } catch {
      console.warn('[Native Search] Failed to parse response as JSON');
      return [];
    }

    const cleanedData = cleanGoogleSearchPayload(searchData);

    // Convert to SearchResult format
    const results: SearchResult[] = cleanedData.organic.map((item, index) => ({
      title: item.title || '',
      url: item.link || '',
      snippet: item.description || '',
      position: index + 1,
    }));

    console.log(`[Native Search] Found ${results.length} results for: "${query}"`);
    return results;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Native Search] Error searching for "${query}":`, errorMessage);

    // Check for specific error types
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        console.error('[Native Search] Authentication failed - check BRIGHTDATA_API_TOKEN');
      } else if (error.response?.status === 429) {
        console.error('[Native Search] Rate limited - too many requests');
      }
    }

    return [];
  }
}

/**
 * Map common location strings to country codes
 * This is a helper for the query generation to determine the appropriate gl parameter
 */
export const LOCATION_TO_COUNTRY_CODE: Record<string, string> = {
  // Middle East
  'israel': 'il',
  'tel aviv': 'il',
  'jerusalem': 'il',
  'haifa': 'il',
  'ashkelon': 'il',
  'ashdod': 'il',
  'beer sheva': 'il',
  'eilat': 'il',
  'netanya': 'il',
  'rishon lezion': 'il',
  'petah tikva': 'il',
  'ramat gan': 'il',
  'bnei brak': 'il',
  'holon': 'il',
  'bat yam': 'il',
  'herzliya': 'il',
  'kfar saba': 'il',
  'raanana': 'il',
  'modiin': 'il',
  'rehovot': 'il',

  // United States
  'usa': 'us',
  'united states': 'us',
  'new york': 'us',
  'los angeles': 'us',
  'chicago': 'us',
  'houston': 'us',
  'phoenix': 'us',
  'philadelphia': 'us',
  'san antonio': 'us',
  'san diego': 'us',
  'dallas': 'us',
  'san jose': 'us',
  'austin': 'us',
  'jacksonville': 'us',
  'fort worth': 'us',
  'columbus': 'us',
  'san francisco': 'us',
  'charlotte': 'us',
  'indianapolis': 'us',
  'seattle': 'us',
  'denver': 'us',
  'washington': 'us',
  'boston': 'us',
  'el paso': 'us',
  'detroit': 'us',
  'nashville': 'us',
  'portland': 'us',
  'memphis': 'us',
  'oklahoma city': 'us',
  'las vegas': 'us',
  'louisville': 'us',
  'baltimore': 'us',
  'milwaukee': 'us',
  'albuquerque': 'us',
  'tucson': 'us',
  'fresno': 'us',
  'sacramento': 'us',
  'mesa': 'us',
  'kansas city': 'us',
  'atlanta': 'us',
  'miami': 'us',
  'oakland': 'us',
  'minneapolis': 'us',
  'tulsa': 'us',
  'cleveland': 'us',
  'wichita': 'us',
  'arlington': 'us',
  'new orleans': 'us',
  'bakersfield': 'us',
  'tampa': 'us',
  'honolulu': 'us',
  'aurora': 'us',
  'anaheim': 'us',
  'manhattan': 'us',
  'brooklyn': 'us',
  'queens': 'us',
  'bronx': 'us',
  'staten island': 'us',
  'silicon valley': 'us',
  'hollywood': 'us',

  // United Kingdom
  'uk': 'gb',
  'united kingdom': 'gb',
  'england': 'gb',
  'london': 'gb',
  'birmingham': 'gb',
  'manchester': 'gb',
  'leeds': 'gb',
  'glasgow': 'gb',
  'liverpool': 'gb',
  'newcastle': 'gb',
  'sheffield': 'gb',
  'bristol': 'gb',
  'edinburgh': 'gb',
  'cardiff': 'gb',
  'belfast': 'gb',
  'nottingham': 'gb',
  'southampton': 'gb',
  'cambridge': 'gb',
  'oxford': 'gb',

  // Europe
  'france': 'fr',
  'paris': 'fr',
  'marseille': 'fr',
  'lyon': 'fr',
  'toulouse': 'fr',
  'nice': 'fr',

  'germany': 'de',
  'berlin': 'de',
  'munich': 'de',
  'frankfurt': 'de',
  'hamburg': 'de',
  'cologne': 'de',

  'italy': 'it',
  'rome': 'it',
  'milan': 'it',
  'naples': 'it',
  'turin': 'it',
  'florence': 'it',
  'venice': 'it',

  'spain': 'es',
  'madrid': 'es',
  'barcelona': 'es',
  'valencia': 'es',
  'seville': 'es',

  'netherlands': 'nl',
  'amsterdam': 'nl',
  'rotterdam': 'nl',
  'the hague': 'nl',

  'belgium': 'be',
  'brussels': 'be',
  'antwerp': 'be',

  'switzerland': 'ch',
  'zurich': 'ch',
  'geneva': 'ch',
  'bern': 'ch',

  'austria': 'at',
  'vienna': 'at',
  'salzburg': 'at',

  'portugal': 'pt',
  'lisbon': 'pt',
  'porto': 'pt',

  'greece': 'gr',
  'athens': 'gr',
  'thessaloniki': 'gr',

  'poland': 'pl',
  'warsaw': 'pl',
  'krakow': 'pl',

  'czech republic': 'cz',
  'czechia': 'cz',
  'prague': 'cz',

  'sweden': 'se',
  'stockholm': 'se',
  'gothenburg': 'se',

  'norway': 'no',
  'oslo': 'no',
  'bergen': 'no',

  'denmark': 'dk',
  'copenhagen': 'dk',

  'finland': 'fi',
  'helsinki': 'fi',

  'ireland': 'ie',
  'dublin': 'ie',

  // Asia Pacific
  'australia': 'au',
  'sydney': 'au',
  'melbourne': 'au',
  'brisbane': 'au',
  'perth': 'au',

  'new zealand': 'nz',
  'auckland': 'nz',
  'wellington': 'nz',

  'japan': 'jp',
  'tokyo': 'jp',
  'osaka': 'jp',
  'kyoto': 'jp',

  'south korea': 'kr',
  'korea': 'kr',
  'seoul': 'kr',
  'busan': 'kr',

  'singapore': 'sg',

  'hong kong': 'hk',

  'taiwan': 'tw',
  'taipei': 'tw',

  'thailand': 'th',
  'bangkok': 'th',
  'phuket': 'th',

  'india': 'in',
  'mumbai': 'in',
  'delhi': 'in',
  'bangalore': 'in',
  'chennai': 'in',

  // Canada
  'canada': 'ca',
  'toronto': 'ca',
  'vancouver': 'ca',
  'montreal': 'ca',
  'calgary': 'ca',
  'ottawa': 'ca',

  // Latin America
  'mexico': 'mx',
  'mexico city': 'mx',
  'cancun': 'mx',

  'brazil': 'br',
  'sao paulo': 'br',
  'rio de janeiro': 'br',

  'argentina': 'ar',
  'buenos aires': 'ar',

  // Middle East (additional)
  'uae': 'ae',
  'united arab emirates': 'ae',
  'dubai': 'ae',
  'abu dhabi': 'ae',

  'saudi arabia': 'sa',
  'riyadh': 'sa',
  'jeddah': 'sa',

  'turkey': 'tr',
  'istanbul': 'tr',
  'ankara': 'tr',

  'egypt': 'eg',
  'cairo': 'eg',

  // Africa
  'south africa': 'za',
  'johannesburg': 'za',
  'cape town': 'za',

  'nigeria': 'ng',
  'lagos': 'ng',

  'kenya': 'ke',
  'nairobi': 'ke',

  'zimbabwe': 'zw',
  'harare': 'zw',
};

/**
 * Extract country code from a location string
 * Returns undefined if no match is found
 */
export function extractCountryCode(location: string): string | undefined {
  if (!location) return undefined;

  const normalizedLocation = location.toLowerCase().trim();

  // Direct match
  if (LOCATION_TO_COUNTRY_CODE[normalizedLocation]) {
    return LOCATION_TO_COUNTRY_CODE[normalizedLocation];
  }

  // Check if any key is contained in the location
  for (const [key, code] of Object.entries(LOCATION_TO_COUNTRY_CODE)) {
    if (normalizedLocation.includes(key)) {
      return code;
    }
  }

  // Check if location contains a country code directly (e.g., "IL", "US")
  const twoLetterCode = normalizedLocation.match(/\b([a-z]{2})\b/i);
  if (twoLetterCode && twoLetterCode[1]) {
    const code = twoLetterCode[1].toLowerCase();
    // Validate it's actually a country code we know about
    if (Object.values(LOCATION_TO_COUNTRY_CODE).includes(code)) {
      return code;
    }
  }

  return undefined;
}
