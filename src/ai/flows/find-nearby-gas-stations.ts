
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
  latitude: z.number().describe('The user\'s current latitude.'),
  longitude: z.number().describe('The user\'s current longitude.'),
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


// This is a mock tool. In a real application, this would call an external API
// like Google Maps Places API to get real data. We are mocking it here because
// we don't have an API key configured.
// It doesn't need an input schema because the LLM should decide to call it based on the prompt.
const getNearbyGasStationsTool = ai.defineTool(
  {
    name: 'getNearbyGasStations',
    description: 'Get a list of gas stations near the user\'s current location.',
    outputSchema: GasStationResultSchema,
  },
  async () => {
    // Mock data - in a real scenario, this would be an API call.
    console.log(`Simulating API call for gas stations`);
    return {
        stations: [
            { name: 'Shell Av. Libertador', address: 'Av. del Libertador 1234, CABA', distance: '1.2 km' },
            { name: 'YPF Figueroa Alcorta', address: 'Av. Pres. Figueroa Alcorta 5678, CABA', distance: '2.5 km' },
            { name: 'Axion Energy', address: 'Coronel Díaz 2300, CABA', distance: '3.1 km' },
            { name: 'Puma Energy Palermo', address: 'Juan B. Justo 1500, CABA', distance: '4.0 km' },
            { name: 'Gulf Combustibles', address: 'Av. Santa Fe 3456, CABA', distance: '4.8 km' },
        ],
    };
  }
);


const findNearbyGasStationsFlow = ai.defineFlow(
  {
    name: 'findNearbyGasStationsFlow',
    inputSchema: FindNearbyGasStationsInputSchema,
    outputSchema: GasStationResultSchema,
  },
  async (input) => {
    const llmResponse = await ai.generate({
      // The prompt is a natural language question. The model will infer it needs to use the tool.
      prompt: `Are there any gas stations near me? My current location is latitude ${input.latitude} and longitude ${input.longitude}.`,
      tools: [getNearbyGasStationsTool],
      model: 'googleai/gemini-2.5-flash',
    });

    const toolRequest = llmResponse.toolRequest;

    if (toolRequest) {
      const toolResponse = await toolRequest.run();
      if (toolResponse?.output) {
          return toolResponse.output as GasStationResult;
      }
    }
    
    // Fallback in case the tool doesn't work or the model doesn't use it.
    return { stations: [] };
  }
);

