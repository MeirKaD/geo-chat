import { tool } from "@langchain/core/tools";
import { z } from "zod";

import {
  geocodeAddress as mapboxGeocode,
  type GeocodeResult as MapboxGeocodeResult,
} from "../mapbox/geocoding.js";
import { getIsochrone as mapboxIsochrone } from "../mapbox/isochrone.js";
import {
  coordinateSchema,
  type GeoCoordinate,
  type MapPolygon,
} from "./schemas.js";

type TravelMode = "walking" | "driving" | "cycling";

const geocodeSchema = z.object({
  address: z.string().min(3, "Address must be at least 3 characters long"),
});

const isochroneSchema = z.object({
  center: coordinateSchema,
  minutes: z.number().min(1),
  mode: z.enum(["walking", "driving", "cycling"]),
});

const buildFallbackIsochrone = (
  center: GeoCoordinate,
  minutes: number,
  mode: TravelMode
): MapPolygon => {
  // Very rough square fallback; used only if Mapbox fails.
  const delta =
    (mode === "walking" ? 5 : mode === "cycling" ? 15 : 40) /
    60 /
    111 *
    minutes;
  const { lat, lng } = center;

  const ring: Array<[number, number]> = [
    [lng - delta, lat - delta],
    [lng + delta, lat - delta],
    [lng + delta, lat + delta],
    [lng - delta, lat + delta],
    [lng - delta, lat - delta],
  ];

  return {
    id: `isochrone-${mode}-${minutes}m-fallback`,
    type: "isochrone",
    coordinates: [ring],
  };
};

export const geocodeTool = tool(
  async ({ address }) => {
    const result = await mapboxGeocode(address);
    if (!result) {
      throw new Error("No geocoding result found for the given address.");
    }
    return result satisfies MapboxGeocodeResult;
  },
  {
    name: "geocode_address",
    description: "Geocode an address/place using Mapbox Geocoding API.",
    schema: geocodeSchema,
  }
);

export const isochroneTool = tool(
  async ({ center, minutes, mode }) => {
    const polygon = await mapboxIsochrone(center, minutes, mode);
    if (polygon) return polygon;
    return buildFallbackIsochrone(center, minutes, mode);
  },
  {
    name: "get_isochrone",
    description:
      "Generate an approximate isochrone polygon for the given center, duration, and mode.",
    schema: isochroneSchema,
  }
);
