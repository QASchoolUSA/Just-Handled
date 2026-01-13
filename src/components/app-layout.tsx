'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookCopy,
  LayoutDashboard,
  Settings,
  Users,
  Truck,
} from 'lucide-react';

import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  SidebarRail,
} from '@/components/ui/sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const menuItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/settlements', label: 'Settlements', icon: BookCopy },
    { href: '/drivers', label: 'Drivers', icon: Users },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r border-border/40">
        <SidebarHeader className="h-16 flex items-center justify-center border-b border-border/40 px-4">
          <div className="flex items-center gap-3 w-full group-data-[collapsible=icon]:justify-center">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-violet-600 text-white shadow-lg shadow-primary/20">
              <Truck className="h-6 w-6" />
            </div>
            <div className="flex flex-col group-data-[collapsible=icon]:hidden text-left">
              <span className="font-display text-lg font-bold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                Just Handled
              </span>
              <span className="text-xs text-muted-foreground font-medium">Trucking OS</span>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent className="px-2 py-4 gap-1">
          <SidebarMenu>
            {menuItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <SidebarMenuItem key={item.href}>
                  <Link href={item.href} passHref legacyBehavior>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.label}
                      size="lg"
                      className={`transition-all duration-200 ease-in-out font-medium rounded-xl h-12 ${isActive
                        ? 'bg-primary/10 text-primary shadow-sm hover:bg-primary/15 hover:text-primary'
                        : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
                        }`}
                    >
                      <item.icon className={isActive ? 'text-primary' : 'text-muted-foreground'} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarContent>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="bg-background">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border/40 bg-background/80 px-4 backdrop-blur-md transition-all sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 sm:py-4">
          <SidebarTrigger className="md:hidden" />
          <div className="flex items-center gap-3 md:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
              <Truck className="h-5 w-5" />
            </div>
            <h1 className="font-display text-lg font-bold">
              Just Handled
            </h1>
          </div>
        </header>
        <main className="flex-1 p-4 pt-0 sm:px-6 sm:py-0">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
