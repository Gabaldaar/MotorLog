
'use client';

import { usePreferences } from '@/context/preferences-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import type { ConsumptionUnit } from '@/lib/types';
import { Separator } from '../ui/separator';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { BellRing, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, limit, orderBy } from 'firebase/firestore';
import { useVehicles } from '@/context/vehicle-context';
import { useEffect, useMemo, useState } from 'react';
import type { ProcessedFuelLog, ServiceReminder, ProcessedServiceReminder } from '@/lib/types';
import { differenceInDays } from 'date-fns';

function NotificationDiagnostics() {
  const { selectedVehicle } = useVehicles();
  const { user } = useUser();
  const firestore = useFirestore();
  const { urgencyThresholdDays, urgencyThresholdKm } = usePreferences();
  const [dataReady, setDataReady] = useState(false);
  const [permission, setPermission] = useState('default');
  const [urgentRemindersCount, setUrgentRemindersCount] = useState(0);

  const lastFuelLogQuery = useMemoFirebase(() => {
    if (!user || !selectedVehicle) return null;
    return query(collection(firestore, 'vehicles', selectedVehicle.id, 'fuel_records'), orderBy('odometer', 'desc'), limit(1));
  }, [firestore, user, selectedVehicle]);

  const remindersQuery = useMemoFirebase(() => {
    if (!user || !selectedVehicle) return null;
    return query(collection(firestore, 'vehicles', selectedVehicle.id, 'service_reminders'));
  }, [firestore, user, selectedVehicle]);

  const { data: lastFuelLogData, isLoading: isLoadingLastLog } = useCollection<ProcessedFuelLog>(lastFuelLogQuery);
  const { data: serviceReminders, isLoading: isLoadingReminders } = useCollection<ServiceReminder>(remindersQuery);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    const lastOdometer = lastFuelLogData?.[0]?.odometer || 0;
    const allDataIsLoaded = !isLoadingReminders && !isLoadingLastLog && !!selectedVehicle && lastOdometer > 0;
    setDataReady(allDataIsLoaded);

    if (allDataIsLoaded && serviceReminders) {
      const processed = serviceReminders
        .filter(r => !r.isCompleted)
        .map(r => {
          const kmsRemaining = r.dueOdometer ? r.dueOdometer - lastOdometer : null;
          const daysRemaining = r.dueDate ? differenceInDays(new Date(r.dueDate), new Date()) : null;
          const isOverdue = (kmsRemaining !== null && kmsRemaining < 0) || (daysRemaining !== null && daysRemaining < 0);
          const isUrgent = !isOverdue && ((kmsRemaining !== null && kmsRemaining <= urgencyThresholdKm) || (daysRemaining !== null && daysRemaining <= urgencyThresholdDays));
          return { ...r, isOverdue, isUrgent };
        });
      setUrgentRemindersCount(processed.filter(r => r.isOverdue || r.isUrgent).length);
    }
  }, [isLoadingReminders, isLoadingLastLog, selectedVehicle, lastFuelLogData, serviceReminders, urgencyThresholdDays, urgencyThresholdKm]);

  const showNotification = (title: string, options: NotificationOptions) => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(title, options);
      }).catch(err => {
         console.error('Service Worker not ready for notification:', err);
         // Fallback for environments where SW might fail but notifications are supported
         new Notification(title, options);
      });
    } else {
      // Fallback for non-PWA contexts or if Service Worker isn't ready
      new Notification(title, options);
    }
  };


  const forceTestNotification = async () => {
    if (typeof window === 'undefined' || !('Notification' in window) || !navigator.serviceWorker) {
      alert('Las notificaciones no son compatibles con este navegador.');
      return;
    }

    let currentPermission = Notification.permission;
    
    if (currentPermission === 'default') {
      currentPermission = await Notification.requestPermission();
      setPermission(currentPermission);
    }

    if (currentPermission === 'granted') {
      showNotification('Notificación de Prueba', {
        body: 'Si ves esto, el sistema de notificaciones funciona.',
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png'
      });
    } else if (currentPermission === 'denied') {
      alert('Permiso de notificaciones denegado. Debes cambiarlo en la configuración de tu navegador para este sitio.');
    }
  };

  return (
    <div className="space-y-4">
      <Label className="text-base">Diagnóstico de Notificaciones</Label>
      <div className="p-4 border rounded-lg bg-muted/40 text-sm space-y-2">
        <p>Estado de los datos: <span className={`font-semibold ${dataReady ? 'text-green-600' : 'text-amber-600'}`}>{dataReady ? 'Listos' : 'Cargando...'}</span></p>
        <p>Permiso del Navegador: <span className="font-semibold">{permission}</span></p>
        <p>Recordatorios Urgentes/Vencidos Encontrados: <span className="font-semibold">{urgentRemindersCount}</span></p>
      </div>
      <Button variant="secondary" onClick={forceTestNotification}>
        <Send className="mr-2 h-4 w-4" />
        Forzar Notificación de Prueba
      </Button>
    </div>
  );
}


export default function PreferencesSettings() {
  const { 
    consumptionUnit, 
    setConsumptionUnit,
    urgencyThresholdDays,
    setUrgencyThresholdDays,
    urgencyThresholdKm,
    setUrgencyThresholdKm,
  } = usePreferences();
  const { toast } = useToast();

  const handleResetNotifications = () => {
    try {
        localStorage.removeItem('notifiedReminders');
        toast({
            title: 'Notificaciones Reiniciadas',
            description: 'El sistema volverá a evaluar todos los recordatorios en la próxima carga.',
        });
    } catch (error) {
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'No se pudo reiniciar el estado de las notificaciones.',
        });
        console.error("Error resetting notification state:", error);
    }
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Preferencias de Visualización</CardTitle>
        <CardDescription>
          Elige cómo quieres ver los datos y recibir alertas en la aplicación.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div>
            <Label className="text-base">Unidad de Consumo</Label>
            <p className="text-sm text-muted-foreground mb-2">
              Selecciona el formato para mostrar el consumo de combustible.
            </p>
            <RadioGroup
              value={consumptionUnit}
              onValueChange={(value: ConsumptionUnit) => setConsumptionUnit(value)}
              className="grid grid-cols-2 gap-4"
            >
              <Label
                htmlFor="km/L"
                className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-primary"
              >
                <RadioGroupItem value="km/L" id="km/L" className="sr-only" />
                <span className="text-xl font-semibold">Km/L</span>
                <span className="text-xs text-muted-foreground">Kilómetros por Litro</span>
              </Label>
              <Label
                htmlFor="L/100km"
                className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-primary"
              >
                <RadioGroupItem value="L/100km" id="L/100km" className="sr-only" />
                 <span className="text-xl font-semibold">L/100km</span>
                 <span className="text-xs text-muted-foreground">Litros cada 100 Km</span>
              </Label>
            </RadioGroup>
          </div>
          
          <Separator />

          <div>
            <Label className="text-base">Umbrales de Alerta de Servicio</Label>
            <p className="text-sm text-muted-foreground mb-4">
              Configura cuándo un servicio se considera "urgente".
            </p>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <Label htmlFor="threshold-km">Kilómetros antes</Label>
                    <Input 
                        id="threshold-km"
                        type="number"
                        value={urgencyThresholdKm}
                        onChange={(e) => setUrgencyThresholdKm(Number(e.target.value))}
                        placeholder="Ej: 1000"
                    />
                     <p className="text-xs text-muted-foreground mt-1">
                        Avisar cuando falten menos de estos km.
                    </p>
                </div>
                 <div>
                    <Label htmlFor="threshold-days">Días antes</Label>
                    <Input 
                        id="threshold-days"
                        type="number"
                        value={urgencyThresholdDays}
                        onChange={(e) => setUrgencyThresholdDays(Number(e.target.value))}
                        placeholder="Ej: 15"
                    />
                     <p className="text-xs text-muted-foreground mt-1">
                        Avisar cuando falten menos de estos días.
                    </p>
                </div>
            </div>
          </div>
          
          <Separator />

           <div>
            <Label className="text-base">Gestión de Notificaciones</Label>
            <p className="text-sm text-muted-foreground mb-4">
              Si no estás recibiendo alertas para servicios existentes, puedes forzar un reinicio.
            </p>
            <Button variant="outline" onClick={handleResetNotifications}>
                <BellRing className="mr-2 h-4 w-4" />
                Reiniciar notificaciones
            </Button>
          </div>

          <Separator />

          <NotificationDiagnostics />

        </div>
      </CardContent>
    </Card>
  );
}
