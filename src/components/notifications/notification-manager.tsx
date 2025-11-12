'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { useVehicles } from '@/context/vehicle-context';
import { usePreferences } from '@/context/preferences-context';
import type { ProcessedFuelLog, ProcessedServiceReminder, ServiceReminder, Vehicle } from '@/lib/types';
import { differenceInDays } from 'date-fns';
import { Button } from '../ui/button';
import { BellRing, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { urlBase64ToUint8Array } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export async function subscribeUserToPush(idToken: string) {
  if (!('serviceWorker' in navigator)) {
    throw new Error("Service Worker not supported");
  }
  
  const registration = await navigator.serviceWorker.ready;
  const existingSubscription = await registration.pushManager.getSubscription();

  if (existingSubscription) {
    console.log('[Push Manager] User is already subscribed.');
    // Even if subscribed, we might want to re-sync with backend
    await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify(existingSubscription),
    });
    return;
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    console.error('VAPID public key not found. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY environment variable.');
    throw new Error('VAPID public key not found.');
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  await fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
    body: JSON.stringify(subscription),
  });
  console.log('[Push Manager] User subscribed successfully.');
}

// Export this function so it can be used by the settings page
export async function sendUrgentRemindersNotification(
  userId: string, 
  reminders: ProcessedServiceReminder[], 
  vehicle: Vehicle | null, 
  cooldownHours: number,
  ignoreCooldown = false // New parameter
) {
    if (reminders.length === 0 || typeof window === 'undefined' || Notification.permission !== 'granted') {
      if (reminders.length > 0) {
        console.log(`[Notifier] Skipping: Reminders=${reminders.length}, Permission=${Notification.permission}`);
      }
      return { sent: 0, skipped: reminders.length };
    }

    const lastNotificationTimes = JSON.parse(localStorage.getItem('lastNotificationTimes') || '{}');
    const now = new Date().getTime();
    let sentCount = 0;

    const remindersToNotify = reminders.filter(reminder => {
      if (ignoreCooldown) {
        return true; // Ignore cooldown for forced send
      }
      const lastTime = lastNotificationTimes[reminder.id];
      if (!lastTime) {
        return true; 
      }
      const hoursSinceLast = (now - lastTime) / (1000 * 60 * 60);
      return hoursSinceLast > cooldownHours;
    });

    if (remindersToNotify.length > 0) {
        console.log(`[Notifier] Found ${remindersToNotify.length} reminders to notify about.`, remindersToNotify.map(r => r.serviceType));
        
        for (const reminder of remindersToNotify) {
            const payload = {
                title: `${reminder.isOverdue ? 'Servicio Vencido' : 'Servicio Urgente'}: ${vehicle?.make}`,
                body: `${reminder.serviceType}`,
                icon: vehicle?.imageUrl || '/icon-192x192.png'
            };

            const res = await fetch('/api/send-push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, payload }),
            });

            if (res.ok) {
                sentCount++;
                if (!ignoreCooldown) {
                    lastNotificationTimes[reminder.id] = now;
                }
            } else {
                 console.error(`[Notifier] Backend failed to send notification for ${reminder.serviceType}.`, res.statusText);
            }
        }
        
        if (!ignoreCooldown) {
            localStorage.setItem('lastNotificationTimes', JSON.stringify(lastNotificationTimes));
            console.log('[Notifier] LocalStorage updated for sent notifications.');
        }
    } else {
        console.log('[Notifier] No new reminders to notify about at this time (all are within cooldown period).');
    }
    return { sent: sentCount, skipped: reminders.length - sentCount };
}


interface NotificationUIProps {
  onActivate: () => Promise<any>;
}

function NotificationUI({ onActivate }: NotificationUIProps) {
  const [notificationPermission, setNotificationPermission] = useState('default');
  const [showPermissionCard, setShowPermissionCard] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission);
      if (Notification.permission === 'default') {
        setShowPermissionCard(true);
      }
    }
  }, []);

  const handleRequestPermission = async () => {
    setIsSubscribing(true);
    try {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
        
        if (permission === 'granted') {
            await onActivate();
            toast({
                title: '¡Notificaciones Activadas!',
                description: 'Ahora recibirás alertas de mantenimiento.'
            })
            setShowPermissionCard(false);
        } else {
             toast({
                variant: 'destructive',
                title: 'Permiso Denegado',
                description: 'No podremos enviarte notificaciones.'
            })
        }

    } catch (error: any) {
        console.error('Error subscribing to push notifications:', error);
        toast({
            variant: 'destructive',
            title: 'Error de Suscripción',
            description: error.message || 'No se pudieron activar las notificaciones.'
        })
    } finally {
        setIsSubscribing(false);
    }
  };

  if (!isMounted || !showPermissionCard || notificationPermission === 'granted') {
    return null;
  }

  return (
      <div className="fixed bottom-4 right-4 z-50 w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BellRing /> Activar Notificaciones</CardTitle>
            <CardDescription>Recibe alertas sobre los servicios de mantenimiento importantes.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={handleRequestPermission} disabled={isSubscribing}>
                {isSubscribing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Activar
            </Button>
          </CardContent>
        </Card>
      </div>
  );
}

function NotificationManager() {
  const { selectedVehicle: vehicle, isLoading: isVehicleLoading } = useVehicles();
  const { user } = useUser();
  const firestore = useFirestore();
  const { urgencyThresholdDays, urgencyThresholdKm, notificationCooldownHours } = usePreferences();
  
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if ('serviceWorker' in navigator && !navigator.serviceWorker.controller) {
      navigator.serviceWorker.register('/sw.js').then(
        (registration) => {
          console.log('Service Worker registration successful with scope: ', registration.scope);
        },
        (err) => {
          console.log('Service Worker registration failed: ', err);
        }
      );
    }
    const interval = setInterval(() => {
      console.log('[Notifier] Periodic check triggered.');
      setTick(prev => prev + 1);
    }, 15 * 60 * 1000); 

    return () => clearInterval(interval);
  }, []);

  const lastFuelLogQuery = useMemoFirebase(() => {
    if (!user || !vehicle) return null;
    return query(
      collection(firestore, 'vehicles', vehicle.id, 'fuel_records'),
      orderBy('odometer', 'desc'),
      limit(1)
    );
  }, [firestore, user, vehicle]);

  const remindersQuery = useMemoFirebase(() => {
    if (!user || !vehicle) return null;
    return query(collection(firestore, 'vehicles', vehicle.id, 'service_reminders'));
  }, [firestore, user, vehicle]);

  const { data: lastFuelLogData, isLoading: isLoadingLastLog } = useCollection<ProcessedFuelLog>(lastFuelLogQuery);
  const { data: serviceReminders, isLoading: isLoadingReminders } = useCollection<ServiceReminder>(remindersQuery);
  
  const lastOdometer = useMemo(() => lastFuelLogData?.[0]?.odometer || 0, [lastFuelLogData]);

  const urgentReminders = useMemo((): ProcessedServiceReminder[] => {
    if (isVehicleLoading || isLoadingLastLog || isLoadingReminders || !serviceReminders || !lastOdometer) {
      return [];
    }
    
    return serviceReminders
      .filter(r => !r.isCompleted)
      .map(r => {
        const kmsRemaining = r.dueOdometer ? r.dueOdometer - lastOdometer : null;
        const daysRemaining = r.dueDate ? differenceInDays(new Date(r.dueDate), new Date()) : null;
        const isOverdue = (kmsRemaining !== null && kmsRemaining < 0) || (daysRemaining !== null && daysRemaining < 0);
        const isUrgent = !isOverdue && (
          (kmsRemaining !== null && kmsRemaining <= urgencyThresholdKm) ||
          (daysRemaining !== null && daysRemaining <= urgencyThresholdDays)
        );
        return { ...r, kmsRemaining, daysRemaining, isOverdue, isUrgent };
      }).filter(r => r.isOverdue || r.isUrgent);
  }, [serviceReminders, lastOdometer, urgencyThresholdKm, urgencyThresholdDays, isVehicleLoading, isLoadingLastLog, isLoadingReminders]);

  const handleActivation = useCallback(async () => {
    if (!user) throw new Error("Usuario no autenticado");
    const idToken = await user.getIdToken();
    await subscribeUserToPush(idToken);
  }, [user]);

  useEffect(() => {
    const runCheck = async () => {
        if (!user || !vehicle || urgentReminders.length === 0) return;
        console.log('[Notifier] Running periodic check...');
        await sendUrgentRemindersNotification(user.uid, urgentReminders, vehicle, notificationCooldownHours);
    }
    // Only run on initial load and on timer ticks
    if (tick > 0 || (lastOdometer > 0 && serviceReminders)) {
        runCheck();
    }
  }, [tick, user, vehicle, urgentReminders, notificationCooldownHours, lastOdometer, serviceReminders]);
  
  return <NotificationUI onActivate={handleActivation} />;
}

export default NotificationManager;
