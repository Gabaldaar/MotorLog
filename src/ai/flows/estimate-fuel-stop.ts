'use server';
/**
 * @fileoverview A flow that provides a recommendation on whether to refuel based on vehicle status and trip details.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';

const FuelStopInputSchema = z.object({
  vehicleMake: z.string().describe('The make of the vehicle (e.g., Toyota).'),
  vehicleModel: z.string().describe('The model of the vehicle (e.g., Camry).'),
  vehicleYear: z.number().describe('The manufacturing year of the vehicle.'),
  avgConsumption: z.number().describe('The vehicle\'s average fuel consumption in kilometers per liter (km/L).'),
  fuelCapacity: z.number().describe('The vehicle\'s total fuel tank capacity in liters.'),
  lastOdometer: z.number().describe('The last recorded odometer reading in kilometers.'),
  lastFuelDate: z.string().describe('The date of the last refueling (ISO 8601 format).'),
  lastLiters: z.number().describe('The amount of fuel added during the last refueling in liters.'),
  isLastFillUp: z.boolean().describe('Whether the last refueling was a full tank fill-up.'),
});

const FuelStopOutputSchema = z.object({
  recommendation: z.string().describe('A concise recommendation on whether to refuel or not (e.g., "Refuel Recommended", "Refuel Not Necessary").'),
  justification: z.string().describe('A friendly and brief explanation for the recommendation, written in Spanish for the user.'),
  estimatedRange: z.number().describe('The estimated remaining driving range in kilometers.'),
  estimatedFuelLevel: z.number().describe('The estimated current fuel level in liters.'),
});

export type FuelStopInput = z.infer<typeof FuelStopInputSchema>;
export type FuelStopOutput = z.infer<typeof FuelStopOutputSchema>;


const estimateFuelStopPrompt = ai.definePrompt(
    {
      name: 'estimateFuelStopPrompt',
      input: { schema: FuelStopInputSchema },
      output: { schema: FuelStopOutputSchema },
      prompt: `
        You are a helpful assistant for vehicle management. Your task is to provide a clear and friendly recommendation in SPANISH about whether the user should stop for fuel.

        Analyze the following vehicle and trip data:
        - Vehicle: {{vehicleYear}} {{vehicleMake}} {{vehicleModel}}
        - Average Consumption: {{avgConsumption}} km/L
        - Fuel Tank Capacity: {{fuelCapacity}} L
        - Last Odometer Reading: {{lastOdometer}} km
        - Last Refueling Date: {{lastFuelDate}}
        - Liters Added Last Time: {{lastLiters}} L
        - Was Last Refueling a Full Tank: {{isLastFillUp}}

        Follow these steps to generate your response:
        1.  **Estimate Current Fuel Level**: 
            - If the last refueling was a full tank (isLastFillUp is true), the current fuel level is the fuel tank capacity.
            - If it was a partial fill, this is less reliable, but assume the current fuel level is what was added (lastLiters). This is a rough estimate.
        2.  **Estimate Remaining Range**: Calculate the estimated remaining driving range in kilometers by multiplying the estimated current fuel level by the average consumption (km/L).
        3.  **Formulate Recommendation**:
            - If the estimated range is less than 50 km, set 'recommendation' to "Urgente: ¡Recargar Combustible!".
            - If the estimated range is less than 100 km, set 'recommendation' to "Recarga Recomendada".
            - Otherwise, set 'recommendation' to "Recarga No Necesaria".
        4.  **Write Justification**: Based on your calculations, write a short, friendly, and encouraging justification in SPANISH. Explain the recommendation clearly. Mention the estimated remaining range. For example: "¡Parece que todo está en orden! Con un rango estimado de {{estimatedRange}} km, todavía tienes suficiente combustible para tu próximo viaje." or "Sería buena idea parar a recargar. Te quedan aproximadamente {{estimatedRange}} km de autonomía, ¡mejor prevenir que lamentar!".

        Provide the output in the specified JSON format.
      `,
    }
  );

const estimateFuelStopFlow = ai.defineFlow(
  {
    name: 'estimateFuelStopFlow',
    inputSchema: FuelStopInputSchema,
    outputSchema: FuelStopOutputSchema,
  },
  async (input) => {
    
    // A simple calculation to provide a baseline for the LLM
    const estimatedFuelLevel = input.isLastFillUp ? input.fuelCapacity : input.lastLiters;
    const estimatedRange = estimatedFuelLevel * input.avgConsumption;

    const { output } = await estimateFuelStopPrompt.generate({
        data: input
    });
    
    if (!output) {
        throw new Error("Could not get a response from the model.");
    }
    
    // Override with our more precise calculation
    output.estimatedFuelLevel = parseFloat(estimatedFuelLevel.toFixed(2));
    output.estimatedRange = parseFloat(estimatedRange.toFixed(2));

    return output;
  }
);

export async function estimateFuelStop(input: FuelStopInput): Promise<FuelStopOutput> {
    return estimateFuelStopFlow(input);
}
