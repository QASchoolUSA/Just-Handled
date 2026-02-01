'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { useAuth, useUser } from '@/firebase/provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Truck, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

export default function RegisterPage() {
    const [name, setName] = React.useState('');
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [confirmPassword, setConfirmPassword] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const router = useRouter();
    const auth = useAuth();
    const { user } = useUser();
    const { toast } = useToast();

    React.useEffect(() => {
        if (user) {
            router.push('/');
        }
    }, [user, router]);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name || !email || !password || !confirmPassword) {
            toast({
                variant: "destructive",
                title: "Missing Fields",
                description: "Please fill in all fields.",
            });
            return;
        }

        if (password !== confirmPassword) {
            toast({
                variant: "destructive",
                title: "Passwords Mismatch",
                description: "The passwords you entered do not match.",
            });
            return;
        }

        if (password.length < 6) {
            toast({
                variant: "destructive",
                title: "Weak Password",
                description: "Password should be at least 6 characters.",
            });
            return;
        }

        setLoading(true);
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            // Update the user's display name
            await updateProfile(userCredential.user, {
                displayName: name,
            });

            toast({
                title: "Registration Successful",
                description: "Welcome to Just Handled!",
            });

            // Auth listener will handle the rest, but we can push just in case
            router.push('/');
        } catch (error: any) {
            console.error('Registration error:', error);
            let errorMessage = 'Failed to register. Please try again.';

            if (error.code === 'auth/email-already-in-use') {
                errorMessage = 'This email is already registered. Please log in instead.';
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = 'Please enter a valid email address.';
            } else if (error.code === 'auth/weak-password') {
                errorMessage = 'Password is too weak.';
            }

            toast({
                variant: "destructive",
                title: "Registration Failed",
                description: errorMessage,
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
            <Card className="w-full max-w-md border-border/50 shadow-lg">
                <CardHeader className="space-y-1 flex flex-col items-center text-center">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center text-white shadow-lg shadow-primary/20 mb-4">
                        <Truck className="h-7 w-7" />
                    </div>
                    <CardTitle className="font-display text-2xl font-bold">Create Account</CardTitle>
                    <CardDescription>
                        Enter your details to get started with Just Handled
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleRegister} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Full Name</Label>
                            <Input
                                id="name"
                                type="text"
                                placeholder="John Doe"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                disabled={loading}
                                className="h-11"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="name@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                disabled={loading}
                                className="h-11"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                disabled={loading}
                                className="h-11"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Confirm Password</Label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                disabled={loading}
                                className="h-11"
                            />
                        </div>
                        <Button type="submit" className="w-full h-11 text-base rounded-xl" disabled={loading}>
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account...
                                </>
                            ) : (
                                'Sign Up'
                            )}
                        </Button>
                    </form>
                </CardContent>
                <CardFooter className="flex justify-center text-sm text-muted-foreground">
                    <div>
                        Already have an account?{' '}
                        <Link href="/login" className="text-primary hover:underline font-medium">
                            Log in
                        </Link>
                    </div>
                </CardFooter>
            </Card>
        </div>
    );
}
