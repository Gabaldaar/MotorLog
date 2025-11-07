'use client';

import {defineFlow} from '@genkit-ai/next/client';
import {estimateFuelStop} from '@/ai/flows/estimate-fuel-stop';
import {findNearbyGasStations} from '@/ai/flows/find-nearby-gas-stations';

export const ai = {
  estimateFuelStop: defineFlow(estimateFuelStop, {
    pathname: '/api/genkit',
  }),
  findNearbyGasStations: defineFlow(findNearbyGasStations, {
    pathname: '/api/genkit',
  }),
};
