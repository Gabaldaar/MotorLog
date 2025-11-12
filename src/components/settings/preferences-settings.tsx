
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
  
  const { selectedVehicle: vehicle } = useVehicles();
  const { user } = useUser();
  const { toast } = useToast();

  const [notificationPermission, setNotificationPermission] = useState('default');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const handleForceTestNotification = async () => {
    if (!('serviceWorker' in navigator)) {
        toast({ variant: 'destructive', title: 'Error', description: 'Service Workers no son soportados en este navegador.' });
        return;
    }
    
    setIsSending(true);

    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
            toast({ variant: 'destructive', title: 'No Suscrito', description: 'No estás suscrito a notificaciones. Por favor, activa las notificaciones primero.' });
            setIsSending(false);
            return;
        }

        const payload = {
            title: 'Notificación de Prueba',
            body: '¡Esto es una notificación enviada desde tu PWA!',
            icon: vehicle?.imageUrl || '/icon-192x192.png'
        };

        const res = await fetch('/api/send-push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription, payload }),
        });
        
        if (!res.ok) {
           const errorData = await res.json();
           throw new Error(errorData.error || 'Falló la respuesta del servidor');
        }

        const result = await res.json();
        
        if (result.success) {
            toast({ 
                title: '¡Solicitud Enviada!', 
                description: 'La notificación de prueba debería llegar en breve.'
            });
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
                <p><strong>Permiso del Navegador:</strong> {notificationPermission}</p>
            </div>
            <div className="flex gap-2 mt-4">
                <Button onClick={handleForceTestNotification} variant="outline" disabled={isSending || notificationPermission !== 'granted'}>
                    {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Enviar Notificación de Prueba
                </Button>
            </div>
             {notificationPermission !== 'granted' && (
                <p className="text-xs text-muted-foreground mt-2">
                  Debes activar las notificaciones para poder enviar una prueba.
                </p>
              )}
          </div>

        </div>
      </CardContent>
    </Card>
  );
}
