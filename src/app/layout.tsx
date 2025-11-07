import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseClientProvider } from '@/firebase/client-provider';

export const metadata: Metadata = {
  title: 'MotorLog',
  description: 'Intelligent fuel and vehicle management',
  icons: {
    icon: [
      { url: '/favicon.png?v=3' },
      { url: '/favicon.png?v=3', sizes: '16x16', type: 'image/png' },
      { url: '/favicon.png?v=3', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/favicon.png?v=3' }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Alegreya:ital,wght@0,400..900;1,400..900&family=Belleza&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
          <FirebaseClientProvider>
            {children}
          </FirebaseClientProvider>
          <Toaster />
      </body>
    </html>
  );
}
