'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useCompany } from '@/firebase/provider';
import { Loader2 } from 'lucide-react';

export default function SubscriptionGuard({ children }: { children: React.ReactNode }) {
    const { company, isCompanyLoading } = useCompany();
    const router = useRouter();

    React.useEffect(() => {
        // Only run checks if we've successfully loaded a company profile
        if (!isCompanyLoading && company) {

            // If they have no subscription object at all, let them pass (maybe very old dev data)
            // Or force them out. For safety, let's enforce subscribe if there's an explicit failure state
            if (company.subscription) {
                const sub = company.subscription;

                if (sub.status === 'canceled' || sub.status === 'past_due') {
                    router.push('/subscribe');
                    return;
                }

                if (sub.status === 'trialing' && sub.trialEndsAt) {
                    const now = new Date().getTime();
                    if (now > sub.trialEndsAt) {
                        router.push('/subscribe');
                        return;
                    }
                }
            }
        }
    }, [company, isCompanyLoading, router]);

    if (isCompanyLoading) {
        // Optionally render the same loading state as AuthGuard, or simply return children and let the effect redirect
        // returning null avoids a flash of dashboard content before the redirect
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-md">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return <>{children}</>;
}
