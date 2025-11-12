'use server';

import { NextResponse } from 'next/server';
import webpush from 'web-push';
import type { PushSubscription } from 'web-push';

// --- START INITIALIZATION BLOCK ---
// Configure web-push with VAPID keys. This should only run once.
if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:your-email@example.com', // Replace with a valid email
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
} else {
  // This log will appear when the server starts if keys are missing.
  console.error('VAPID keys are missing. Push notifications will fail. Please set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables.');
}
// --- END INITIALIZATION BLOCK ---

export async function POST(request: Request) {
  try {
    // 1. Validate VAPID keys are set before proceeding
    if (!process.env.VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        console.error("VAPID keys are not set. Cannot send push notifications.");
        return NextResponse.json({ error: 'Server is not configured to send push notifications.' }, { status: 500 });
    }

    // 2. Get subscription and payload from the request body
    const { subscription, payload } = await request.json() as { subscription: PushSubscription, payload: any };

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json({ error: 'Invalid request body: subscription object is required.' }, { status: 400 });
    }
     if (!payload) {
      return NextResponse.json({ error: 'Invalid request body: payload is required.' }, { status: 400 });
    }

    const notificationPayload = JSON.stringify(payload);

    // 3. Send the notification directly to the provided subscription
    await webpush.sendNotification(subscription, notificationPayload);
    
    // 4. Return a success response
    return NextResponse.json({ 
        success: true, 
        message: 'Notification sent successfully to the provided subscription.' 
    });

  } catch (error: any) {
    console.error('Error in /api/send-push:', error);

    // If the error is that the subscription is expired (410 Gone)
    if (error.statusCode === 410 || error.statusCode === 404) {
      return NextResponse.json({ error: 'Subscription has expired or is no longer valid.', details: error.message }, { status: 410 });
    }

    return NextResponse.json({ error: 'Failed to send notification', details: error.message }, { status: 500 });
  }
}
