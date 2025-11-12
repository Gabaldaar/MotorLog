'use server';

import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import webpush from 'web-push';
import type { PushSubscription } from 'web-push';

// --- START INITIALIZATION BLOCK ---
// This code runs once per server instance.

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
  : null;

if (!getApps().length) {
  if (!serviceAccount) {
    console.warn('FIREBASE_SERVICE_ACCOUNT_KEY not found, using default credentials for Admin SDK. This might fail in production.');
    initializeApp();
  } else {
    initializeApp({
      credential: cert(serviceAccount),
    });
  }
}

const db = getFirestore();

// Configure web-push with VAPID keys. This is critical.
if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:your-email@example.com', // Replace with your email
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
} else {
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
    
    const subscriptionsSnapshot = await db.collection('subscriptions').where('userId', '==', userId).get();

    if (subscriptionsSnapshot.empty) {
      console.log(`No push subscriptions found for user: ${userId}`);
      return NextResponse.json({ success: true, message: 'No subscriptions found for user.' });
    }

    const notificationPayload = JSON.stringify(payload);
    const promises: Promise<any>[] = [];
    const expiredSubscriptions: string[] = [];

    subscriptionsSnapshot.forEach(doc => {
      const sub = doc.data().subscription as PushSubscription;
      promises.push(
        webpush.sendNotification(sub, notificationPayload)
          .catch(error => {
            if (error.statusCode === 410 || error.statusCode === 404) {
              // 410: GCM (Google Cloud Messaging) - The subscription is expired and invalid.
              // 404: Web Push Protocol - The subscription is no longer valid.
              console.log(`Subscription ${doc.id} has expired or is no longer valid.`);
              expiredSubscriptions.push(doc.id);
            } else {
              console.error(`Failed to send notification to subscription ${doc.id}:`, error.statusCode, error.body);
            }
          })
      );
    });

    await Promise.all(promises);

    // Clean up expired subscriptions from Firestore
    if (expiredSubscriptions.length > 0) {
      const deletePromises = expiredSubscriptions.map(subId => 
        db.collection('subscriptions').doc(subId).delete()
      );
      await Promise.all(deletePromises);
      console.log(`Cleaned up ${expiredSubscriptions.length} expired subscriptions.`);
    }

    return NextResponse.json({ 
        success: true, 
        sent: promises.length - expiredSubscriptions.length, 
        expired: expiredSubscriptions.length 
    });

  } catch (error: any) {
    console.error('Unhandled error in /api/send-push:', error);
    return NextResponse.json({ error: 'Failed to send notifications', details: error.message }, { status: 500 });
  }
}
