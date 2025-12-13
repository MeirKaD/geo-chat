import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import Supercluster, {
  type PointFeature,
  type AnyProps,
} from "supercluster";

import type { MapMarker, MapPolygon, GeoCoordinate } from "./schemas";
import { isToolMessage, type BaseMessage } from "@langchain/core/messages";

export interface BBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const addPositionToBounds = (pos: Position, bounds: BBox): BBox => {
  const [lngRaw, latRaw] = pos;
  if (!isFiniteNumber(latRaw) || !isFiniteNumber(lngRaw)) {
    return bounds;
  }
  const lat = latRaw;
  const lng = lngRaw;

  return {
    minLat: Math.min(bounds.minLat, lat),
    minLng: Math.min(bounds.minLng, lng),
    maxLat: Math.max(bounds.maxLat, lat),
    maxLng: Math.max(bounds.maxLng, lng),
  };
};

const initialBounds = (): BBox => ({
  minLat: Number.POSITIVE_INFINITY,
  minLng: Number.POSITIVE_INFINITY,
  maxLat: Number.NEGATIVE_INFINITY,
  maxLng: Number.NEGATIVE_INFINITY,
});

const boundsIsValid = (bounds: BBox): boolean =>
  [bounds.minLat, bounds.minLng, bounds.maxLat, bounds.maxLng].every(
    isFiniteNumber
  );

const polygonPositions = (polygon: MapPolygon): Position[] =>
  polygon.coordinates.flatMap((ring) => ring);

export const computeBounds = (
  markers: MapMarker[],
  polygons: MapPolygon[] = []
): BBox | null => {
  let bounds = initialBounds();
  let count = 0;

  for (const marker of markers) {
    bounds = addPositionToBounds([marker.lng, marker.lat], bounds);
    count += 1;
  }

  for (const polygon of polygons) {
    const positions = polygonPositions(polygon);
    for (const pos of positions) {
      if (!Array.isArray(pos) || pos.length < 2) continue;
      bounds = addPositionToBounds(pos as Position, bounds);
      count += 1;
    }
  }

  if (count === 0 || !boundsIsValid(bounds)) {
    return null;
  }

  return bounds;
};

export interface MapResponse {
  markers: MapMarker[];
  polygons?: MapPolygon[];
  center?: GeoCoordinate;
  fitBounds?: boolean;
  bounds?: BBox | null;
  asGeoJSON?: FeatureCollection;
}

const renderPopupHtml = (marker: MapMarker): string | undefined => {
  if (marker.popup?.html) return marker.popup.html;

  const title = marker.popup?.title ?? marker.title;
  const description =
    marker.popup?.description ?? marker.description ?? undefined;
  const footer = marker.popup?.footer;

  const parts: string[] = [];
  if (title) parts.push(`<strong>${title}</strong>`);
  if (description) parts.push(`<div>${description}</div>`);
  if (footer) parts.push(`<small>${footer}</small>`);

  if (parts.length === 0) return undefined;
  return parts.join("");
};

const markerToFeature = (marker: MapMarker): Feature<Geometry> => ({
  type: "Feature",
  geometry: {
    type: "Point",
    coordinates: [marker.lng, marker.lat],
  },
  properties: {
    id: marker.id,
    title: marker.title,
    description: marker.description,
    category: marker.category,
    data: marker.data,
    popupHtml: renderPopupHtml(marker),
  },
});

const polygonToFeature = (polygon: MapPolygon): Feature<Geometry> => ({
  type: "Feature",
  geometry: {
    type: "Polygon",
    coordinates: polygon.coordinates,
  },
  properties: {
    id: polygon.id,
    type: polygon.type,
  },
});

export const toGeoJSON = (
  markers: MapMarker[],
  polygons: MapPolygon[] = []
): FeatureCollection => {
  const markerFeatures = markers.map(markerToFeature);
  const polygonFeatures = polygons.map(polygonToFeature);
  return {
    type: "FeatureCollection",
    features: [...markerFeatures, ...polygonFeatures],
  };
};

export const buildMapResponse = (input: {
  markers: MapMarker[];
  polygons?: MapPolygon[];
  center?: GeoCoordinate;
  fitBounds?: boolean;
  includeGeoJSON?: boolean;
}): MapResponse => {
  const { markers, polygons = [], center, fitBounds = true, includeGeoJSON } =
    input;

  const bounds = computeBounds(markers, polygons);

  return {
    markers,
    polygons,
    center,
    fitBounds,
    bounds,
    asGeoJSON: includeGeoJSON ? toGeoJSON(markers, polygons) : undefined,
  };
};

interface ClusterOptions {
  zoom?: number;
  minZoom?: number;
  maxZoom?: number;
  radius?: number;
}

export const clusterMarkers = (
  markers: MapMarker[],
  options: ClusterOptions = {}
): MapMarker[] => {
  if (markers.length === 0) return [];

  const points: PointFeature<AnyProps>[] = markers.map((marker) => ({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [marker.lng, marker.lat],
    },
    properties: {
      id: marker.id ?? "",
      title: marker.title,
      description: marker.description,
      category: marker.category,
      data: marker.data,
      popupHtml: renderPopupHtml(marker),
    },
  }));

  const index = new Supercluster<AnyProps, AnyProps>({
    minZoom: options.minZoom ?? 0,
    maxZoom: options.maxZoom ?? 16,
    radius: options.radius ?? 40,
  }).load(points);

  const zoom = options.zoom ?? 12;
  const clusters = index.getClusters([-180, -85, 180, 85], zoom);

  return clusters.map((feature): MapMarker => {
    const [lng, lat] = feature.geometry.coordinates as [number, number];
    const props = (feature.properties || {}) as AnyProps;
    const isCluster = Boolean((props as any).cluster);
    const pointCount = (props as any).point_count as number | undefined;

    if (isCluster && typeof pointCount === "number") {
      const clusterId = (props as any).cluster_id;
      return {
        id: `cluster-${clusterId ?? `${lat},${lng}`}`,
        lat,
        lng,
        title: `${pointCount} places`,
        category: "cluster",
        data: {
          pointCount,
          expansionZoom: index.getClusterExpansionZoom(clusterId),
        },
        popup: {
          title: `${pointCount} places`,
          description: "Zoom in to see individual locations.",
        },
      };
    }

    return {
      id: (props as any).id || `${lat},${lng}`,
      lat,
      lng,
      title: (props as any).title || "Location",
      description: (props as any).description,
      category: (props as any).category,
      data: (props as any).data,
      popup: (props as any).popupHtml
        ? { html: (props as any).popupHtml as string }
        : undefined,
    };
  });
};

const parseDisplayOnMapPayload = (
  content: unknown
):
  | {
      markers?: MapMarker[];
      polygons?: MapPolygon[];
      fitBounds?: boolean;
      center?: GeoCoordinate;
    }
  | null => {
  if (!content) return null;

  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content);
      return (parsed as any).data ?? (parsed as any);
    } catch {
      return null;
    }
  }

  if (Array.isArray(content)) {
    for (const part of content) {
      const parsed = parseDisplayOnMapPayload(part);
      if (parsed) return parsed;
    }
  }

  if (typeof content === "object") {
    const maybe = content as Record<string, unknown>;
    if ("data" in maybe) return maybe.data as any;
    return maybe as any;
  }

  return null;
};

export const extractMapPayload = (
  message: BaseMessage
): MapResponse | null => {
  if (!isToolMessage(message)) return null;
  if ((message as any).name !== "display_on_map") return null;

  const payload = parseDisplayOnMapPayload((message as any).content);
  if (!payload) return null;

  const markers = Array.isArray(payload.markers) ? payload.markers : [];
  const polygons = Array.isArray(payload.polygons) ? payload.polygons : [];

  const bounds = computeBounds(markers, polygons);

  return {
    markers,
    polygons,
    center: payload.center,
    fitBounds: payload.fitBounds ?? true,
    bounds,
    asGeoJSON: undefined,
  };
};

export const extractMapPayloadFromMessages = (
  messages: BaseMessage[]
): MapResponse | null => {
  for (const msg of messages) {
    const payload = extractMapPayload(msg);
    if (payload) return payload;
  }
  return null;
};
