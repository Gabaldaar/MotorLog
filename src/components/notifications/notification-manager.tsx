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

export async function showNotification(title: string, options: NotificationOptions) {
  if (!('serviceWorker' in navigator)) {
    throw new Error("Service Worker not supported");
  }
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(title, options);
}

async function subscribeUserToPush(idToken: string) {
  if (!('serviceWorker' in navigator)) {
    throw new Error("Service Worker not supported");
  }
  
  const registration = await navigator.serviceWorker.ready;
  const existingSubscription = await registration.pushManager.getSubscription();

  if (existingSubscription) {
    console.log('[Push Manager] User is already subscribed.');
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
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify(subscription),
  });
  console.log('[Push Manager] User subscribed successfully.');
}

interface NotificationUIProps {
  reminders: ProcessedServiceReminder[];
  vehicle: Vehicle;
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

  if (!isMounted || !showPermissionCard) {
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
  // State to trigger re-evaluation
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(
        (registration) => {
          console.log('Service Worker registration successful with scope: ', registration.scope);
        },
        (err) => {
          console.log('Service Worker registration failed: ', err);
        }
      );
    }
     // Set up a timer to periodically re-check for notifications
    const interval = setInterval(() => {
      console.log('[Notifier] Periodic check triggered.');
      setTick(prev => prev + 1);
    }, 15 * 60 * 1000); // Every 15 minutes

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
  }, [serviceReminders, lastOdometer, urgencyThresholdKm, urgencyThresholdDays, isVehicleLoading, isLoadingLastLog, isLoadingReminders, tick]); // Add tick to dependencies

  const handleActivation = useCallback(async () => {
    if (!user) throw new Error("Usuario no autenticado");
    const idToken = await user.getIdToken();
    await subscribeUserToPush(idToken);
  }, [user]);

  // Effect to trigger notifications
  useEffect(() => {
    if (!user || urgentReminders.length === 0 || typeof window === 'undefined' || Notification.permission !== 'granted') {
      return;
    }

    const lastNotificationTimes = JSON.parse(localStorage.getItem('lastNotificationTimes') || '{}');
    const now = new Date().getTime();

    const remindersToNotify = urgentReminders.filter(reminder => {
      const lastTime = lastNotificationTimes[reminder.id];
      if (!lastTime) {
        console.log(`[Notifier] Reminder ${reminder.serviceType} has no last notification time. It's a candidate.`);
        return true; // Never notified
      }
      const hoursSinceLast = (now - lastTime) / (1000 * 60 * 60);
       if (hoursSinceLast > notificationCooldownHours) {
        console.log(`[Notifier] Reminder ${reminder.serviceType} was last notified ${hoursSinceLast.toFixed(1)} hours ago. It's a candidate.`);
        return true;
      }
      console.log(`[Notifier] Reminder ${reminder.serviceType} was notified recently. Skipping.`);
      return false;
    });

    if (remindersToNotify.length > 0) {
      console.log(`[Notifier] Found ${remindersToNotify.length} reminders to notify about.`, remindersToNotify.map(r => r.serviceType));
      const payload = {
        title: `Alerta de Mantenimiento para ${vehicle?.make} ${vehicle?.model}`,
        body: `Tienes ${remindersToNotify.length} servicio(s) que requieren tu atención.`,
        icon: vehicle?.imageUrl || '/icon-192x192.png'
      };

      fetch('/api/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, payload }),
      }).then((res) => {
        if(res.ok) {
            // Update notification times on success
            remindersToNotify.forEach(reminder => {
                lastNotificationTimes[reminder.id] = now;
            });
            localStorage.setItem('lastNotificationTimes', JSON.stringify(lastNotificationTimes));
            console.log('[Notifier] Notification request sent to backend and localStorage updated.');
        } else {
            console.error('[Notifier] Backend failed to send notification.', res.statusText);
        }
      }).catch(err => {
        console.error('[Notifier] Failed to send notification request:', err);
      });
    } else {
        console.log('[Notifier] No new reminders to notify about at this time.');
    }

  }, [urgentReminders, user, vehicle, notificationCooldownHours]);

  
  return <NotificationUI onActivate={handleActivation} reminders={urgentReminders} vehicle={vehicle as Vehicle} />;
}

export default NotificationManager;
