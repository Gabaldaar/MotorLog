
'use client';

import { usePreferences } from '@/context/preferences-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import type { ConsumptionUnit, ProcessedServiceReminder, ServiceReminder, Vehicle } from '@/lib/types';
import { Separator } from '../ui/separator';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { useEffect, useMemo, useState } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { useVehicles } from '@/context/vehicle-context';
import { collection, query, limit, orderBy } from 'firebase/firestore';
import { differenceInDays } from 'date-fns';
import { sendUrgentRemindersNotification } from '../notifications/notification-manager';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';


export default function PreferencesSettings() {
  const { 
    consumptionUnit, 
    setConsumptionUnit,
    urgencyThresholdDays,
    setUrgencyThresholdDays,
    urgencyThresholdKm,
    setUrgencyThresholdKm,
    notificationCooldownHours,
    setNotificationCooldownHours,
  } = usePreferences();
  
  const { selectedVehicle: vehicle, isLoading: isVehicleLoading } = useVehicles();
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [notificationPermission, setNotificationPermission] = useState('default');
  const [dataIsReady, setDataIsReady] = useState(false);
  const [isSending, setIsSending] = useState(false);

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
  const { data: serviceReminders, isLoading: isLoadingReminders } = useCollection<ServiceReminder>(remindersQuery);
  
  const lastOdometer = useMemo(() => lastFuelLogData?.[0]?.odometer || 0, [lastFuelLogData]);

  useEffect(() => {
      setDataIsReady(!isVehicleLoading && !isLoadingLastLog && !isLoadingReminders && !!vehicle);
  }, [isVehicleLoading, isLoadingLastLog, isLoadingReminders, vehicle]);

  const urgentReminders: ProcessedServiceReminder[] = useMemo(() => {
    if (!dataIsReady || !serviceReminders || !lastOdometer) return [];
    
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
      })
      .filter(r => r.isOverdue || r.isUrgent);
  }, [serviceReminders, lastOdometer, urgencyThresholdKm, urgencyThresholdDays, dataIsReady]);

  const handleForceTestNotification = async () => {
    if (!user || !vehicle) {
        toast({ variant: 'destructive', title: 'Error', description: 'Selecciona un vehículo e inicia sesión.'});
        return;
    }
    if (urgentReminders.length === 0) {
        toast({ title: 'Nada que notificar', description: 'No se encontraron servicios urgentes o vencidos en este momento.'});
        return;
    }

    setIsSending(true);
    try {
        const results = await sendUrgentRemindersNotification(user.uid, urgentReminders, vehicle, notificationCooldownHours, true);
        
        if (!Array.isArray(results)) {
          throw new Error("La respuesta del servidor no fue la esperada.");
        }

        const sentCount = results.reduce((acc, r) => acc + (r.sent || 0), 0);
        const expiredCount = results.reduce((acc, r) => acc + (r.expired || 0), 0);

        if (sentCount > 0 || expiredCount > 0) {
            toast({ 
                title: 'Respuesta del Servidor', 
                description: `Enviados: ${sentCount}, Suscripciones Expiradas/Eliminadas: ${expiredCount}.`
            });
        } else {
             toast({ title: 'Nada para enviar', description: 'No se encontraron suscripciones activas para enviar notificaciones.'});
        }
    } catch (error: any) {
        console.error('Error al forzar notificación:', error);
        toast({ variant: 'destructive', title: 'Error de Envío', description: error.message });
    } finally {
        setIsSending(false);
    }
  };


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
            <Label className="text-base">Alertas de Notificaciones</Label>
            <p className="text-sm text-muted-foreground mb-4">
              Controla la frecuencia de las notificaciones push.
            </p>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <Label htmlFor="notification-cooldown">Horas entre notificaciones</Label>
                    <Input 
                        id="notification-cooldown"
                        type="number"
                        value={notificationCooldownHours}
                        onChange={(e) => setNotificationCooldownHours(Number(e.target.value))}
                        placeholder="Ej: 48"
                    />
                     <p className="text-xs text-muted-foreground mt-1">
                        Tiempo de espera para volver a notificar un mismo servicio vencido.
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
                <p><strong>Recordatorios Urgentes/Vencidos Encontrados:</strong> {urgentReminders.length}</p>
            </div>
            <div className="flex gap-2 mt-4">
                <Button onClick={handleForceTestNotification} variant="outline" disabled={isSending}>
                    {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Forzar Envío de Notificaciones
                </Button>
            </div>
          </div>

        </div>
      </CardContent>
    </Card>
  );
}

    