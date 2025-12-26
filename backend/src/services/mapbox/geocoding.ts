import dotenv from "dotenv";

dotenv.config();

const GOOGLE_GEOCODING_URL =
  "https://maps.googleapis.com/maps/api/geocode/json";

export interface GeocodeResult {
  lat: number;
  lng: number;
  name: string;
  address: string;
  placeType: string[];
  relevance: number;
}

interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GoogleGeometry {
  location: {
    lat: number;
    lng: number;
  };
  location_type: string;
  viewport?: {
    northeast: { lat: number; lng: number };
    southwest: { lat: number; lng: number };
  };
}

interface GoogleGeocodeResult {
  address_components: GoogleAddressComponent[];
  formatted_address: string;
  geometry: GoogleGeometry;
  place_id: string;
  types: string[];
  partial_match?: boolean;
}

interface GoogleGeocodeResponse {
  results: GoogleGeocodeResult[];
  status: string;
  error_message?: string;
}

const geocodeCache = new Map<string, GeocodeResult | null>();

const getApiKey = (): string => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error("GOOGLE_MAPS_API_KEY is required for Google Maps geocoding.");
  }
  return key;
};

const buildUrl = (query: string, apiKey: string): string => {
  const params = new URLSearchParams({
    address: query,
    key: apiKey,
  });
  return `${GOOGLE_GEOCODING_URL}?${params.toString()}`;
};

const mapResultToGeocodeResult = (result: GoogleGeocodeResult): GeocodeResult => {
  const { geometry, formatted_address, types, address_components } = result;

  // Extract name from address components (use the first component as name)
  const name = address_components[0]?.long_name || formatted_address.split(",")[0] || "Unknown";

  // Map Google's location_type to a relevance score
  const relevanceMap: Record<string, number> = {
    ROOFTOP: 1.0,
    RANGE_INTERPOLATED: 0.8,
    GEOMETRIC_CENTER: 0.6,
    APPROXIMATE: 0.4,
  };

  const relevance = relevanceMap[geometry.location_type] || 0.5;

  return {
    lat: geometry.location.lat,
    lng: geometry.location.lng,
    name,
    address: formatted_address,
    placeType: types,
    relevance,
  };
};

export const geocodeAddress = async (
  query: string
): Promise<GeocodeResult | null> => {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const cached = geocodeCache.get(trimmed);
  if (cached !== undefined) {
    return cached;
  }

  const url = buildUrl(trimmed, getApiKey());
  const response = await fetch(url);

  if (!response.ok) {
    console.error(
      `[Google Maps] Geocoding failed (${response.status}): ${response.statusText}`
    );
    geocodeCache.set(trimmed, null);
    return null;
  }

  const json = (await response.json()) as GoogleGeocodeResponse;

  // Handle Google Maps API status codes
  if (json.status !== "OK") {
    if (json.status === "ZERO_RESULTS") {
      console.warn(`[Google Maps] No results found for: ${trimmed}`);
    } else {
      console.error(
        `[Google Maps] API error (${json.status}): ${json.error_message || "Unknown error"}`
      );
    }
    geocodeCache.set(trimmed, null);
    return null;
  }

  const firstResult = json.results[0];
  if (!firstResult) {
    geocodeCache.set(trimmed, null);
    return null;
  }

  const result = mapResultToGeocodeResult(firstResult);
  geocodeCache.set(trimmed, result);
  return result;
};

export const geocodeBatch = async (
  queries: string[]
): Promise<Array<GeocodeResult | null>> => {
  const tasks = queries.map((q) => geocodeAddress(q));
  return Promise.all(tasks);
};
