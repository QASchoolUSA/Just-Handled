'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import AppLayout from '@/components/app-layout';
import AuthGuard from '@/components/auth-guard';

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLoginPage = pathname === '/login';

    if (isLoginPage) {
        return <>{children}</>;
    }

    return (
        <AuthGuard>
            <AppLayout>{children}</AppLayout>
        </AuthGuard>
    );
}
