'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { useVehicles } from '@/context/vehicle-context';
import { usePreferences } from '@/context/preferences-context';
import type { ProcessedFuelLog, ProcessedServiceReminder, ServiceReminder } from '@/lib/types';
import { differenceInDays } from 'date-fns';
import { Button } from '../ui/button';
import { BellRing } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

const NOTIFICATION_COOLDOWN_HOURS = 24;

function NotificationManager() {
  const { selectedVehicle: vehicle } = useVehicles();
  const { user } = useUser();
  const firestore = useFirestore();
  const { urgencyThresholdDays, urgencyThresholdKm } = usePreferences();

  const [notificationPermission, setNotificationPermission] = useState('default');
  const [showPermissionCard, setShowPermissionCard] = useState(false);

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
      if (Notification.permission === 'default') {
        setShowPermissionCard(true);
      }
    }
  }, []);

  const handleRequestPermission = () => {
    Notification.requestPermission().then(permission => {
      setNotificationPermission(permission);
      setShowPermissionCard(false);
    });
  };
  
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

  const { data: lastFuelLogData } = useCollection<ProcessedFuelLog>(lastFuelLogQuery);
  const { data: serviceReminders } = useCollection<ServiceReminder>(remindersQuery);
  
  const lastOdometer = useMemo(() => lastFuelLogData?.[0]?.odometer || 0, [lastFuelLogData]);

  const processedReminders = useMemo((): ProcessedServiceReminder[] => {
    if (!serviceReminders || !lastOdometer) return [];
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
  }, [serviceReminders, lastOdometer, urgencyThresholdKm, urgencyThresholdDays]);

  useEffect(() => {
    if (notificationPermission !== 'granted' || processedReminders.length === 0) {
      return;
    }

    const checkAndNotify = () => {
      const now = new Date().getTime();
      const notifiedReminders = JSON.parse(localStorage.getItem('notifiedReminders') || '{}');

      processedReminders.forEach(reminder => {
        if (reminder.isUrgent || reminder.isOverdue) {
          const lastNotificationTime = notifiedReminders[reminder.id];
          const shouldNotify = !lastNotificationTime || (now - lastNotificationTime > NOTIFICATION_COOLDOWN_HOURS * 60 * 60 * 1000);

          if (shouldNotify) {
            const title = reminder.isOverdue ? 'Servicio Vencido' : 'Servicio Urgente';
            let body = `${reminder.serviceType} para tu ${vehicle?.make} ${vehicle?.model}.`;
            
            if (reminder.daysRemaining !== null && reminder.daysRemaining < 0) {
              body += ` Vencido hace ${Math.abs(reminder.daysRemaining)} días.`;
            } else if (reminder.kmsRemaining !== null && reminder.kmsRemaining < 0) {
              body += ` Vencido hace ${Math.abs(reminder.kmsRemaining).toLocaleString()} km.`;
            } else if (reminder.daysRemaining !== null && reminder.daysRemaining <= urgencyThresholdDays) {
              body += ` Faltan ${reminder.daysRemaining} días.`;
            } else if (reminder.kmsRemaining !== null && reminder.kmsRemaining <= urgencyThresholdKm) {
              body += ` Faltan ${reminder.kmsRemaining.toLocaleString()} km.`;
            }

            const notification = new Notification(title, {
              body,
              icon: '/icon-192x192.png',
              badge: '/icon-192x192.png',
              tag: reminder.id, // Use reminder id as tag to prevent duplicate notifications for the same service
            });

            notifiedReminders[reminder.id] = now;
          }
        }
      });

      localStorage.setItem('notifiedReminders', JSON.stringify(notifiedReminders));
    };

    checkAndNotify();

  }, [processedReminders, notificationPermission, vehicle]);

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
    )
  }

  return null; // This component does not render anything in the DOM itself
}

export default function ClientOnlyNotificationManager() {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null;
  }

  return <NotificationManager />;
}
