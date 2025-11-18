'use server';
/**
 * @fileoverview Flow to get the current official Dolar exchange rate from a public API.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';

const ExchangeRateApiResponseSchema = z.array(z.object({
  casa: z.object({
    compra: z.string(),
    venta: z.string(),
    nombre: z.string(),
  })
}));

const ExchangeRateOutputSchema = z.object({
  rate: z.number().describe('The selling price of the official Dolar.'),
});


export type ExchangeRateOutput = z.infer<typeof ExchangeRateOutputSchema>;

// This is the function we will call directly from our React component.
export async function getOfficialDolarRate(): Promise<ExchangeRateOutput> {
  try {
    const response = await fetch('https://www.dolarsi.com/api/api.php?type=valoresprincipales');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch exchange rate. Status: ${response.status}`);
    }
    const data = await response.json();

    // Validate the API response with Zod
    const parsedApiData = ExchangeRateApiResponseSchema.parse(data);

    const oficial = parsedApiData.find(d => d.casa.nombre === 'Dolar Oficial');
    
    if (!oficial) {
      throw new Error('No se pudo encontrar la cotización del "Dolar Oficial" en la respuesta de la API.');
    }

    const venta = parseFloat(oficial.casa.venta.replace(',', '.'));

    if (isNaN(venta)) {
      throw new Error('El valor de venta del Dólar Oficial no es un número válido.');
    }

    return {
        rate: venta
    };

  } catch (error) {
    console.error('[getOfficialDolarRate] Error fetching or parsing data:', error);
    if (error instanceof z.ZodError) {
        throw new Error('La respuesta de la API de cotización no tiene el formato esperado.');
    }
    throw new Error('No se pudo obtener la cotización del dólar. Inténtalo de nuevo.');
  }
}
