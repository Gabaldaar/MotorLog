'use server';
/**
 * @fileoverview Flow to find nearby gas stations using the Google Maps Places API.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { geocode, place, type Place } from '@googlemaps/google-maps-services-js';

const GasStationInputSchema = z.object({
  latitude: z.number().describe('The latitude of the user\'s current location.'),
  longitude: z.number().describe('The longitude of the user\'s current location.'),
  radius: z.number().min(1000).max(50000).default(5000).describe('The search radius in meters.'),
});

const GasStationOutputSchema = z.object({
  name: z.string().describe('The name of the gas station.'),
  address: z.string().describe('The address of the gas station.'),
  distance: z.string().describe('The distance from the user\'s location.'),
  mapsUrl: z.string().url().describe('A URL to view the gas station on Google Maps.'),
});

export type GasStationInput = z.infer<typeof GasStationInputSchema>;
export type GasStationOutput = z.infer<typeof GasStationOutputSchema>;

// This is the function we will call directly from our React component.
export async function findNearbyGasStations(input: GasStationInput): Promise<GasStationOutput[]> {
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    throw new Error("Google Maps API key is not configured. Please set the GOOGLE_MAPS_API_KEY environment variable.");
  }
  
  const response = await place({
    params: {
      location: { lat: input.latitude, lng: input.longitude },
      radius: input.radius,
      type: 'gas_station',
      key: process.env.GOOGLE_MAPS_API_KEY!,
    },
  });

  if (response.data.status !== 'OK') {
    console.error('Places API error:', response.data.error_message);
    throw new Error(`Failed to fetch gas stations: ${response.data.status}`);
  }

  const stations: GasStationOutput[] = (response.data.results as Place[])
    .map(place => {
      const location = place.geometry?.location;
      if (!location) return null;

      // Calculate distance (this is a simplified haversine distance calculation)
      const toRad = (x: number) => x * Math.PI / 180;
      const R = 6371; // Earth radius in km
      const dLat = toRad(location.lat - input.latitude);
      const dLon = toRad(location.lng - input.longitude);
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(toRad(input.latitude)) * Math.cos(toRad(location.lat)) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distanceInKm = R * c;

      return {
        name: place.name || 'N/A',
        address: place.vicinity || 'Dirección no disponible',
        distance: `${distanceInKm.toFixed(1)} km`,
        mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name || '')}&query_place_id=${place.place_id}`,
      };
    })
    .filter((s): s is GasStationOutput => s !== null);

  return stations.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
}

// We keep the Genkit flow definition for potential future use with other tools or logging,
// but we are not calling it from the client directly anymore.
const findNearbyGasStationsFlow = ai.defineFlow(
  {
    name: 'findNearbyGasStationsFlow',
    inputSchema: GasStationInputSchema,
    outputSchema: z.array(GasStationOutputSchema),
  },
  findNearbyGasStations
);
