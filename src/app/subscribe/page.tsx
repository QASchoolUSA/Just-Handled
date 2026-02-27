'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCompany, useAuth } from '@/firebase/provider';
import { signOut } from 'firebase/auth';
import { CreditCard, LogOut, ArrowRight, Truck } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function SubscribePage() {
    const { company } = useCompany();
    const auth = useAuth();
    const router = useRouter();

    const handleLogout = async () => {
        try {
            await signOut(auth);
            router.push('/login');
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
            <Card className="w-full max-w-lg border-border/50 shadow-2xl relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-violet-600/10 pointer-events-none" />

                <CardHeader className="space-y-2 flex flex-col items-center text-center relative z-10 pt-10">
                    <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white shadow-lg shadow-teal-500/20 mb-4 animate-in zoom-in spin-in-12 duration-700">
                        <Truck className="h-8 w-8" />
                    </div>
                    <CardTitle className="font-display text-4xl font-bold tracking-tight">Access Locked</CardTitle>
                    <CardDescription className="text-base max-w-sm">
                        {company?.subscription?.status === 'trialing'
                            ? "Your 7-day free trial has expired. To continue using Just Handled, please choose a plan."
                            : "Your subscription is currently inactive or past due."}
                    </CardDescription>
                </CardHeader>

                <CardContent className="relative z-10 pt-4 pb-8 space-y-6">
                    <div className="bg-background/80 backdrop-blur-sm rounded-xl border border-border/50 p-6 flex flex-col items-center text-center space-y-3">
                        <div className="rounded-full bg-primary/10 p-3 mb-2">
                            <CreditCard className="h-6 w-6 text-primary" />
                        </div>
                        <h3 className="font-semibold text-lg">Pro Subscription Required</h3>
                        <p className="text-sm text-muted-foreground">
                            Unlock unlimited loads, factoring analytics, automated settlements, and advanced driver management.
                        </p>
                    </div>

                    <div className="space-y-3 pt-2">
                        <Button className="w-full h-12 text-base group" size="lg" onClick={() => window.location.href = 'mailto:support@justhandled.com?subject=Upgrade to Pro'}>
                            Contact Support to Upgrade
                            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </Button>
                        <p className="text-xs text-center text-muted-foreground px-4">
                            We are currently processing upgrades manually. Please contact support to activate your account.
                        </p>
                    </div>
                </CardContent>

                <CardFooter className="relative z-10 border-t border-border/40 bg-muted/20 flex justify-center py-4">
                    <Button variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={handleLogout}>
                        <LogOut className="mr-2 h-4 w-4" />
                        Log out
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
