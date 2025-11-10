'use client';

import AppHeader from '@/components/layout/app-header';
import AppSidebar from '@/components/layout/app-sidebar';
import { Sidebar, SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { VehicleProvider } from '@/context/vehicle-context';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { FirebaseClientProvider } from '@/firebase';
import { PreferencesProvider } from '@/context/preferences-context';
import { Loader2 } from 'lucide-react';
import ClientOnlyNotificationManager from '@/components/notifications/notification-manager';

function DashboardLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  if (isUserLoading || !user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }
  
  return (
    <VehicleProvider>
      <PreferencesProvider>
        <SidebarProvider>
        <ClientOnlyNotificationManager />
        <div className="relative flex h-screen w-full flex-col overflow-hidden">
            <Sidebar>
            <AppSidebar />
            </Sidebar>
            <SidebarInset>
            <AppHeader />
            <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 bg-background">
                {children}
            </main>
            </SidebarInset>
        </div>
        </SidebarProvider>
      </PreferencesProvider>
    </VehicleProvider>
  );
}


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FirebaseClientProvider>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </FirebaseClientProvider>
  );
}
