import { tool } from "@langchain/core/tools";
import { z } from "zod";

import {
  coordinateSchema,
  markerSchema,
  polygonSchema,
  type GeoCoordinate,
  type MapMarker,
  type MapPolygon,
} from "./schemas";

export interface DisplayOnMapPayload {
  action: "display_on_map";
  data: {
    markers?: MapMarker[];
    polygons?: MapPolygon[];
    fitBounds?: boolean;
    center?: GeoCoordinate;
  };
}

export const displayOnMapTool = tool(
  async (input) => {
    const payload: DisplayOnMapPayload = {
      action: "display_on_map",
      data: {
        markers: input.markers,
        polygons: input.polygons,
        fitBounds: input.fitBounds ?? true,
        center: input.center,
      },
    };

    return payload;
  },
  {
    name: "display_on_map",
    description:
      "Render markers or polygons on the interactive map. Always call this once you have geo results.",
    schema: z.object({
      markers: z.array(markerSchema).optional(),
      polygons: z.array(polygonSchema).optional(),
      fitBounds: z.boolean().optional(),
      center: coordinateSchema.optional(),
    }),
  }
);
