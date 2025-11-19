
import type { Handler } from '@netlify/functions';
import admin from 'firebase-admin';
import webpush from 'web-push';
import type { PushSubscription } from 'web-push';
import { differenceInDays, differenceInHours } from 'date-fns';

// ================================================================
// TOTAL ISOLATION: TYPES AND FIREBASE INIT ARE SELF-CONTAINED
// This removes all dependencies on the Next.js project structure (@/)
// to prevent silent build failures in the Netlify environment.
// ================================================================

// --- TYPE DEFINITIONS (mirrored from src/lib/types.ts) ---
interface Vehicle {
  make: string;
  model: string;
  imageUrl?: string;
  // Add other vehicle properties if needed by the notification logic
}

interface ServiceReminder {
  id: string;
  serviceType: string;
  dueDate: string | null;
  dueOdometer: number | null;
  isCompleted: boolean;
  lastNotificationSent?: string | null;
  // Add other reminder properties if needed
}

// --- FIREBASE ADMIN INITIALIZATION (self-contained) ---
if (!admin.apps.length) {
  try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
      : undefined;

    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('[Firebase Admin] Self-contained init OK.');
    } else {
      console.error('[Firebase Admin] FIREBASE_SERVICE_ACCOUNT_KEY is not set.');
    }
  } catch (error: any) {
    console.error('[Firebase Admin] Self-contained init failed:', error.message);
  }
}

const db = admin.firestore();

// --- NOTIFICATION LOGIC CONFIG ---
const NOTIFICATION_COOLDOWN_HOURS = 1; 
const URGENCY_THRESHOLD_KM = 1000;
const URGENCY_THRESHOLD_DAYS = 15;


/**
 * The main handler for the Netlify serverless function.
 */
export const handler: Handler = async () => {
  console.log('[Netlify Function] checkReminders: Triggered.');

  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
     console.error("[Cron] VAPID keys are not set. Cannot send notifications.");
     return { statusCode: 500, body: 'VAPID keys are not set on the server.' };
  }

  try {
     webpush.setVapidDetails(
        'mailto:your-email@example.com',
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        process.env.VAPID_PRIVATE_KEY!
    );
  } catch(e: any) {
      console.error('[Cron] Error setting VAPID details:', e.message);
      return { statusCode: 500, body: `VAPID configuration error: ${e.message}` };
  }

  try {
    console.log('[Cron] Firestore instance obtained. Preparing query...');

    // 1. Get all pending reminders using the composite index.
    const remindersSnap = await db.collectionGroup('service_reminders')
                                  .where('isCompleted', '==', false)
                                  .orderBy('dueDate', 'desc')
                                  .get();
    
    if (remindersSnap.empty) {
        console.log('[Cron] No pending reminders found.');
        return { statusCode: 200, body: 'No pending reminders found.' };
    }
    console.log(`[Cron] Found ${remindersSnap.docs.length} pending reminders to check.`);

    // 2. Get all push subscriptions.
    const subscriptionsSnap = await db.collection('subscriptions').get();
    if (subscriptionsSnap.empty) {
        console.log('[Cron] No active push subscriptions found. Cannot send notifications.');
        return { statusCode: 200, body: 'No active push subscriptions.' };
    }
    const allSubscriptions = subscriptionsSnap.docs.map(doc => doc.data().subscription as PushSubscription);
    console.log(`[Cron] Found ${allSubscriptions.length} active subscriptions.`);

    let notificationsSent = 0;
    
    // 3. Process each reminder.
    for (const reminderDoc of remindersSnap.docs) {
        const reminder = { id: reminderDoc.id, ...reminderDoc.data() } as ServiceReminder & { id: string };
        const vehicleId = reminderDoc.ref.parent.parent?.id;

        if (!vehicleId) {
            console.log(`[Cron] Skipping reminder ${reminder.id}: could not determine vehicleId.`);
            continue;
        }
        
        const vehicleSnap = await db.collection('vehicles').doc(vehicleId).get();
        if (!vehicleSnap.exists) {
            console.log(`[Cron] Skipping reminder ${reminder.id}: Vehicle with ID ${vehicleId} not found.`);
            continue;
        }
        const vehicleData = vehicleSnap.data() as Vehicle;
         
        console.log(`[Cron] Processing reminder "${reminder.serviceType}" for vehicle ${vehicleData.make} ${vehicleData.model}.`);
        
        // 4. Get the latest odometer for the vehicle.
        const fuelLogsSnap = await db.collection('vehicles').doc(vehicleId).collection('fuel_records').orderBy('odometer', 'desc').limit(1).get();
        const tripsSnap = await db.collection('vehicles').doc(vehicleId).collection('trips').orderBy('endOdometer', 'desc').limit(1).get();
        
        const lastFuelOdometer = fuelLogsSnap.empty ? 0 : fuelLogsSnap.docs[0].data().odometer;
        const lastTripOdometer = tripsSnap.empty ? 0 : (tripsSnap.docs[0].data().endOdometer || 0);
        const lastOdometer = Math.max(lastFuelOdometer, lastTripOdometer);

        if (lastOdometer === 0) {
          console.log(`[Cron] Skipping vehicle ${vehicleData.make} ${vehicleData.model}, no odometer reading found.`);
          continue;
        };
        console.log(`[Cron] Latest odometer for ${vehicleData.make} is ${lastOdometer} km.`);

        // 5. Determine if notification is needed.
        const kmsRemaining = reminder.dueOdometer ? reminder.dueOdometer - lastOdometer : null;
        const daysRemaining = reminder.dueDate ? differenceInDays(new Date(reminder.dueDate), new Date()) : null;

        const isOverdue = (kmsRemaining !== null && kmsRemaining < 0) || (daysRemaining !== null && daysRemaining < 0);
        const isUrgent = !isOverdue && (
            (kmsRemaining !== null && kmsRemaining <= URGENCY_THRESHOLD_KM) ||
            (daysRemaining !== null && daysRemaining <= URGENCY_THRESHOLD_DAYS)
        );

        if (isOverdue || isUrgent) {
            // Check cooldown
            const lastSent = reminder.lastNotificationSent ? new Date(reminder.lastNotificationSent) : null;
            const hoursSinceLastSent = lastSent ? differenceInHours(new Date(), lastSent) : null;

            if (hoursSinceLastSent !== null && hoursSinceLastSent < NOTIFICATION_COOLDOWN_HOURS) {
                console.log(`[Cron] Skipping notification for "${reminder.serviceType}". Cooldown active. Last sent: ${hoursSinceLastSent}h ago.`);
                continue;
            }
            
            // 6. Send notifications.
            const title = `Alerta de Servicio: ${vehicleData.make} ${vehicleData.model}`;
            let body = `${reminder.serviceType} - `;
            body += isOverdue ? '¡Servicio Vencido!' : '¡Servicio Próximo!';
            
            const payload = JSON.stringify({ 
                title, 
                body, 
                icon: vehicleData.imageUrl || '/icon-192x192.png',
                tag: reminder.id
            });
            
            console.log(`[Cron] Preparing to send notification for reminder: ${reminder.id}`);
            
            let reminderSentToAtLeastOneDevice = false;
            const sendPromises = allSubscriptions.map(subscription => 
                webpush.sendNotification(subscription, payload)
                .then(() => {
                    reminderSentToAtLeastOneDevice = true;
                    console.log(`[Cron] Successfully sent notification to endpoint: ${subscription.endpoint.substring(0, 50)}...`);
                })
                .catch(error => {
                     if (error.statusCode === 410 || error.statusCode === 404) {
                        console.log('[Cron] Subscription expired or not found. Deleting from DB...');
                        const docId = encodeURIComponent(subscription.endpoint);
                        db.collection('subscriptions').doc(docId).delete();
                    } else {
                        console.error(`[Cron] Failed to send notification for reminder ${reminder.id}:`, error.message);
                    }
                })
            );
            
            await Promise.all(sendPromises);

            if (reminderSentToAtLeastOneDevice) {
                console.log(`[Cron] Notification sent for "${reminder.serviceType}". Updating timestamp.`);
                notificationsSent++;
                await reminderDoc.ref.update({
                    lastNotificationSent: new Date().toISOString()
                });
            }
        } else {
             console.log(`[Cron] Reminder "${reminder.serviceType}" for ${vehicleData.make} is not due for notification yet.`);
        }
    }
    
    const successMessage = `Cron job completed. Processed ${remindersSnap.docs.length} reminders. Sent ${notificationsSent} notification events.`;
    console.log(`[Netlify Function] - checkReminders: ${successMessage}`);
    return { statusCode: 200, body: successMessage };

  } catch (error: any) {
    console.error('[Netlify Function] - checkReminders: CRITICAL ERROR during execution:', error);
    return { statusCode: 500, body: `Internal server error: ${error.message}` };
  }
}
