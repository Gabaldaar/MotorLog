'use client';

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@/firebase';
import { Button } from '../ui/button';
import { BellRing, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { urlBase64ToUint8Array } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';


// This function will be called from other components to trigger the check
export const triggerRemindersCheck = async (vehicleId: string) => {
  if (!vehicleId) {
    console.error("Vehicle ID is required to check reminders.");
    return;
  }
  
  console.log(`Triggering reminder check for vehicle: ${vehicleId}`);
  
  try {
    const response = await fetch('/api/check-and-send-reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicleId }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to trigger reminder check.");
    }

    const result = await response.json();
    console.log("Reminder check API response:", result);
    return result;
  } catch (error: any) {
    console.error("Error triggering reminder check:", error.message);
  }
};


/**
 * Registers the service worker.
 * @returns {Promise<ServiceWorkerRegistration>}
 */
async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error("Service Workers no son soportados.");
  }
  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log("Service Worker registrado correctamente.");
    return registration;
  } catch (error) {
    console.error("Fallo el registro del Service Worker:", error);
    throw new Error("Fallo el registro del Service Worker.");
  }
}

/**
 * Creates a subscription and sends it to the server.
 * @param {string} idToken - The Firebase auth ID token for the user.
 */
async function subscribeAndSync(idToken: string): Promise<void> {
  if (!('PushManager' in window)) {
    throw new Error("Push notifications no son soportadas.");
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      throw new Error("Falta la clave de configuración de notificaciones.");
    }
    console.log("Creando nueva suscripción...");
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  } else {
    console.log("Usando suscripción existente.");
  }

  const response = await fetch('/api/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify(subscription),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to sync subscription with server.');
  }
  console.log("Suscripción sincronizada con el servidor.");
}


// --- UI COMPONENT ---

function NotificationUI() {
  const [notificationPermission, setNotificationPermission] = useState('default');
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { toast } = useToast();
  const { user } = useUser();

  useEffect(() => {
    setIsMounted(true);
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const handleRequestAndSubscribe = async () => {
    if (!user) {
        toast({ variant: 'destructive', title: 'Error', description: 'Debes iniciar sesión para activar notificaciones.' });
        return;
    }

    setIsSubscribing(true);
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);

      if (permission === 'granted') {
        toast({ title: '¡Permiso Concedido!', description: 'Sincronizando con el servidor...' });
        const idToken = await user.getIdToken();
        await subscribeAndSync(idToken);
        toast({ title: '¡Notificaciones Activadas!', description: 'Todo listo para recibir alertas.' });
      } else {
        toast({ variant: 'destructive', title: 'Permiso Denegado', description: 'No podremos enviarte notificaciones.' });
      }
    } catch (error: any) {
      console.error('Error durante el proceso de suscripción:', error);
      toast({ variant: 'destructive', title: 'Error de Suscripción', description: error.message });
    } finally {
      setIsSubscribing(false);
    }
  };

  if (!isMounted || notificationPermission !== 'default') {
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
          <Button className="w-full" onClick={handleRequestAndSubscribe} disabled={isSubscribing}>
            {isSubscribing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Activar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}


// --- MAIN COMPONENT ---

export default function NotificationManager() {
  const { user, isUserLoading } = useUser();

  useEffect(() => {
    const autoProcess = async () => {
      if (user && 'serviceWorker' in navigator && 'PushManager' in window) {
        await registerServiceWorker();
        if (Notification.permission === 'granted') {
          console.log("Permiso concedido. Intentando suscribir y sincronizar...");
          try {
            const idToken = await user.getIdToken();
            await subscribeAndSync(idToken);
          } catch (error) {
            console.error("Auto-suscripción falló:", error);
          }
        }
      }
    };

    if (!isUserLoading) {
      autoProcess();
    }
  }, [user, isUserLoading]);

  return <NotificationUI />;
}

    