
import type { Handler } from '@netlify/functions';
import fetch from 'node-fetch';

// This function is scheduled to run daily by an external cron service.
// Its sole purpose is to trigger our Next.js API route that handles the actual logic.
export const handler: Handler = async () => {
  console.log('[Netlify Function] - checkReminders: Cron job triggered.');

  const siteUrl = process.env.URL;
  if (!siteUrl) {
    console.error('[Netlify Function] - checkReminders: Site URL is not configured.');
    return {
      statusCode: 500,
      body: 'Error: Site URL is not configured in environment variables.',
    };
  }

  try {
    const response = await fetch(`${siteUrl}/api/cron/check-reminders`);
    const data = await response.text();

    if (!response.ok) {
      throw new Error(`API route failed with status ${response.status}: ${data}`);
    }

    console.log('[Netlify Function] - checkReminders: Successfully triggered the reminder check API. Response:', data);

    return {
      statusCode: 200,
      body: `Reminder check triggered successfully. API response: ${data}`,
    };
  } catch (error: any) {
    console.error('[Netlify Function] - checkReminders: Error triggering the reminder check API:', error);
    return {
      statusCode: 500,
      body: `Failed to trigger reminder check: ${error.message}`,
    };
  }
};
