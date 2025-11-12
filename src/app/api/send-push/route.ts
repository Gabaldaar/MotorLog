'use server';

import { NextResponse } from 'next/server';
import admin from '@/firebase/admin'; // Import the centralized admin instance
import webpush from 'web-push';
import type { PushSubscription } from 'web-push';

// --- START INITIALIZATION BLOCK ---
// Ensure this runs only once. `admin` is already initialized in its own module.
const db = admin.firestore();

// Configure web-push with VAPID keys. This is critical.
// This check ensures that the server doesn't start without the necessary keys.
if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:your-email@example.com', // Replace with your email
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
} else {
    // This log will appear when the server starts if keys are missing.
    console.error('VAPID keys are missing. Push notifications will fail. Please set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables.');
}
// --- END INITIALIZATION BLOCK ---


interface RequestBody {
    userId: string;
    payload: {
        title: string;
        body: string;
        icon?: string;
    }
}

export async function POST(request: Request) {
  try {
    // 1. Validate VAPID keys are set before proceeding
    if (!process.env.VAPID_PRIVATE_KEY) {
        console.error("VAPID_PRIVATE_KEY is not set. Cannot send push notifications.");
        return NextResponse.json({ error: 'Server is not configured to send push notifications.' }, { status: 500 });
    }

    const { userId, payload } = await request.json() as RequestBody;

    if (!userId || !payload) {
      return NextResponse.json({ error: 'Invalid request body: userId and payload are required.' }, { status: 400 });
    }
    
    // 2. Fetch all subscriptions for the given user ID
    const subscriptionsSnapshot = await db.collection('subscriptions').where('userId', '==', userId).get();

    if (subscriptionsSnapshot.empty) {
      console.log(`No push subscriptions found for user: ${userId}`);
      return NextResponse.json({ success: true, message: 'No subscriptions found for user.', sent: 0, expired: 0 });
    }

    // 3. Prepare to send notifications
    const notificationPayload = JSON.stringify(payload);
    const promises: Promise<any>[] = [];
    const expiredSubscriptionIds: string[] = [];

    // 4. Iterate over subscriptions and create a send promise for each
    subscriptionsSnapshot.forEach(doc => {
      const sub = doc.data().subscription as PushSubscription;
      promises.push(
        webpush.sendNotification(sub, notificationPayload)
          .catch(error => {
            // Check for "410 Gone", which means the subscription is no longer valid.
            if (error.statusCode === 410 || error.statusCode === 404) {
              console.log(`Subscription ${doc.id} has expired or is no longer valid.`);
              expiredSubscriptionIds.push(doc.id);
            } else {
              // Log other errors without stopping the process for other valid subscriptions.
              console.error(`Failed to send notification to subscription ${doc.id}:`, error.statusCode, error.body);
            }
          })
      );
    });

    // 5. Wait for all send attempts to complete
    await Promise.all(promises);

    // 6. Clean up expired subscriptions from Firestore
    if (expiredSubscriptionIds.length > 0) {
      const deletePromises = expiredSubscriptionIds.map(subId => 
        db.collection('subscriptions').doc(subId).delete()
      );
      await Promise.all(deletePromises);
      console.log(`Cleaned up ${expiredSubscriptionIds.length} expired subscriptions.`);
    }
    
    // 7. Return a detailed success response
    return NextResponse.json({ 
        success: true, 
        sent: subscriptionsSnapshot.size - expiredSubscriptionIds.length, 
        expired: expiredSubscriptionIds.length 
    });

  } catch (error: any) {
    console.error('Unhandled error in /api/send-push:', error);
    return NextResponse.json({ error: 'Failed to send notifications', details: error.message }, { status: 500 });
  }
}
