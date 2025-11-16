'use server';
/**
 * @fileoverview Flow to get the current Dolar Blue exchange rate from a public API.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';

const ExchangeRateOutputSchema = z.object({
  compra: z.number().describe('The buying price of the Dolar Blue.'),
  venta: z.number().describe('The selling price of the Dolar Blue.'),
  fecha: z.string().describe('The date of the exchange rate.'),
});

export type ExchangeRateOutput = z.infer<typeof ExchangeRateOutputSchema>;

// This is the function we will call directly from our React component.
export async function getDolarBlueRate(): Promise<ExchangeRateOutput> {
  try {
    const response = await fetch('https://dolarapi.com/v1/dolares/blue', {
      cache: 'no-store', // We always want the latest value
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch exchange rate. Status: ${response.status}`);
    }
    const data = await response.json();

    // Validate the response with Zod
    const parsedData = ExchangeRateOutputSchema.parse({
        compra: data.compra,
        venta: data.venta,
        fecha: data.fechaActualizacion,
    });

    return parsedData;

  } catch (error) {
    console.error('[getDolarBlueRate] Error fetching or parsing data:', error);
    if (error instanceof z.ZodError) {
        throw new Error('La respuesta de la API de cotización no tiene el formato esperado.');
    }
    throw new Error('No se pudo obtener la cotización del dólar. Inténtalo de nuevo.');
  }
}
