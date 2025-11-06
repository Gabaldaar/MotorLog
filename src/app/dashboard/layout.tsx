'use client';

import AppHeader from '@/components/layout/app-header';
import AppSidebar from '@/components/layout/app-sidebar';
import { Sidebar, SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { VehicleProvider } from '@/context/vehicle-context';
import { useUser } from '@/firebase/provider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { PreferencesProvider } from '@/context/preferences-context';

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
      <div className="flex h-screen w-screen items-center justify-center">
        Loading...
      </div>
    );
  }
  
  return (
    <VehicleProvider>
      <PreferencesProvider>
        <SidebarProvider>
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
