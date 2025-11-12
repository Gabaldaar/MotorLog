'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { useVehicles } from '@/context/vehicle-context';
import { usePreferences } from '@/context/preferences-context';
import type { ProcessedFuelLog, ProcessedServiceReminder, ServiceReminder, Vehicle } from '@/lib/types';
import { differenceInDays } from 'date-fns';
import { Button } from '../ui/button';
import { BellRing, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import dynamic from 'next/dynamic';
import { urlBase64ToUint8Array } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const NOTIFICATION_COOLDOWN_HOURS = 48;

async function subscribeUserToPush() {
  if (!('serviceWorker' in navigator)) {
    throw new Error("Service Worker not supported");
  }
  
  const registration = await navigator.serviceWorker.ready;
  const existingSubscription = await registration.pushManager.getSubscription();

  if (existingSubscription) {
    console.log('[Push Manager] User is already subscribed.');
    return existingSubscription;
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

  // Send the new subscription to the backend
  await fetch('/api/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(subscription),
  });
  console.log('[Push Manager] User subscribed successfully.');
  return subscription;
}

interface NotificationUIProps {
  reminders: ProcessedServiceReminder[];
  vehicle: Vehicle;
  onActivate: () => Promise<any>;
}

function NotificationUI({ reminders, vehicle, onActivate }: NotificationUIProps) {
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

    } catch (error) {
        console.error('Error subscribing to push notifications:', error);
        toast({
            variant: 'destructive',
            title: 'Error de Suscripción',
            description: 'No se pudieron activar las notificaciones.'
        })
    } finally {
        setIsSubscribing(false);
    }
  };

  if (!isMounted) {
    return null;
  }

  // TODO: Add logic to send notifications to backend API to be triggered.

  if (notificationPermission === 'default' && showPermissionCard) {
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

  return null;
}

function NotificationManager() {
  const { selectedVehicle: vehicle, isLoading: isVehicleLoading } = useVehicles();
  const { user } = useUser();
  const firestore = useFirestore();
  const { urgencyThresholdDays, urgencyThresholdKm } = usePreferences();
  const [dataIsReadyForUI, setDataIsReadyForUI] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator && window.serwist) {
        window.serwist.register();
    }
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

  useEffect(() => {
      const isReady = !isVehicleLoading && !isLoadingLastLog && !isLoadingReminders && !!vehicle;
      if (isReady && !dataIsReadyForUI) {
        setDataIsReadyForUI(true);
      } else if (!isReady && dataIsReadyForUI) {
        setDataIsReadyForUI(false);
      }
  }, [isVehicleLoading, isLoadingLastLog, isLoadingReminders, vehicle, dataIsReadyForUI]);


  const processedReminders = useMemo((): ProcessedServiceReminder[] => {
    if (!dataIsReadyForUI || !serviceReminders || !lastOdometer) {
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
      });
  }, [serviceReminders, lastOdometer, urgencyThresholdKm, urgencyThresholdDays, dataIsReadyForUI]);

  if (!dataIsReadyForUI) {
    return null;
  }

  const urgentReminders = processedReminders.filter(r => r.isOverdue || r.isUrgent);
  
  return <NotificationUI reminders={urgentReminders} vehicle={vehicle as Vehicle} onActivate={subscribeUserToPush} />;
}

const ClientOnlyNotificationManager = dynamic(() => Promise.resolve(NotificationManager), {
  ssr: false,
});

export default ClientOnlyNotificationManager;