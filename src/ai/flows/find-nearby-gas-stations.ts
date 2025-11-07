
'use server';
/**
 * @fileOverview A flow to find nearby gas stations using the user's location.
 *
 * - findNearbyGasStations - A function that finds gas stations.
 * - GasStationResult - The output type for the findNearbyGasStations function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const FindNearbyGasStationsInputSchema = z.object({
  latitude: z.number().describe("The user's current latitude."),
  longitude: z.number().describe("The user's current longitude."),
});
export type FindNearbyGasStationsInput = z.infer<typeof FindNearbyGasStationsInputSchema>;

const GasStationResultSchema = z.object({
  stations: z.array(
    z.object({
      name: z.string().describe('The name of the gas station.'),
      address: z.string().describe('The address of the gas station.'),
      distance: z.string().describe('The distance from the user in kilometers.'),
    })
  ).describe('A list of nearby gas stations.'),
});
export type GasStationResult = z.infer<typeof GasStationResultSchema>;


export async function findNearbyGasStations(input: FindNearbyGasStationsInput): Promise<GasStationResult> {
  return findNearbyGasStationsFlow(input);
}


// This tool now calls the Google Places API to get real data.
const getNearbyGasStationsTool = ai.defineTool(
  {
    name: 'getNearbyGasStations',
    description: "Get a list of gas stations near the user's current location.",
    inputSchema: FindNearbyGasStationsInputSchema,
    outputSchema: GasStationResultSchema,
  },
  async ({ latitude, longitude }) => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error('CRITICAL: Google Maps API key is not configured.');
      throw new Error('Google Maps API key is not configured. Please set GOOGLE_MAPS_API_KEY in your .env.local file.');
    }

    const radius = 5000; // 5km radius
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=${radius}&type=gas_station&key=${apiKey}`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        console.error('Google Places API Error (Not OK):', data);
        // This makes the error more specific, pulling from Google's response if available.
        throw new Error(`Failed to fetch gas stations. Status: ${response.status}. Message: ${data.error_message || 'No specific error message provided by API.'}`);
      }
      
      // Handle API-level errors that still return a 200 OK status
      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        console.error('Google Places API Status Error:', data);
        throw new Error(`Google Places API error: ${data.error_message || data.status}`);
      }
      
      const stations = (data.results || []).map((place: any) => {
         // This is a simplified distance calculation (Haversine formula would be more accurate)
         // For short distances, this approximation is generally acceptable.
        const R = 6371; // Radius of the Earth in km
        const dLat = (place.geometry.location.lat - latitude) * (Math.PI / 180);
        const dLon = (place.geometry.location.lng - longitude) * (Math.PI / 180);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(latitude * (Math.PI / 180)) * Math.cos(place.geometry.location.lat * (Math.PI / 180)) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distanceKm = R * c;

        return {
          name: place.name,
          address: place.vicinity,
          distance: `${distanceKm.toFixed(1)} km`,
        };
      }).sort((a: { distance: string }, b: { distance: string }) => parseFloat(a.distance) - parseFloat(b.distance));


      return { stations };

    } catch (error) {
      // Re-throw the original error to be caught by the parent flow, ensuring it's a clear Error object.
      if (error instanceof Error) {
          throw error;
      }
      // Fallback for unexpected error types
      throw new Error('An unexpected error occurred while retrieving gas stations from Google Places API.');
    }
  }
);


const findNearbyGasStationsFlow = ai.defineFlow(
  {
    name: 'findNearbyGasStationsFlow',
    inputSchema: FindNearbyGasStationsInputSchema,
    outputSchema: GasStationResultSchema,
  },
  async (input) => {
    // Directly call the tool that now fetches real data.
    const result = await getNearbyGasStationsTool(input);
    return result;
  }
);
