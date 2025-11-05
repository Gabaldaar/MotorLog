'use client';

import {createClient} from '@genkit-ai/next/client';
import {estimateFuelStop} from '@/ai/flows/estimate-fuel-stop';

export const ai = {
  estimateFuelStop: estimateFuelStop,
};
