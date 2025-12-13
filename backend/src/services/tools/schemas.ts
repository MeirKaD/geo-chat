import { z } from "zod";

export const coordinateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export type GeoCoordinate = z.infer<typeof coordinateSchema>;

export const markerSchema = z.object({
  id: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
  title: z.string(),
  description: z.string().optional(),
  category: z.string().optional(),
  data: z.any().optional(),
  popup: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      footer: z.string().optional(),
      html: z.string().optional(),
    })
    .optional(),
});

export type MapMarker = z.infer<typeof markerSchema>;

export const polygonSchema = z.object({
  id: z.string(),
  type: z.enum(["isochrone", "boundary", "highlight"]),
  coordinates: z.array(
    z.array(
      z.array(z.number())
    )
  ),
});

export type MapPolygon = z.infer<typeof polygonSchema>;
