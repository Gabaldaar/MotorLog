'use server';

import { NextResponse } from 'next/server';
import admin from '@/firebase/admin';
import type { ServiceReminder, Vehicle } from '@/lib/types';
import webpush, { type PushSubscription } from 'web-push';
import { differenceInDays, differenceInHours } from 'date-fns';

const db = admin.firestore();

// --- START VAPID CONFIG ---
if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:your-email@example.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
} else {
  console.error('VAPID keys are missing. Push notifications will fail.');
}
// --- END VAPID CONFIG ---

// Simple in-memory cache to avoid querying the same vehicle data too frequently
const vehicleCache = new Map<string, { data: Vehicle, timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getVehicleData(vehicleId: string): Promise<Vehicle | null> {
    const cached = vehicleCache.get(vehicleId);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
        return cached.data;
    }
    const vehicleSnap = await db.collection('vehicles').doc(vehicleId).get();
    if (!vehicleSnap.exists) return null;
    const vehicleData = vehicleSnap.data() as Vehicle;
    vehicleCache.set(vehicleId, { data: vehicleData, timestamp: Date.now() });
    return vehicleData;
}


export async function POST(request: Request) {
  const { vehicleId } = await request.json();

  if (!vehicleId) {
    return NextResponse.json({ success: false, error: 'Vehicle ID is required' }, { status: 400 });
  }

  try {
    const vehicle = await getVehicleData(vehicleId);
    if (!vehicle) {
        return NextResponse.json({ success: false, error: 'Vehicle not found' }, { status: 404 });
    }

    // 1. Get latest odometer reading
    const lastLogSnap = await db.collection('vehicles').doc(vehicleId).collection('fuel_records').orderBy('odometer', 'desc').limit(1).get();
    if (lastLogSnap.empty) {
        return NextResponse.json({ success: true, message: 'No fuel logs found, skipping check.' });
    }
    const lastOdometer = lastLogSnap.docs[0].data().odometer;
    
    // 2. Get pending reminders
    const remindersSnap = await db.collection('vehicles').doc(vehicleId).collection('service_reminders').where('isCompleted', '==', false).get();
    if (remindersSnap.empty) {
        return NextResponse.json({ success: true, message: 'No pending reminders.' });
    }
    const pendingReminders = remindersSnap.docs.map(doc => doc.data() as ServiceReminder);

    // 3. Get all active push subscriptions
    const subscriptionsSnap = await db.collection('subscriptions').get();
    if (subscriptionsSnap.empty) {
        return NextResponse.json({ success: true, message: 'No active push subscriptions found.' });
    }
    const subscriptions = subscriptionsSnap.docs.map(doc => doc.data().subscription as PushSubscription);

    // 4. Logic to determine which reminders are urgent
    // Hardcoded for now, should come from user preferences later.
    const URGENCY_THRESHOLD_KM = 1000;
    const URGENCY_THRESHOLD_DAYS = 15;
    const NOTIFICATION_COOLDOWN_HOURS = 48;

    const notificationsToSend: { subscription: PushSubscription, payload: string, reminderId: string }[] = [];

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
                console.log(`Skipping notification for ${reminder.serviceType} (sent recently).`);
                continue;
            }
            
            const title = `Alerta de Servicio: ${vehicle.make} ${vehicle.model}`;
            let body = `${reminder.serviceType} - `;
            if (isOverdue) {
                body += '¡Servicio Vencido!';
            } else {
                body += '¡Servicio Próximo!';
            }
            
            const payload = JSON.stringify({
                title,
                body,
                icon: vehicle.imageUrl || '/icon-192x192.png'
            });

            for (const subscription of subscriptions) {
                notificationsToSend.push({ subscription, payload, reminderId: reminder.id });
            }
        }
    }

    if (notificationsToSend.length === 0) {
        return NextResponse.json({ success: true, message: 'No urgent reminders to notify.' });
    }

    // 5. Send notifications and update DB
    const sendPromises = notificationsToSend.map(async ({ subscription, payload, reminderId }) => {
        try {
            await webpush.sendNotification(subscription, payload);
            // Update last sent timestamp on success
            await db.collection('vehicles').doc(vehicleId).collection('service_reminders').doc(reminderId).update({
                lastNotificationSent: new Date().toISOString()
            });
            return { success: true, reminderId };
        } catch (error: any) {
            console.error(`Failed to send notification for reminder ${reminderId}:`, error.message);
            if (error.statusCode === 410) { // GONE, subscription is no longer valid
                console.log('Subscription expired. Deleting from DB...');
                const subToDeleteSnap = await db.collection('subscriptions').where('subscription.endpoint', '==', subscription.endpoint).limit(1).get();
                if (!subToDeleteSnap.empty) {
                    await subToDeleteSnap.docs[0].ref.delete();
                }
            }
            return { success: false, reminderId, error: error.message };
        }
    });

    const results = await Promise.all(sendPromises);
    const sentCount = results.filter(r => r.success).length;

    return NextResponse.json({ success: true, message: `Sent ${sentCount} notifications.` });

  } catch (error: any) {
    console.error('Error in check-and-send-reminders:', error);
    return NextResponse.json({ success: false, error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
    