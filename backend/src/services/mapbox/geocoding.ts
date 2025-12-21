import dotenv from "dotenv";

dotenv.config();

const MAPBOX_BASE_URL =
  "https://api.mapbox.com/geocoding/v5/mapbox.places";

export interface GeocodeResult {
  lat: number;
  lng: number;
  name: string;
  address: string;
  placeType: string[];
  relevance: number;
}

interface MapboxFeature {
  place_name?: string;
  text?: string;
  place_type?: string[];
  relevance?: number;
  center?: [number, number];
}

interface MapboxGeocodeResponse {
  features?: MapboxFeature[];
}

const geocodeCache = new Map<string, GeocodeResult | null>();

const getApiKey = (): string => {
  const key = process.env.GEO_MAPBOX_API_KEY;
  if (!key) {
    throw new Error("GEO_MAPBOX_API_KEY is required for Mapbox geocoding.");
  }
  return key;
};

const buildUrl = (query: string, token: string): string => {
  const encoded = encodeURIComponent(query);
  const params = new URLSearchParams({
    access_token: token,
    limit: "1",
    autocomplete: "false",
    types: "address,poi,place,locality,neighborhood,region",
  });
  return `${MAPBOX_BASE_URL}/${encoded}.json?${params.toString()}`;
};

const mapFeatureToResult = (feature: MapboxFeature): GeocodeResult | null => {
  if (!feature.center || feature.center.length < 2) {
    return null;
  }

  const [lng, lat] = feature.center;
  return {
    lat,
    lng,
    name: feature.text ?? feature.place_name ?? "Unknown",
    address: feature.place_name ?? feature.text ?? "",
    placeType: feature.place_type ?? [],
    relevance: feature.relevance ?? 0,
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
      `[Mapbox] Geocoding failed (${response.status}): ${response.statusText}`
    );
    geocodeCache.set(trimmed, null);
    return null;
  }

  const json = (await response.json()) as MapboxGeocodeResponse;
  const feature = json.features?.[0];

  if (!feature) {
    geocodeCache.set(trimmed, null);
    return null;
  }

  const result = mapFeatureToResult(feature);
  geocodeCache.set(trimmed, result);
  return result;
};

export const geocodeBatch = async (
  queries: string[]
): Promise<Array<GeocodeResult | null>> => {
  const tasks = queries.map((q) => geocodeAddress(q));
  return Promise.all(tasks);
};