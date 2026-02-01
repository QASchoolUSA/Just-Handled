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
  Sun,
  Moon,
  FileText,
} from 'lucide-react';
import { useTheme } from "next-themes"

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
  SidebarFooter,
  SidebarRail,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LogOut, Sparkles, MoreHorizontal } from 'lucide-react';
import { useAuth, useUser } from '@/firebase/provider';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { setTheme } = useTheme()
  const pathname = usePathname();
  const { user } = useUser();
  const auth = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const menuItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/settlements', label: 'Settlements', icon: BookCopy },
    { href: '/drivers', label: 'Drivers', icon: Users },
    { href: '/owners', label: 'Owners', icon: Users },
    { href: '/analyze-docs', label: 'Documents Upload', icon: FileText },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r border-border/40">
        <SidebarHeader className="h-16 flex items-center justify-between border-b border-border/40 px-4 group-data-[collapsible=icon]:px-0">
          <div className="flex items-center gap-3 w-full group-data-[collapsible=icon]:justify-center transition-all duration-200 overflow-hidden">
            <div className="hidden group-data-[collapsible=icon]:flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-violet-600 text-white shadow-lg shadow-primary/20 transition-all duration-200">
              <span className="font-bold text-sm">JH</span>
            </div>
            <div className="flex flex-col flex-1 text-left min-w-0 group-data-[collapsible=icon]:hidden transition-all duration-200 pl-1">
              <span className="font-display text-2xl font-bold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 truncate">
                Just Handled
              </span>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent className="px-2 py-2 gap-1">
          <SidebarMenu>
            {menuItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    tooltip={item.label}
                    size="lg"
                    className={`transition-all duration-200 ease-in-out font-medium rounded-xl h-12 group-data-[collapsible=icon]:justify-center ${isActive
                      ? 'bg-primary/10 text-primary shadow-sm hover:bg-primary/15 hover:text-primary'
                      : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
                      }`}
                  >
                    <Link href={item.href}>
                      <item.icon className={isActive ? 'text-primary' : 'text-muted-foreground'} />
                      <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground transition-all duration-200 rounded-xl"
                  >
                    <Avatar className="h-8 w-8 rounded-lg border border-border/50">
                      <AvatarFallback className="rounded-lg bg-primary/10 text-primary font-medium">
                        {(user?.displayName || user?.email || 'U').charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                      <span className="truncate font-semibold">{user?.displayName || user?.email?.split('@')[0] || 'User'}</span>
                      <span className="truncate text-xs text-muted-foreground">{user?.email || 'user@example.com'}</span>
                    </div>
                    <MoreHorizontal className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-xl"
                  side="bottom"
                  align="end"
                  sideOffset={4}
                >
                  <DropdownMenuLabel className="p-0 font-normal">
                    <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                      <Avatar className="h-8 w-8 rounded-lg border border-border/50">
                        <AvatarFallback className="rounded-lg bg-primary/10 text-primary font-medium">
                          {(user?.displayName || user?.email || 'U').charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-semibold">{user?.displayName || user?.email?.split('@')[0] || 'User'}</span>
                        <span className="truncate text-xs text-muted-foreground">{user?.email || 'user@example.com'}</span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem className="gap-2 rounded-lg cursor-pointer">
                      <Sparkles className="h-4 w-4 text-amber-500" />
                      Upgrade to Pro
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild className="gap-2 rounded-lg cursor-pointer">
                      <Link href="/profile">
                        <Users className="h-4 w-4" />
                        <span>Profile</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2 rounded-lg cursor-pointer">
                        <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                        <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                        <span>Theme</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent>
                          <DropdownMenuItem onClick={() => setTheme("light")}>
                            Light
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setTheme("dark")}>
                            Dark
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setTheme("system")}>
                            System
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />

                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="gap-2 rounded-lg text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer">
                    <LogOut className="h-4 w-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="bg-background">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border/40 bg-background/80 px-4 backdrop-blur-md transition-all sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 sm:py-4">
          <SidebarTrigger />
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
