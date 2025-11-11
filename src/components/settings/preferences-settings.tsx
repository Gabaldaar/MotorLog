
'use client';

import { usePreferences } from '@/context/preferences-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import type { ConsumptionUnit, ProcessedServiceReminder } from '@/lib/types';
import { Separator } from '../ui/separator';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { useEffect, useMemo, useState } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { useVehicles } from '@/context/vehicle-context';
import { collection, query, limit, orderBy } from 'firebase/firestore';
import { differenceInDays } from 'date-fns';


export default function PreferencesSettings() {
  const { 
    consumptionUnit, 
    setConsumptionUnit,
    urgencyThresholdDays,
    setUrgencyThresholdDays,
    urgencyThresholdKm,
    setUrgencyThresholdKm,
  } = usePreferences();
  
  const { selectedVehicle: vehicle, isLoading: isVehicleLoading } = useVehicles();
  const { user } = useUser();
  const firestore = useFirestore();

  const [notificationPermission, setNotificationPermission] = useState('default');
  const [dataIsReady, setDataIsReady] = useState(false);

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
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

  const { data: lastFuelLogData, isLoading: isLoadingLastLog } = useCollection(lastFuelLogQuery);
  const { data: serviceReminders, isLoading: isLoadingReminders } = useCollection(remindersQuery);
  
  const lastOdometer = useMemo(() => lastFuelLogData?.[0]?.odometer || 0, [lastFuelLogData]);

  useEffect(() => {
      setDataIsReady(!isVehicleLoading && !isLoadingLastLog && !isLoadingReminders && !!vehicle);
  }, [isVehicleLoading, isLoadingLastLog, isLoadingReminders, vehicle]);

  const urgentRemindersCount = useMemo(() => {
    if (!dataIsReady || !serviceReminders || lastOdometer <= 0) return 0;
    
    return serviceReminders
      .filter(r => !r.isCompleted)
      .filter(r => {
        const kmsRemaining = r.dueOdometer ? r.dueOdometer - lastOdometer : null;
        const daysRemaining = r.dueDate ? differenceInDays(new Date(r.dueDate), new Date()) : null;
        const isOverdue = (kmsRemaining !== null && kmsRemaining < 0) || (daysRemaining !== null && daysRemaining < 0);
        const isUrgent = !isOverdue && (
          (kmsRemaining !== null && kmsRemaining <= urgencyThresholdKm) ||
          (daysRemaining !== null && daysRemaining <= urgencyThresholdDays)
        );
        return isOverdue || isUrgent;
      }).length;
  }, [serviceReminders, lastOdometer, urgencyThresholdKm, urgencyThresholdDays, dataIsReady]);

  const handleForceTestNotification = async () => {
    console.log('Paso 1: Botón pulsado');
    try {
      console.log('Paso 2: Solicitando permiso...');
      const permission = await Notification.requestPermission();
      console.log(`Paso 3: Permiso obtenido: ${permission}`);
      setNotificationPermission(permission);

      if (permission === 'granted') {
        console.log('Paso 4: Esperando Service Worker...');
        const registration = await navigator.serviceWorker.ready;
        console.log('Paso 5: Service Worker listo.', registration);
        
        console.log('Paso 6: Mostrando notificación...');
        await registration.showNotification('Notificación de Prueba', {
          body: 'Si ves esto, ¡las notificaciones funcionan!',
          icon: '/icon-192x192.png',
        });
        console.log('Paso 7: Notificación mostrada (o falló en segundo plano).');
        alert('Se ha enviado la orden para mostrar la notificación. Si no aparece, revisa los permisos de notificación de tu sistema operativo o la consola del navegador en un PC.');

      } else {
        alert('El permiso para mostrar notificaciones fue denegado.');
      }
    } catch (error: any) {
      console.error('Error al intentar mostrar la notificación:', error);
      alert(`Error al intentar mostrar la notificación: ${error.message}`);
    }
  };

  const resetNotificationPermissions = () => {
      alert("Para reiniciar los permisos, debes hacerlo manualmente en la configuración de tu navegador para este sitio web. Busca el icono de candado en la barra de direcciones.");
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
            <Label className="text-base">Diagnóstico de Notificaciones</Label>
             <div className="text-sm space-y-1 mt-2 p-3 border rounded-md bg-muted/50">
                <p><strong>Estado de los datos:</strong> {dataIsReady ? 'listos' : 'cargando...'}</p>
                <p><strong>Permiso del Navegador:</strong> {notificationPermission}</p>
                <p><strong>Recordatorios Urgentes/Vencidos Encontrados:</strong> {urgentRemindersCount}</p>
            </div>
            <div className="flex gap-2 mt-4">
                <Button onClick={handleForceTestNotification} variant="outline">
                    Forzar Notificación de Prueba
                </Button>
                 <Button onClick={resetNotificationPermissions} variant="destructive">
                    Reiniciar Permisos
                </Button>
            </div>
          </div>

        </div>
      </CardContent>
    </Card>
  );
}
