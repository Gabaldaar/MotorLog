'use server';
/**
 * @fileoverview Flow to get the current official Dolar exchange rate from a public API.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';

const ExchangeRateApiResponseSchema = z.object({
  compra: z.number().describe('The buying price of the official Dolar.'),
  venta: z.number().describe('The selling price of the official Dolar.'),
  fechaActualizacion: z.string().describe('The date of the exchange rate.'),
});

const ExchangeRateOutputSchema = z.object({
  rate: z.number().describe('The selling price of the official Dolar.'),
  fecha: z.string().describe('The date of the exchange rate.'),
});


export type ExchangeRateOutput = z.infer<typeof ExchangeRateOutputSchema>;

// This is the function we will call directly from our React component.
export async function getOfficialDolarRate(): Promise<ExchangeRateOutput> {
  try {
    const response = await fetch('https://dolarapi.com/v1/dolares/oficial');

    if (!response.ok) {
      throw new Error(`Failed to fetch exchange rate. Status: ${response.status}`);
    }
    const data = await response.json();

    // Validate the API response with Zod
    const parsedApiData = ExchangeRateApiResponseSchema.parse(data);

    const { venta, fechaActualizacion } = parsedApiData;

    return {
        rate: venta,
        fecha: fechaActualizacion,
    };

  } catch (error) {
    console.error('[getOfficialDolarRate] Error fetching or parsing data:', error);
    if (error instanceof z.ZodError) {
        throw new Error('La respuesta de la API de cotización no tiene el formato esperado.');
    }
    throw new Error('No se pudo obtener la cotización del dólar. Inténtalo de nuevo.');
  }
}
