import createApp from '@genkit-ai/next';
import { GenkitError } from '@genkit-ai/core';
import {notFound} from 'next/navigation';
import '@/ai/flows/find-nearby-gas-stations';
import {ai} from '@/ai/genkit';

export const {GET, POST} = createApp({
  ai,
  pathname: '/api/genkit',
  errorHandler: async err => {
    if (err instanceof GenkitError && err.httpErrorCode === 404) {
      notFound();
    }
  },
});
