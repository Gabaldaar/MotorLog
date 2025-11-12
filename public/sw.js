// This is a basic service worker for handling push notifications.

self.addEventListener('push', event => {
  if (!event.data) {
    console.error('Push event but no data');
    return;
  }
  const data = event.data.json();

  const title = data.title || 'MotorLog';
  const options = {
    body: data.body,
    icon: data.icon || '/icon-192x192.png',
    badge: '/icon-96x96.png', // Badge for the notification bar
    vibrate: [200, 100, 200], // Vibration pattern
    tag: 'motorlog-notification', // Group notifications
    renotify: true, // Allow replacing old notifications
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close(); // Close the notification

  // Focus the app if it's already open, or open it if it's not.
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientsArr => {
      const hadWindowToFocus = clientsArr.some(windowClient =>
        windowClient.url.includes(self.location.origin) ? (windowClient.focus(), true) : false
      );

      if (!hadWindowToFocus) {
        clients.openWindow(self.location.origin).then(windowClient => windowClient ? windowClient.focus() : null);
      }
    })
  );
});
