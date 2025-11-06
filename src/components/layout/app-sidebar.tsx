'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Car, Fuel, Menu, LogOut, Settings, Wrench, History, Route, Leaf } from 'lucide-react';
import { useAuth, useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { signOut } from 'firebase/auth';
import type { User } from '@/lib/types';
import { doc } from 'firebase/firestore';

import {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '../ui/button';

const menuItems = [
  { href: '/dashboard', label: 'Inicio', icon: Menu },
  { href: '/dashboard/logs', label: 'Registros', icon: Fuel },
  { href: '/dashboard/services', label: 'Servicios', icon: Wrench },
  { href: '/dashboard/history', label: 'Historial', icon: History },
  { href: '/dashboard/trips', label: 'Viajes', icon: Route },
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
    signOut(auth);
    router.push('/login');
  };

  const getInitials = (name?: string) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  }

  if (!authUser) return null;

  return (
    <div className='flex items-center gap-2'>
      <Avatar className='h-8 w-8'>
        <AvatarFallback>{getInitials(userProfile?.username)}</AvatarFallback>
      </Avatar>
      <div className='flex flex-col text-sm truncate'>
        <span className='font-semibold text-sidebar-foreground truncate'>{userProfile?.username}</span>
        <span className='text-xs text-muted-foreground truncate'>{authUser.email}</span>
      </div>
      <Button variant="ghost" size="icon" onClick={handleSignOut} title="Cerrar sesión" className='ml-auto'>
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  )
}

export default function AppSidebar() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  const handleLinkClick = () => {
    setOpenMobile(false);
  };

  return (
    <>
      <SidebarHeader>
        <div className="flex items-center gap-2">
            <Leaf className="size-6 text-primary" />
            <h1 className="font-headline text-xl font-semibold">MotorLog</h1>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {menuItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href} onClick={handleLinkClick}>
                <SidebarMenuButton
                  isActive={pathname.startsWith(item.href) && (item.href === '/dashboard' ? pathname === item.href : true)}
                  tooltip={{ children: item.label }}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter>
        <UserInfo />
      </SidebarFooter>
    </>
  );
}
