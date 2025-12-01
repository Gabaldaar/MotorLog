
// netlify/functions/checkReminders.ts
'use server';

import type { Handler } from '@netlify/functions';
import admin from 'firebase-admin';
import webpush, { type PushSubscription } from 'web-push';
import { differenceInHours } from 'date-fns';


// ================================================================
// TOTAL ISOLATION: TYPES AND FIREBASE INIT ARE SELF-CONTAINED
// This removes all dependencies on the Next.js project structure (@/)
// to prevent silent build failures in the Netlify environment.
// ================================================================

// --- TYPE DEFINITIONS ---
// ADAPT THESE TYPES TO YOUR RENTAL APP'S NEEDS
interface NotificationTriggerData {
  id: string; 
  title: string;
  body: string;
  icon?: string;
  lastNotificationSent?: string | null;
  docPath: string;
}

// --- FIREBASE ADMIN INITIALIZATION (CORRECTED FOR NETLIFY) ---
try {
  if (!admin.apps.length) {
    const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountString) {
      throw new Error('La variable de entorno FIREBASE_SERVICE_ACCOUNT_KEY no está configurada.');
    }
    
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountString);
    } catch (e) {
      throw new Error('No se pudo parsear FIREBASE_SERVICE_ACCOUNT_KEY. Asegúrate de que sea un JSON válido.');
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('[Firebase Admin] Inicializado correctamente a través de la clave de servicio.');
  }
} catch (error: any) {
  // Catch initialization errors and log them clearly.
  // This prevents the function from running with a broken config.
  console.error('[Firebase Admin] La inicialización falló catastróficamente:', error.message);
  // We throw the error again to ensure the function execution stops.
  throw error;
}

const db = admin.firestore();


// ==================================================================
// ESTA ES LA SECCIÓN QUE DEBES ADAPTAR PARA TU NUEVA APLICACIÓN
// ==================================================================
async function checkAndSendNotifications() {
    let notificationsSent = 0;
    const NOTIFICATION_COOLDOWN_HOURS = 1;

    // --- START CUSTOM LOGIC FOR RENTAL APP ---
    
    // EXAMPLE: Find rentals ending in the next 24 hours
    // THIS IS JUST AN EXAMPLE, REPLACE IT WITH YOUR ACTUAL LOGIC.
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // ADAPT THIS QUERY: Change 'rentals' and the fields to match your Firestore structure.
    const rentalsSnap = await db.collection('rentals')
                              .where('endDate', '>=', now)
                              .where('endDate', '<=', tomorrow)
                              .get();
                              
    if (rentalsSnap.empty) {
        console.log('[CRON] No rentals are ending soon.');
        return 0;
    }
    
    const notificationTriggers: NotificationTriggerData[] = [];
    
    for (const doc of rentalsSnap.docs) {
        const rental = doc.data();
        
        // ADAPT THIS LOGIC: Build the notification content based on your data.
        notificationTriggers.push({
            id: doc.id,
            title: 'Fin de Alquiler Próximo',
            body: `El alquiler para "${rental.propertyName}" finaliza pronto.`,
            icon: '/icon-192x192.png',
            lastNotificationSent: rental.lastNotificationSent,
            docPath: doc.ref.path
        });
    }
    
    // --- END CUSTOM LOGIC ---

    if (notificationTriggers.length === 0) {
        console.log('[CRON] No items triggered a notification.');
        return 0;
    }

    const subscriptions = await getAllSubscriptions();
    if (subscriptions.length === 0) {
        console.log('[CRON] No active push subscriptions found.');
        return 0;
    }
    
    for (const trigger of notificationTriggers) {
        const lastSent = trigger.lastNotificationSent ? new Date(trigger.lastNotificationSent) : null;
        if (lastSent && differenceInHours(new Date(), lastSent) < NOTIFICATION_COOLDOWN_HOURS) {
            console.log(`[CRON] Skipping notification for ${trigger.id} (sent recently).`);
            continue;
        }

        const payload = JSON.stringify({ title: trigger.title, body: trigger.body, icon: trigger.icon, tag: trigger.id });

        const sendPromises = subscriptions.map(subscription => 
            sendNotification(subscription, payload)
        );
        
        await Promise.all(sendPromises);
        notificationsSent++;

        await db.doc(trigger.docPath).update({
            lastNotificationSent: new Date().toISOString()
        });
    }

    return notificationsSent;
}

// ==================================================================
// FUNCIONES DE SOPORTE (Generalmente no necesitas cambiar esto)
// ==================================================================
async function getAllSubscriptions(): Promise<PushSubscription[]> {
    const subscriptionsSnap = await db.collection('subscriptions').get();
    if (subscriptionsSnap.empty) {
        return [];
    }
    return subscriptionsSnap.docs.map(doc => doc.data().subscription as PushSubscription);
}

async function sendNotification(subscription: PushSubscription, payload: string) {
    try {
        await webpush.sendNotification(subscription, payload);
    } catch (error: any) {
        if (error.statusCode === 410 || error.statusCode === 404) {
            console.log('[CRON] Subscription expired. Deleting from DB...');
            const endpointEncoded = encodeURIComponent(subscription.endpoint);
            db.collection('subscriptions').doc(endpointEncoded).delete().catch(delErr => {
                console.error(`[CRON] Failed to delete expired subscription ${endpointEncoded}:`, delErr);
            });
        } else {
            console.error(`[CRON] Failed to send notification:`, error.message);
        }
    }
}


/**
 * El handler principal de la función de Netlify.
 */
export const handler: Handler = async () => {
  console.log('[Netlify Function] - checkReminders: Cron job triggered.');

  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
     console.error("[CRON] VAPID keys are not set. Cannot send push notifications.");
     return { statusCode: 500, body: 'VAPID keys are not set on the server.' };
  }

  webpush.setVapidDetails(
      'mailto:your-email@example.com', // Reemplaza con tu email
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
  );

  try {
    const totalNotificationsSent = await checkAndSendNotifications();
    const successMessage = `Cron job completed. Sent notifications for ${totalNotificationsSent} events.`;
    console.log(`[Netlify Function] - checkReminders: ${successMessage}`);
    return { statusCode: 200, body: successMessage };

  } catch (error: any) {
    console.error('[Netlify Function] - checkReminders: Error during execution:', error);
    return { statusCode: 500, body: `Internal server error: ${error.message}` };
  }
}

