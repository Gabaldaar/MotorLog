'use client';

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@/firebase';
import { Button } from '../ui/button';
import { BellRing, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { urlBase64ToUint8Array } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// --- MAIN FUNCTIONS ---

/**
 * Registers the service worker and subscribes the user to push notifications.
 * It's designed to be called when the app loads or when permission is granted.
 * @returns {Promise<PushSubscription | null>} The subscription object or null if failed.
 */
async function subscribeUser(): Promise<PushSubscription | null> {
  // 1. Check for browser support
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.error("Push notifications are not supported by this browser.");
    throw new Error("Push notifications no son soportadas.");
  }

  // 2. Register the service worker
  try {
    await navigator.serviceWorker.register('/sw.js');
    console.log("Service Worker registered successfully.");
  } catch (error) {
    console.error("Service Worker registration failed:", error);
    throw new Error("Falló el registro del Service Worker.");
  }

  // 3. Wait for the service worker to be ready
  const registration = await navigator.serviceWorker.ready;
  
  // 4. Check for an existing subscription
  let subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    console.log("User IS already subscribed.");
    return subscription;
  }

  // 5. If not subscribed, create a new subscription
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    console.error("VAPID public key is not defined.");
    throw new Error("Falta la clave de configuración de notificaciones.");
  }

  try {
    console.log("User is NOT subscribed. Subscribing now...");
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    console.log("User subscribed successfully:", subscription);
    return subscription;
  } catch (error) {
    console.error("Failed to subscribe the user:", error);
    throw new Error("No se pudo suscribir al usuario a las notificaciones.");
  }
}

/**
 * Sends the subscription object to the backend API to be saved.
 * @param {PushSubscription} subscription - The subscription object from the browser.
 * @param {string} idToken - The Firebase auth ID token for the user.
 */
async function syncSubscriptionWithServer(subscription: PushSubscription, idToken: string): Promise<void> {
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
  console.log("Subscription synced successfully with the server.");
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
      // Step 1: Request permission from the user
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);

      if (permission === 'granted') {
        toast({ title: '¡Permiso Concedido!', description: 'Sincronizando con el servidor...' });

        // Step 2: Subscribe and sync
        const subscription = await subscribeUser();
        if (subscription) {
          const idToken = await user.getIdToken();
          await syncSubscriptionWithServer(subscription, idToken);
          toast({ title: '¡Notificaciones Activadas!', description: 'Todo listo para recibir alertas.' });
        } else {
           throw new Error('No se pudo obtener la suscripción.');
        }

      } else {
        toast({ variant: 'destructive', title: 'Permiso Denegado', description: 'No podremos enviarte notificaciones.' });
      }
    } catch (error: any) {
      console.error('Error during subscription process:', error);
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

  // Effect to automatically subscribe if permission is already granted
  useEffect(() => {
    const autoSubscribe = async () => {
      if (user && Notification.permission === 'granted') {
        console.log("Permission already granted. Attempting to subscribe and sync...");
        try {
          const subscription = await subscribeUser();
          if (subscription) {
            const idToken = await user.getIdToken();
            await syncSubscriptionWithServer(subscription, idToken);
          }
        } catch (error) {
          console.error("Auto-subscription failed:", error);
          // Don't show a toast here to avoid bothering the user on every load
        }
      }
    };

    if (!isUserLoading) {
      autoSubscribe();
    }
  }, [user, isUserLoading]);

  return <NotificationUI />;
}

// These functions are exported for use in the settings page
export { subscribeUser, syncSubscriptionWithServer };
