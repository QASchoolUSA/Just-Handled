'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import AppLayout from '@/components/app-layout';
import AuthGuard from '@/components/auth-guard';
import SubscriptionGuard from '@/components/subscription-guard';

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isPublicPage = pathname === '/login' || pathname === '/register';

    if (isPublicPage || pathname === '/subscribe') {
        return <>{children}</>;
    }

    if (pathname === '/onboarding') {
        return <AuthGuard>{children}</AuthGuard>;
    }

    return (
        <AuthGuard>
            <SubscriptionGuard>
                <AppLayout>{children}</AppLayout>
            </SubscriptionGuard>
        </AuthGuard>
    );
}
