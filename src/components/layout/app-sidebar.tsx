'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Car, Fuel, LayoutDashboard, Leaf, Wrench } from 'lucide-react';

import {
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTitle,
} from '@/components/ui/sidebar';

const menuItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  // { href: '/dashboard/logs', label: 'Registros', icon: Fuel },
  // { href: '/dashboard/services', label: 'Servicios', icon: Wrench },
  // { href: '/dashboard/vehicles', label: 'Vehículos', icon: Car },
];

export default function AppSidebar() {
  const pathname = usePathname();

  return (
    <>
      <SidebarHeader>
        <div className="flex items-center gap-2">
            <Leaf className="size-6 text-primary" />
            <h1 className="font-headline text-xl font-semibold">FuelWise</h1>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {menuItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={pathname === item.href}
                tooltip={{ children: item.label }}
              >
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
    </>
  );
}
