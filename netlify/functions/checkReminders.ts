
'use server';

import type { Handler } from '@netlify/functions';
import admin from '@/firebase/admin';
import type { ServiceReminder, Vehicle } from '@/lib/types';
import webpush from 'web-push';
import type { PushSubscription } from 'web-push';
import { differenceInDays, differenceInHours } from 'date-fns';

const db = admin.firestore();

// --- CONFIGURACIÓN CENTRALIZADA ---
const URGENCY_THRESHOLD_KM = 1000;
const URGENCY_THRESHOLD_DAYS = 15;
const NOTIFICATION_COOLDOWN_HOURS = 48; // Horas a esperar antes de reenviar una notificación.

const vehicleOdometerCache = new Map<string, number>();
const allSubscriptionsCache: { subs: PushSubscription[], timestamp: number | null } = { subs: [], timestamp: null };
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function getLatestOdometer(vehicleId: string): Promise<number> {
    if (vehicleOdometerCache.has(vehicleId)) {
        return vehicleOdometerCache.get(vehicleId)!;
    }
    const lastFuelLogSnap = await db.collection('vehicles').doc(vehicleId).collection('fuel_records').orderBy('odometer', 'desc').limit(1).get();
    const lastTripSnap = await db.collection('vehicles').doc(vehicleId).collection('trips').orderBy('endOdometer', 'desc').limit(1).get();
    
    const lastFuelOdometer = lastFuelLogSnap.empty ? 0 : lastFuelLogSnap.docs[0].data().odometer;
    const lastTripOdometer = lastTripSnap.empty ? 0 : lastTripSnap.docs[0].data().endOdometer || 0;
    
    const lastOdometer = Math.max(lastFuelOdometer, lastTripOdometer);

    if (lastOdometer > 0) {
        vehicleOdometerCache.set(vehicleId, lastOdometer);
    }
    
    return lastOdometer;
}


async function getAllSubscriptions(): Promise<PushSubscription[]> {
    const now = Date.now();
    if (allSubscriptionsCache.timestamp && (now - allSubscriptionsCache.timestamp < CACHE_TTL_MS)) {
        return allSubscriptionsCache.subs;
    }
    const subscriptionsSnap = await db.collection('subscriptions').get();
    if (subscriptionsSnap.empty) {
        allSubscriptionsCache.subs = [];
        allSubscriptionsCache.timestamp = now;
        return [];
    }
    const subscriptions = subscriptionsSnap.docs.map(doc => doc.data().subscription as PushSubscription);
    allSubscriptionsCache.subs = subscriptions;
    allSubscriptionsCache.timestamp = now;
    return subscriptions;
}


async function checkAndSendForVehicle(vehicle: Vehicle) {
    let notificationsSent = 0;
    const lastOdometer = await getLatestOdometer(vehicle.id);
    if (lastOdometer === 0) return notificationsSent;

    const remindersSnap = await db.collection('vehicles').doc(vehicle.id).collection('service_reminders').where('isCompleted', '==', false).get();
    if (remindersSnap.empty) return notificationsSent;
    
    const pendingReminders = remindersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ServiceReminder & { id: string }));

    const subscriptions = await getAllSubscriptions();
    if (subscriptions.length === 0) return notificationsSent;

    for (const reminder of pendingReminders) {
        const kmsRemaining = reminder.dueOdometer ? reminder.dueOdometer - lastOdometer : null;
        const daysRemaining = reminder.dueDate ? differenceInDays(new Date(reminder.dueDate), new Date()) : null;

        const isOverdue = (kmsRemaining !== null && kmsRemaining < 0) || (daysRemaining !== null && daysRemaining < 0);
        const isUrgent = !isOverdue && (
            (kmsRemaining !== null && kmsRemaining <= URGENCY_THRESHOLD_KM) ||
            (daysRemaining !== null && daysRemaining <= URGENCY_THRESHOLD_DAYS)
        );

        if (isOverdue || isUrgent) {
            const lastSent = reminder.lastNotificationSent ? new Date(reminder.lastNotificationSent) : null;
            if (lastSent && differenceInHours(new Date(), lastSent) < NOTIFICATION_COOLDOWN_HOURS) {
                console.log(`[Cron] Skipping notification for ${reminder.serviceType} (sent recently).`);
                continue;
            }
            
            const title = `Alerta de Servicio: ${vehicle.make} ${vehicle.model}`;
            let body = `${reminder.serviceType} - `;
            body += isOverdue ? '¡Servicio Vencido!' : '¡Servicio Próximo!';
            
            const payload = JSON.stringify({ 
                title, 
                body, 
                icon: vehicle.imageUrl || '/icon-192x192.png',
                tag: reminder.id
            });
            
            let reminderSentToAtLeastOneDevice = false;
            const sendPromises = subscriptions.map(subscription => 
                webpush.sendNotification(subscription, payload)
                .then(() => {
                    notificationsSent++;
                    reminderSentToAtLeastOneDevice = true;
                })
                .catch(error => {
                     if (error.statusCode === 410) {
                        console.log('[Cron] Subscription expired. Deleting from DB...');
                        const docId = encodeURIComponent(subscription.endpoint);
                        db.collection('subscriptions').doc(docId).delete();
                    } else {
                        console.error(`[Cron] Failed to send notification for reminder ${reminder.id}:`, error.message);
                    }
                })
            );
            
            await Promise.all(sendPromises);

            if (reminderSentToAtLeastOneDevice) {
                await db.collection('vehicles').doc(vehicle.id).collection('service_reminders').doc(reminder.id).update({
                    lastNotificationSent: new Date().toISOString()
                });
            }
        }
    }
    return notificationsSent;
}

// The main function for the scheduled endpoint
export const handler: Handler = async () => {
  console.log('[Netlify Function] - checkReminders: Cron job triggered.');

  if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        'mailto:your-email@example.com',
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
  } else {
     console.error("[Cron] VAPID keys are not set. Cannot send push notifications.");
     return { statusCode: 500, body: 'VAPID keys are not set on the server.' };
  }

  try {
    const vehiclesSnap = await db.collection('vehicles').get();
    if (vehiclesSnap.empty) {
        return { statusCode: 200, body: 'No vehicles to check.' };
    }

    let totalNotificationsSent = 0;
    const allVehicles = vehiclesSnap.docs.map(doc => ({id: doc.id, ...doc.data()} as Vehicle));

    for (const vehicle of allVehicles) {
      const count = await checkAndSendForVehicle(vehicle);
      totalNotificationsSent += count;
    }
    
    vehicleOdometerCache.clear();
    allSubscriptionsCache.subs = [];
    allSubscriptionsCache.timestamp = null;

    const successMessage = `Cron job completed. Sent ${totalNotificationsSent} total notifications.`;
    console.log(`[Netlify Function] - checkReminders: ${successMessage}`);
    return { statusCode: 200, body: successMessage };

  } catch (error: any) {
    console.error('[Netlify Function] - checkReminders: Error during execution:', error);
    return { statusCode: 500, body: `Internal server error: ${error.message}` };
  }
}
