
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { useVehicles } from '@/context/vehicle-context';
import { usePreferences } from '@/context/preferences-context';
import type { ProcessedFuelLog, ProcessedServiceReminder, ServiceReminder, Vehicle } from '@/lib/types';
import { differenceInDays } from 'date-fns';
import { Button } from '../ui/button';
import { BellRing } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import dynamic from 'next/dynamic';

const NOTIFICATION_COOLDOWN_HOURS = 48;

interface NotificationUIProps {
  reminders: ProcessedServiceReminder[];
  vehicle: Vehicle;
}

function NotificationUI({ reminders, vehicle }: NotificationUIProps) {
  const [notificationPermission, setNotificationPermission] = useState('default');
  const [showPermissionCard, setShowPermissionCard] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission);
      if (Notification.permission === 'default') {
        setShowPermissionCard(true);
      }
    }
  }, []);

  const handleRequestPermission = () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      Notification.requestPermission().then(permission => {
        setNotificationPermission(permission);
        setShowPermissionCard(false);
      });
    }
  };
  
  const showNotification = async (title: string, options: NotificationOptions) => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('Notification' in window)) {
      console.warn('[Notificaciones] El navegador no soporta notificaciones o service workers.');
      return;
    }
    
    if (Notification.permission !== 'granted') {
      console.warn('[Notificaciones] Permiso no otorgado.');
      return;
    }
    
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, options);
    } catch (err) {
      console.error("[Notificaciones] Error al mostrar vía Service Worker: ", err);
    }
  }

  useEffect(() => {
    if (!isMounted || notificationPermission !== 'granted' || reminders.length === 0 || !vehicle) {
      return;
    }
    
    const sendNotifications = async () => {
        try {
          const now = new Date().getTime();
          const notifiedReminders = JSON.parse(localStorage.getItem('notifiedReminders') || '{}');

          for (const reminder of reminders) {
            if (reminder.isUrgent || reminder.isOverdue) {
              const lastNotificationTime = notifiedReminders[reminder.id];
              const shouldNotify = !lastNotificationTime || now - lastNotificationTime > NOTIFICATION_COOLDOWN_HOURS * 60 * 60 * 1000;

              if (shouldNotify) {
                const title = reminder.isOverdue ? 'Servicio Vencido' : 'Servicio Urgente';
                let body = `${reminder.serviceType} para tu ${vehicle.make} ${vehicle.model}.`;

                if (reminder.daysRemaining !== null && reminder.daysRemaining < 0) {
                  body += ` Vencido hace ${Math.abs(reminder.daysRemaining)} días.`;
                } else if (reminder.kmsRemaining !== null && reminder.kmsRemaining < 0) {
                  body += ` Vencido hace ${Math.abs(reminder.kmsRemaining).toLocaleString()} km.`;
                } else if (reminder.daysRemaining !== null) {
                  body += ` Faltan ${reminder.daysRemaining} días.`;
                } else if (reminder.kmsRemaining !== null) {
                  body += ` Faltan ${reminder.kmsRemaining.toLocaleString()} km.`;
                }
                
                await showNotification(title, {
                  body,
                  icon: '/icon-192x192.png',
                  badge: '/icon-192x192.png',
                  tag: reminder.id,
                });

                notifiedReminders[reminder.id] = now;
              }
            }
          }
          localStorage.setItem('notifiedReminders', JSON.stringify(notifiedReminders));
        } catch (error) {
            console.error("[Notificaciones] Error al procesar y enviar notificaciones:", error);
        }
    };
    
    sendNotifications();

  }, [reminders, vehicle, notificationPermission, isMounted]);

  if (!isMounted) {
    return null;
  }

  if (notificationPermission === 'default' && showPermissionCard) {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BellRing /> Activar Notificaciones</CardTitle>
            <CardDescription>Recibe alertas sobre los servicios de mantenimiento importantes.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={handleRequestPermission}>Activar</Button>
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
      const isReady = !isVehicleLoading && !isLoadingLastLog && !isLoadingReminders && !!vehicle && lastOdometer > 0;
      if (isReady && !dataIsReadyForUI) {
        setDataIsReadyForUI(true);
      } else if (!isReady && dataIsReadyForUI) {
        // Reset if data becomes not ready (e.g. vehicle change)
        setDataIsReadyForUI(false);
      }
  }, [isVehicleLoading, isLoadingLastLog, isLoadingReminders, vehicle, lastOdometer, dataIsReadyForUI]);


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
  
  return <NotificationUI reminders={urgentReminders} vehicle={vehicle as Vehicle} />;
}

const ClientOnlyNotificationManager = dynamic(() => Promise.resolve(NotificationManager), {
  ssr: false,
});

export default ClientOnlyNotificationManager;
