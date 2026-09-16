'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Car, Fuel, Menu, LogOut, Settings, Wrench, History, Route, BarChart } from 'lucide-react';
import { useAuth, useUser, useFirestore, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { signOut } from 'firebase/auth';
import type { User, ServiceReminder, Trip, ProcessedFuelLog } from '@/lib/types';
import { doc, collection, query, where, orderBy, limit } from 'firebase/firestore';
import Image from 'next/image';
import { useMemo } from 'react';
import { useVehicles } from '@/context/vehicle-context';
import { differenceInDays } from 'date-fns';

import {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
  useSidebar,
  SidebarMenuBadge,
  SidebarRail,
} from '@/components/ui/sidebar';
import { Button } from '../ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const menuItems = [
  { href: '/dashboard', label: 'Inicio', icon: Menu },
  { href: '/dashboard/logs', label: 'Registros', icon: Fuel },
  { href: '/dashboard/services', label: 'Servicios', icon: Wrench },
  { href: '/dashboard/history', label: 'Historial', icon: History },
  { href: '/dashboard/trips', label: 'Viajes', icon: Route },
  { href: '/dashboard/reports', label: 'Informes', icon: BarChart },
  { href: '/dashboard/vehicles', label: 'Vehículos', icon: Car },
  { href: '/dashboard/settings', label: 'Configuración', icon: Settings },
];

function UserInfo() {
  const auth = useAuth();
  const { user: authUser } = useUser();
  const firestore = useFirestore();
  const router = useRouter();

  const userProfileRef = useMemoFirebase(() => {
    if (!authUser) return null;
    return doc(firestore, 'users', authUser.uid);
  }, [firestore, authUser]);

  const { data: userProfile } = useDoc<User>(userProfileRef);
  
  const handleSignOut = () => {
    if (auth) {
        signOut(auth);
        router.push('/login');
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return '?';
    return name.split(' ').filter(Boolean).map(n => n[0]).join('').substring(0, 2).toUpperCase() || '?';
  }

  if (!authUser) return null;

  const displayName = userProfile?.username || authUser.displayName || authUser.email?.split('@')[0] || 'Usuario';

  return (
    <div className='flex items-center gap-2 px-1'>
      <Avatar className='h-8 w-8 shrink-0'>
        <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
      </Avatar>
      <div className='flex flex-col text-sm truncate flex-1'>
        <span className='font-semibold text-sidebar-foreground truncate'>{displayName}</span>
        <span className='text-[10px] text-muted-foreground truncate'>{authUser.email}</span>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" title="Cerrar sesión" className='h-8 w-8 shrink-0 hover:text-destructive'>
            <LogOut className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <LogOut className="h-5 w-5 text-destructive" />
              ¿Cerrar sesión?
            </AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas salir de tu cuenta en MotorLog?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSignOut} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Cerrar sesión
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default function AppSidebar() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const { selectedVehicle } = useVehicles();
  const firestore = useFirestore();

  const activeTripsQuery = useMemoFirebase(() => {
    if (!selectedVehicle) return null;
    return query(
      collection(firestore, 'vehicles', selectedVehicle.id, 'trips'),
      where('status', '==', 'active')
    );
  }, [firestore, selectedVehicle]);
  const { data: activeTrips } = useCollection<Trip>(activeTripsQuery);

  const pendingRemindersQuery = useMemoFirebase(() => {
    if (!selectedVehicle) return null;
    return query(
      collection(firestore, 'vehicles', selectedVehicle.id, 'service_reminders'),
      where('isCompleted', '==', false)
    );
  }, [firestore, selectedVehicle]);
  const { data: pendingReminders } = useCollection<ServiceReminder>(pendingRemindersQuery);

  const lastFuelLogQuery = useMemoFirebase(() => {
    if (!selectedVehicle) return null;
    return query(
      collection(firestore, 'vehicles', selectedVehicle.id, 'fuel_records'),
      orderBy('odometer', 'desc'),
      limit(1)
    );
  }, [firestore, selectedVehicle]);
  const { data: lastFuelLog } = useCollection<ProcessedFuelLog>(lastFuelLogQuery);
  const lastOdometer = lastFuelLog?.[0]?.odometer || 0;

  const overdueServicesCount = useMemo(() => {
    if (!pendingReminders || !lastOdometer) return 0;
    
    return pendingReminders.filter(r => {
      const kmsRemaining = r.dueOdometer ? r.dueOdometer - lastOdometer : null;
      const daysRemaining = r.dueDate ? differenceInDays(new Date(r.dueDate), new Date()) : null;
      return (kmsRemaining !== null && kmsRemaining < 0) || (daysRemaining !== null && daysRemaining < 0);
    }).length;
  }, [pendingReminders, lastOdometer]);

  const activeTripsCount = activeTrips?.length || 0;

  const handleLinkClick = () => {
    setOpenMobile(false);
  };

  return (
    <>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
            <Image src="/icon-192x192.png" alt="MotorLog Logo" width={24} height={24} className="size-6 shrink-0" />
            <h1 className="font-headline text-xl font-semibold truncate">MotorLog</h1>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {menuItems.map((item) => {
            let badgeCount = 0;
            if (item.href === '/dashboard/services') badgeCount = overdueServicesCount;
            if (item.href === '/dashboard/trips') badgeCount = activeTripsCount;

            return (
              <SidebarMenuItem key={item.href}>
                <Link href={item.href} onClick={handleLinkClick}>
                  <SidebarMenuButton
                    isActive={pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))}
                    tooltip={item.label}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                    {badgeCount > 0 && (
                      <SidebarMenuBadge className="bg-destructive text-destructive-foreground">
                        {badgeCount}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter>
        <UserInfo />
      </SidebarFooter>
      <SidebarRail />
    </>
  );
}
