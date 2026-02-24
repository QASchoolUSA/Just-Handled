'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase/provider';
import { Loader2, Truck } from 'lucide-react';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
    const { user, isUserLoading } = useUser();
    const router = useRouter();

    React.useEffect(() => {
        if (!isUserLoading && !user) {
            router.push('/login');
        }
    }, [user, isUserLoading, router]);

    if (isUserLoading) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-md transition-all duration-500">
                <div className="relative flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-500">

                    {/* Concentric spinning rings for high-tech feel */}
                    <div className="absolute inset-0 -m-12 rounded-full border border-primary/20 animate-[spin_3s_linear_infinite]" />
                    <div className="absolute inset-0 -m-16 rounded-full border-t border-r border-primary/10 animate-[spin_4s_linear_infinite_reverse]" />

                    {/* Center Icon Container with Glassmorphism / Gradients */}
                    <div className="relative z-10 flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-violet-600 shadow-2xl shadow-primary/40 ring-1 ring-white/20 overflow-hidden">
                        {/* Shimmer effect */}
                        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                        <Truck className="h-12 w-12 text-white/90 drop-shadow-md animate-pulse" strokeWidth={1.5} />
                    </div>

                    {/* Typography & Status updates */}
                    <div className="mt-12 flex flex-col items-center gap-3">
                        <div className="flex items-center gap-2.5 text-foreground font-semibold tracking-tight text-lg">
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                            Initializing Workspace
                        </div>
                        <p className="text-sm text-muted-foreground animate-pulse font-medium">
                            Securely connecting to Just Handled...
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (!user) {
        return null; // Don't render anything while redirecting
    }

    return <>{children}</>;
}
