/**
 * Node 5: Geocoding & Streaming
 *
 * This node geocodes extracted places and converts them to map markers.
 * It handles places that already have coordinates and geocodes those that don't.
 *
 * Key features:
 * - Uses Mapbox Geocoding API for addresses without coordinates
 * - Parallel geocoding for performance (geocodeBatch)
 * - Generates unique IDs for markers
 * - Creates rich popup content with place details
 * - Gracefully handles geocoding failures
 */

import { geocodeBatch } from '../../mapbox/geocoding.js';
import { PipelineState, PipelineStateUpdate, createProgressUpdate } from '../pipelineState.js';
import { MapMarker } from '../../tools/schemas.js';
import { PlaceData } from '../../../types/pipeline.js';

/**
 * Generate a unique ID for a marker
 */
function generateMarkerId(place: PlaceData, index: number): string {
  // Use URL or name as base, fallback to index
  const base = place.url || place.name || `place-${index}`;
  // Create a simple hash from the base string
  const hash = base
    .split('')
    .reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0)
    .toString(36);
  return `marker-${hash}-${index}`;
}

/**
 * Format price level for display
 */
function formatPriceLevel(place: PlaceData): string | undefined {
  if (place.price) {
    return `$${place.price}`;
  }
  return place.priceLevel;
}

/**
 * Create popup content for a marker
 */
function createPopupContent(place: PlaceData): MapMarker['popup'] {
  const title = place.name;
  const descriptionParts: string[] = [];

  // Add rating
  if (place.rating) {
    const stars = '⭐'.repeat(Math.round(place.rating));
    const reviewText = place.reviewCount ? ` (${place.reviewCount} reviews)` : '';
    descriptionParts.push(`${stars} ${place.rating}/5${reviewText}`);
  }

  // Add price
  const price = formatPriceLevel(place);
  if (price) {
    descriptionParts.push(`Price: ${price}`);
  }

  // Add description
  if (place.description) {
    descriptionParts.push(place.description);
  }

  // Add amenities
  if (place.amenities && place.amenities.length > 0) {
    const amenitiesText = place.amenities.slice(0, 5).join(', ');
    descriptionParts.push(`Amenities: ${amenitiesText}`);
  }

  const description = descriptionParts.join('\n');

  // Footer with address and link
  const footerParts: string[] = [];
  footerParts.push(place.address);
  if (place.phone) {
    footerParts.push(`📞 ${place.phone}`);
  }

  const footer = footerParts.join(' • ');

  return {
    title,
    description,
    footer,
  };
}

/**
 * Convert a PlaceData with coordinates to a MapMarker
 */
function placeToMarker(place: PlaceData, index: number): MapMarker | null {
  if (!place.coordinates) {
    return null;
  }

  const id = generateMarkerId(place, index);
  const popup = createPopupContent(place);

  return {
    id,
    lat: place.coordinates.lat,
    lng: place.coordinates.lng,
    title: place.name,
    description: place.description,
    popup,
    data: {
      address: place.address,
      url: place.url,
      rating: place.rating,
      priceLevel: place.priceLevel,
      price: place.price,
      phone: place.phone,
      website: place.website,
      hours: place.hours,
      amenities: place.amenities,
      photos: place.photos,
      metadata: place.metadata,
    },
  };
}

/**
 * Geocode places and convert to markers
 *
 * @param places - Places to geocode
 * @param minRelevance - Minimum relevance score (0-1) to accept geocoding results
 */
async function geocodePlaces(places: PlaceData[], minRelevance: number = 0.3): Promise<MapMarker[]> {
  const markers: MapMarker[] = [];

  // Separate places with and without coordinates
  const placesWithCoords: Array<{ place: PlaceData; index: number }> = [];
  const placesNeedingGeocode: Array<{ place: PlaceData; index: number }> = [];

  places.forEach((place, index) => {
    if (place.coordinates) {
      placesWithCoords.push({ place, index });
    } else {
      placesNeedingGeocode.push({ place, index });
    }
  });

  // Convert places with coordinates directly to markers
  for (const { place, index } of placesWithCoords) {
    const marker = placeToMarker(place, index);
    if (marker) {
      markers.push(marker);
    }
  }

  console.log(`[Node 5: Geocode] ${placesWithCoords.length} places already have coordinates`);
  console.log(`[Node 5: Geocode] ${placesNeedingGeocode.length} places need geocoding`);

  // Geocode places without coordinates
  if (placesNeedingGeocode.length > 0) {
    // Filter out vague addresses (no street number) to avoid noisy geocodes
    const preciseCandidates = placesNeedingGeocode.filter(({ place }) => /\d/.test(place.address ?? ''));
    const vagueCount = placesNeedingGeocode.length - preciseCandidates.length;

    if (vagueCount > 0) {
      console.warn(`[Node 5: Geocode] Skipping ${vagueCount} places with vague addresses (no street number)`);
    }

    if (preciseCandidates.length === 0) {
      console.warn('[Node 5: Geocode] No precise addresses to geocode after filtering');
      return markers;
    }

    // Combine place name with address for better geocoding accuracy
    // E.g., "Ashkelon Marina, Ashkelon, Israel" is more specific than just "Ashkelon, Israel"
    const addresses = preciseCandidates.map(({ place }) => {
      return `${place.name}, ${place.address}`;
    });

    console.log('[Node 5: Geocode] Geocoding addresses...');
    const geocodeResults = await geocodeBatch(addresses);

    console.log('[Node 5: Geocode] Geocoding complete');

    // Convert geocoded results to markers (with validation)
    let lowRelevanceCount = 0;
    for (let i = 0; i < preciseCandidates.length; i++) {
      const item = preciseCandidates[i];
      if (!item) {
        continue;
      }

      const { place, index } = item;
      const geocodeResult = geocodeResults[i];

      if (!geocodeResult) {
        console.warn(`[Node 5: Geocode] Failed to geocode: ${place.address}`);
        continue;
      }

      // Validate relevance score
      if (geocodeResult.relevance < minRelevance) {
        console.warn(
          `[Node 5: Geocode] Low relevance (${geocodeResult.relevance.toFixed(2)}) for: ${place.address} -> ${geocodeResult.address}`
        );
        lowRelevanceCount++;
        continue;
      }

      // Add coordinates to the place
      const placeWithCoords: PlaceData = {
        ...place,
        coordinates: {
          lat: geocodeResult.lat,
          lng: geocodeResult.lng,
        },
      };

      const marker = placeToMarker(placeWithCoords, index);
      if (marker) {
        markers.push(marker);
      }
    }

    if (lowRelevanceCount > 0) {
      console.warn(`[Node 5: Geocode] Filtered out ${lowRelevanceCount} places due to low geocoding confidence`);
    }
  }

  return markers;
}

/**
 * Node function: Geocode and Stream Markers
 */
export async function geocodeStream(state: PipelineState): Promise<PipelineStateUpdate> {
  console.log('[Node 5: Geocode Stream] Starting...');
  console.log('Places to geocode:', state.extractedPlaces.length);

  try {
    // Check if we have extracted places
    if (!state.extractedPlaces || state.extractedPlaces.length === 0) {
      console.warn('[Node 5: Geocode Stream] No places to geocode');

      return {
        ...createProgressUpdate('geocoding', 80),
        markers: [],
      };
    }

    // Use a higher relevance threshold for more accurate geocoding
    // 0.85 ensures we only accept high-confidence matches
    const markers = await geocodePlaces(state.extractedPlaces, 0.35);

    console.log(`[Node 5: Geocode Stream] Created ${markers.length} markers`);

    // Log sample marker for debugging
    if (markers.length > 0) {
      console.log('[Node 5: Geocode Stream] Sample marker:', JSON.stringify(markers[0], null, 2));
    }

    return {
      ...createProgressUpdate('geocoding', 80),
      markers,
    };
  } catch (error) {
    console.error('[Node 5: Geocode Stream] Error:', error);

    // On error, return empty results
    return {
      ...createProgressUpdate('geocoding', 80),
      markers: [],
      errors: [
        {
          node: 'geocode_stream',
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date(),
        },
      ],
    };
  }
}
