'use server';
/**
 * @fileoverview Flow to get the current official Dolar exchange rate from a public API.
 */
import { z } from 'zod';

const ExchangeRateOutputSchema = z.object({
  rate: z.number().describe('The selling price of the official Dolar.'),
});


export type ExchangeRateOutput = z.infer<typeof ExchangeRateOutputSchema>;

// This is the function we will call directly from our React component.
export async function getOfficialDolarRate(): Promise<ExchangeRateOutput> {
  console.log('[DIAGNÓSTICO] Iniciando getOfficialDolarRate con dolarapi.com...');
  try {
    console.log('[DIAGNÓSTICO] Realizando fetch a dolarapi.com...');
    const response = await fetch('https://dolarapi.com/v1/dolares/oficial', { 
        cache: 'no-store',
    });
    
    console.log('[DIAGNÓSTICO] Status de la respuesta de la API:', response.status);

    if (!response.ok) {
      const responseText = await response.text();
      console.error(`[DIAGNÓSTICO] La respuesta de la red no fue OK. Status: ${response.status}. Texto:`, responseText);
      throw new Error(`Fallo al obtener la cotización. Status: ${response.status}`);
    }
    
    const responseJson = await response.json();
    console.log('[DIAGNÓSTICO] Respuesta cruda de la API (JSON):', JSON.stringify(responseJson, null, 2));

    const DolarApiResponseSchema = z.object({
        compra: z.number(),
        venta: z.number(),
        casa: z.string(),
        nombre: z.string(),
        moneda: z.string(),
        fechaActualizacion: z.string(),
    });

    // Validate the API response with Zod
    const parsedApiData = DolarApiResponseSchema.parse(responseJson);

    const venta = parsedApiData.venta;

    if (isNaN(venta)) {
      throw new Error('El valor de venta del Dólar Oficial no es un número válido.');
    }

    return {
        rate: venta
    };

  } catch (error: any) {
    console.error('[DIAGNÓSTICO DETALLADO] Error en getOfficialDolarRate. Nombre:', error.name, 'Mensaje:', error.message, 'Stack:', error.stack);
    throw new Error('No se pudo obtener la cotización del dólar. Revisa la consola del servidor para más detalles.');
  }
}
