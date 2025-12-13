import dotenv from "dotenv";

import type { GeoCoordinate, MapPolygon } from "../tools";

dotenv.config();

const MAPBOX_ISOCHRONE_URL = "https://api.mapbox.com/isochrone/v1/mapbox";

type TravelMode = "walking" | "driving" | "cycling";

interface IsochroneFeature {
  geometry?: {
    coordinates?: Array<Array<[number, number]>>;
  };
  properties?: Record<string, unknown>;
}

interface IsochroneResponse {
  features?: IsochroneFeature[];
}

const cache = new Map<string, MapPolygon | null>();

const getApiKey = (): string => {
  const key = process.env.GEO_MAPBOX_API_KEY;
  if (!key) {
    throw new Error("GEO_MAPBOX_API_KEY is required for Mapbox isochrone.");
  }
  return key;
};

const modeToProfile: Record<TravelMode, string> = {
  walking: "walking",
  driving: "driving",
  cycling: "cycling",
};

const buildCacheKey = (center: GeoCoordinate, minutes: number, mode: TravelMode) =>
  `${center.lat.toFixed(5)},${center.lng.toFixed(5)}:${minutes}:${mode}`;

const buildUrl = (center: GeoCoordinate, minutes: number, mode: TravelMode, token: string): string => {
  const profile = modeToProfile[mode] ?? "walking";
  const lngLat = `${center.lng},${center.lat}`;
  const params = new URLSearchParams({
    contours_minutes: minutes.toString(),
    polygons: "true",
    access_token: token,
  });
  return `${MAPBOX_ISOCHRONE_URL}/${profile}/${lngLat}?${params.toString()}`;
};

const mapFeatureToPolygon = (
  feature: IsochroneFeature,
  mode: TravelMode,
  minutes: number
): MapPolygon | null => {
  const rings = feature.geometry?.coordinates;
  if (!rings || !Array.isArray(rings) || !rings.length) {
    return null;
  }

  // Mapbox returns [lng, lat]; our MapPolygon expects [lng, lat]
  return {
    id: `isochrone-${mode}-${minutes}m`,
    type: "isochrone",
    coordinates: rings,
  };
};

export const getIsochrone = async (
  center: GeoCoordinate,
  minutes: number,
  mode: TravelMode
): Promise<MapPolygon | null> => {
  const key = buildCacheKey(center, minutes, mode);
  if (cache.has(key)) {
    return cache.get(key) ?? null;
  }

  const token = getApiKey();
  const url = buildUrl(center, minutes, mode, token);
  const response = await fetch(url);

  if (!response.ok) {
    console.error(
      `[Mapbox] Isochrone failed (${response.status}): ${response.statusText}`
    );
    cache.set(key, null);
    return null;
  }

  const json = (await response.json()) as IsochroneResponse;
  const feature = json.features?.[0];
  if (!feature) {
    cache.set(key, null);
    return null;
  }

  const polygon = mapFeatureToPolygon(feature, mode, minutes);
  cache.set(key, polygon);
  return polygon;
};
