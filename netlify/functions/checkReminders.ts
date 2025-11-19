
import type { Handler } from '@netlify/functions';
import admin from '@/firebase/admin';
import type { ServiceReminder, Vehicle } from '@/lib/types';
import webpush from 'web-push';
import type { PushSubscription } from 'web-push';
import { differenceInDays, differenceInHours } from 'date-fns';

const db = admin.firestore();

// --- CONFIGURACIÓN CENTRALIZADA ---
// Este es el único lugar que controla el tiempo de enfriamiento.
const NOTIFICATION_COOLDOWN_HOURS = 1; 

const URGENCY_THRESHOLD_KM = 1000;
const URGENCY_THRESHOLD_DAYS = 15;
// ---------------------------------


/**
 * El handler principal de la función de Netlify.
 */
export const handler: Handler = async () => {
  console.log('[Netlify Function] - checkReminders: Cron job triggered.');

  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
     console.error("[Cron] VAPID keys are not set. Cannot send push notifications.");
     return { statusCode: 500, body: 'VAPID keys are not set on the server.' };
  }
  
  webpush.setVapidDetails(
      'mailto:your-email@example.com',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
  );

  try {
    // 1. Usar una collectionGroup query para obtener todos los recordatorios pendientes.
    // Esta consulta requiere un índice compuesto en Firestore.
    const remindersSnap = await db.collectionGroup('service_reminders')
                                  .where('isCompleted', '==', false)
                                  .orderBy('dueDate', 'desc')
                                  .get();
    
    if (remindersSnap.empty) {
        console.log('[Cron] No pending reminders found.');
        return { statusCode: 200, body: 'No pending reminders found.' };
    }
    console.log(`[Cron] Found ${remindersSnap.docs.length} pending reminders.`);

    const subscriptionsSnap = await db.collection('subscriptions').get();
    if (subscriptionsSnap.empty) {
        console.log('[Cron] No active push subscriptions.');
        return { statusCode: 200, body: 'No active push subscriptions.' };
    }
    const allSubscriptions = subscriptionsSnap.docs.map(doc => doc.data().subscription as PushSubscription);
    console.log(`[Cron] Found ${allSubscriptions.length} active subscriptions.`);

    let notificationsSent = 0;
    
    // 2. Procesar cada recordatorio encontrado.
    for (const reminderDoc of remindersSnap.docs) {
        const reminder = { id: reminderDoc.id, ...reminderDoc.data() } as ServiceReminder & { id: string };
        const vehicleId = reminderDoc.ref.parent.parent?.id;

        if (!vehicleId) {
            console.log(`[Cron] Skipping reminder ${reminder.id}: could not determine vehicleId.`);
            continue;
        }
        
        // --- Get Vehicle Details ---
        const vehicleSnap = await db.collection('vehicles').doc(vehicleId).get();
        if (!vehicleSnap.exists) {
            console.log(`[Cron] Skipping reminder ${reminder.id}: Vehicle with ID ${vehicleId} not found.`);
            continue;
        }
        const vehicleData = vehicleSnap.data() as Vehicle;
        const vehicle: Vehicle = { 
            id: vehicleSnap.id,
            make: vehicleData.make,
            model: vehicleData.model,
            year: vehicleData.year,
            plate: vehicleData.plate,
            fuelCapacityLiters: vehicleData.fuelCapacityLiters,
            averageConsumptionKmPerLiter: vehicleData.averageConsumptionKmPerLiter,
            imageUrl: vehicleData.imageUrl,
            imageHint: vehicleData.imageHint,
         };
         
        console.log(`[Cron] Processing reminder "${reminder.serviceType}" for vehicle ${vehicle.make} ${vehicle.model}.`);

        // --- Get Latest Odometer ---
        const lastFuelLogSnap = await db.collection('vehicles').doc(vehicleId).collection('fuel_records').orderBy('odometer', 'desc').limit(1).get();
        const lastTripSnap = await db.collection('vehicles').doc(vehicleId).collection('trips').orderBy('endOdometer', 'desc').limit(1).get();
        const lastFuelOdometer = lastFuelLogSnap.empty ? 0 : lastFuelLogSnap.docs[0].data().odometer;
        const lastTripOdometer = lastTripSnap.empty ? 0 : lastTripSnap.docs[0].data().endOdometer || 0;
        const lastOdometer = Math.max(lastFuelOdometer, lastTripOdometer);

        if (lastOdometer === 0) {
          console.log(`[Cron] Skipping vehicle ${vehicle.make} ${vehicle.model}, no odometer reading found.`);
          continue;
        };
        console.log(`[Cron] Latest odometer for ${vehicle.make} is ${lastOdometer} km.`);

        const kmsRemaining = reminder.dueOdometer ? reminder.dueOdometer - lastOdometer : null;
        const daysRemaining = reminder.dueDate ? differenceInDays(new Date(reminder.dueDate), new Date()) : null;

        const isOverdue = (kmsRemaining !== null && kmsRemaining < 0) || (daysRemaining !== null && daysRemaining < 0);
        const isUrgent = !isOverdue && (
            (kmsRemaining !== null && kmsRemaining <= URGENCY_THRESHOLD_KM) ||
            (daysRemaining !== null && daysRemaining <= URGENCY_THRESHOLD_DAYS)
        );

        if (isOverdue || isUrgent) {
            const lastSent = reminder.lastNotificationSent ? new Date(reminder.lastNotificationSent) : null;
            const hoursSinceLastSent = lastSent ? differenceInHours(new Date(), lastSent) : null;

            if (hoursSinceLastSent !== null && hoursSinceLastSent < NOTIFICATION_COOLDOWN_HOURS) {
                console.log(`[Cron] Skipping notification for "${reminder.serviceType}" on ${vehicle.make}. Cooldown active. Last sent: ${hoursSinceLastSent}h ago. Threshold: ${NOTIFICATION_COOLDOWN_HOURS}h.`);
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
            
            console.log(`[Cron] Preparing to send notification for reminder: ${reminder.id}`, payload);

            let reminderSentToAtLeastOneDevice = false;
            const sendPromises = allSubscriptions.map(subscription => 
                webpush.sendNotification(subscription, payload)
                .then(() => {
                    reminderSentToAtLeastOneDevice = true;
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
                console.log(`[Cron] Notification sent for "${reminder.serviceType}" on vehicle ${vehicle.make}.`);
                notificationsSent++;
                await reminderDoc.ref.update({
                    lastNotificationSent: new Date().toISOString()
                });
            }
        } else {
             console.log(`[Cron] Reminder "${reminder.serviceType}" for ${vehicle.make} is not due for notification yet.`);
        }
    }
    
    const successMessage = `Cron job completed. Processed ${notificationsSent} notification events.`;
    console.log(`[Netlify Function] - checkReminders: ${successMessage}`);
    return { statusCode: 200, body: successMessage };

  } catch (error: any) {
    console.error('[Netlify Function] - checkReminders: Error during execution:', error);
    return { statusCode: 500, body: `Internal server error: ${error.message}` };
  }
}
