'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useUser, useAuth, useFirestore, useCompany } from '@/firebase/provider';
import { updateProfile, updateEmail } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';

const formSchema = z.object({
  displayName: z.string().min(2, 'Display name must be at least 2 characters.'),
  email: z.string().email('Invalid email address.'),
  phoneNumber: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof formSchema>;

export default function ProfilePage() {
  const { user, isUserLoading } = useUser();
  const { companyName } = useCompany();
  const auth = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      displayName: '',
      email: '',
      phoneNumber: '',
    },
  });

  useEffect(() => {
    if (user) {
      form.setValue('displayName', user.displayName || '');
      form.setValue('email', user.email || '');

      // Fetch additional user data from Firestore
      const fetchUserData = async () => {
        if (!firestore) return;
        try {
          const userDocRef = doc(firestore, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const data = userDoc.data();
            if (data.phoneNumber) {
              form.setValue('phoneNumber', data.phoneNumber);
            }
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      };

      fetchUserData();
    }
  }, [user, firestore, form]);

  async function onSubmit(data: ProfileFormValues) {
    if (!user || !auth || !firestore) return;
    setIsLoading(true);

    try {
      const updates: Promise<any>[] = [];

      // Update Display Name
      if (data.displayName !== user.displayName) {
        updates.push(updateProfile(user, { displayName: data.displayName }));
      }

      // Update Email
      if (data.email !== user.email) {
        updates.push(updateEmail(user, data.email));
      }

      // Update Firestore (Phone Number)
      const userDocRef = doc(firestore, 'users', user.uid);
      updates.push(setDoc(userDocRef, {
        phoneNumber: data.phoneNumber,
        updatedAt: new Date(),
        email: data.email, // Sync email to firestore too for easier querying/admin usage
        displayName: data.displayName
      }, { merge: true }));

      await Promise.all(updates);
      await user.reload(); // Reload user to get updated display name

      toast({
        title: 'Profile Updated',
        description: 'Your profile information has been successfully updated.',
      });
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast({
        title: 'Update Failed',
        description: error.message || 'There was a problem updating your profile.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }

  if (isUserLoading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="container mx-auto py-6 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground">Manage your account information.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>
            Update your personal details here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-4">
                <div className="grid gap-2">
                  <FormLabel>Company</FormLabel>
                  <Input disabled value={companyName || 'Loading...'} className="bg-muted text-muted-foreground" />
                </div>
              </div>
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormDescription>
                      This is your public display name.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="john@example.com" {...field} />
                    </FormControl>
                    <FormDescription>
                      The email address used to log in.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input placeholder="+1 (555) 000-0000" {...field} />
                    </FormControl>
                    <FormDescription>
                      Your contact phone number.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
