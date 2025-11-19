'use server';

import type { Handler } from '@netlify/functions';
import admin from '@/firebase/admin';
import type { ServiceReminder, Vehicle } from '@/lib/types';
import webpush from 'web-push';
import type { PushSubscription } from 'web-push';
import { differenceInDays, differenceInHours } from 'date-fns';

const db = admin.firestore();

// --- CONFIGURACIÓN CENTRALIZADA ---
// Este es el único lugar que controla el tiempo de enfriamiento.
// El valor en la UI es solo de referencia.
const NOTIFICATION_COOLDOWN_HOURS = 1; 

const URGENCY_THRESHOLD_KM = 1000;
const URGENCY_THRESHOLD_DAYS = 15;
// ---------------------------------

/**
 * Obtiene el último odómetro registrado para un vehículo específico.
 */
async function getLatestOdometer(vehicleId: string): Promise<number> {
    const lastFuelLogSnap = await db.collection('vehicles').doc(vehicleId).collection('fuel_records').orderBy('odometer', 'desc').limit(1).get();
    const lastTripSnap = await db.collection('vehicles').doc(vehicleId).collection('trips').orderBy('endOdometer', 'desc').limit(1).get();
    
    const lastFuelOdometer = lastFuelLogSnap.empty ? 0 : lastFuelLogSnap.docs[0].data().odometer;
    const lastTripOdometer = lastTripSnap.empty ? 0 : lastTripSnap.docs[0].data().endOdometer || 0;
    
    return Math.max(lastFuelOdometer, lastTripOdometer);
}

/**
 * Obtiene los detalles de un vehículo por su ID.
 */
async function getVehicleDetails(vehicleId: string): Promise<Vehicle | null> {
    const vehicleSnap = await db.collection('vehicles').doc(vehicleId).get();
    if (!vehicleSnap.exists) {
        console.log(`[Cron] Vehicle with ID ${vehicleId} not found.`);
        return null;
    }
    // Explicitly map the fields to ensure all required ones, including imageUrl, are present.
    const data = vehicleSnap.data();
    if (!data) return null;

    return { 
        id: vehicleSnap.id,
        make: data.make,
        model: data.model,
        year: data.year,
        plate: data.plate,
        fuelCapacityLiters: data.fuelCapacityLiters,
        averageConsumptionKmPerLiter: data.averageConsumptionKmPerLiter,
        imageUrl: data.imageUrl,
        imageHint: data.imageHint,
     } as Vehicle;
}

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
    // 1. Usar una collectionGroup query para obtener todos los recordatorios pendientes de una sola vez.
    const remindersSnap = await db.collectionGroup('service_reminders').where('isCompleted', '==', false).get();
    
    if (remindersSnap.empty) {
        return { statusCode: 200, body: 'No pending reminders found.' };
    }

    const subscriptionsSnap = await db.collection('subscriptions').get();
    if (subscriptionsSnap.empty) {
        return { statusCode: 200, body: 'No active push subscriptions.' };
    }
    const allSubscriptions = subscriptionsSnap.docs.map(doc => doc.data().subscription as PushSubscription);

    let notificationsSent = 0;
    
    // 2. Procesar cada recordatorio encontrado.
    for (const reminderDoc of remindersSnap.docs) {
        const reminder = { id: reminderDoc.id, ...reminderDoc.data() } as ServiceReminder & { id: string };
        const vehicleId = reminderDoc.ref.parent.parent?.id;

        if (!vehicleId) continue;
        
        const vehicle = await getVehicleDetails(vehicleId);
        if (!vehicle) {
            console.log(`[Cron] Skipping reminder ${reminder.id} because vehicle details could not be fetched.`);
            continue;
        }

        const lastOdometer = await getLatestOdometer(vehicleId);
        if (lastOdometer === 0) {
          console.log(`[Cron] Skipping vehicle ${vehicle.make} ${vehicle.model}, no odometer reading found.`);
          continue;
        };

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
                continue; // Saltar al siguiente recordatorio
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
                console.log(`[Cron] Notification sent for "${reminder.serviceType}" on vehicle ${vehicle.make}.`);
                notificationsSent++;
                await reminderDoc.ref.update({
                    lastNotificationSent: new Date().toISOString()
                });
            }
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
