'use client';

import React, { useState } from 'react';
import useLocalStorage from '@/hooks/use-local-storage';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import type { AccountSettings } from '@/lib/types';
import { LS_KEYS, DEFAULT_ACCOUNTS } from '@/lib/constants';
import { useFirebase } from '@/firebase/provider';
import { httpsCallable } from 'firebase/functions';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const formSchema = z.object({
  factoringCompany: z.string().min(1, 'Required'),
  factoringClearing: z.string().min(1, 'Required'),
  fuelAdvancesReceivable: z.string().min(1, 'Required'),
  escrowPayable: z.string().min(1, 'Required'),
  factoringFees: z.string().min(1, 'Required'),
  linehaulRevenue: z.string().min(1, 'Required'),
  fuelSurchargeRevenue: z.string().min(1, 'Required'),
  driverPayExpense: z.string().min(1, 'Required'),
});

type SettingsFormValues = z.infer<typeof formSchema>;

export default function SettingsPage() {
  const [accounts, setAccounts] = useLocalStorage<AccountSettings>(LS_KEYS.ACCOUNTS, DEFAULT_ACCOUNTS);
  const { toast } = useToast();
  const { functions, auth } = useFirebase();
  const router = useRouter();

  const [isDeletingProfile, setIsDeletingProfile] = useState(false);
  const [isDeletingCompany, setIsDeletingCompany] = useState(false);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(formSchema),
    values: accounts,
  });

  function onSubmit(values: SettingsFormValues) {
    setAccounts(values);
    toast({
      title: 'Settings Saved',
      description: 'Your QBO account mappings have been updated.',
    });
  }

  const handleDeleteProfile = async () => {
    if (!functions || !auth) return;
    setIsDeletingProfile(true);
    try {
      const deleteProfileFn = httpsCallable(functions, 'deleteProfile');
      await deleteProfileFn();
      await signOut(auth);
      router.push('/register');
    } catch (error: any) {
      console.error(error);
      toast({ title: 'Error', description: error.message || 'Failed to delete profile.', variant: 'destructive' });
      setIsDeletingProfile(false);
    }
  }

  const handleDeleteCompany = async () => {
    if (!functions || !auth) return;
    setIsDeletingCompany(true);
    try {
      const deleteCompanyFn = httpsCallable(functions, 'deleteCompany');
      await deleteCompanyFn();
      await signOut(auth);
      router.push('/register');
    } catch (error: any) {
      console.error(error);
      toast({ title: 'Error', description: error.message || 'Failed to delete company.', variant: 'destructive' });
      setIsDeletingCompany(false);
    }
  }

  const formFields: { name: keyof SettingsFormValues; label: string; description: string }[] = [
    { name: 'factoringCompany', label: 'Factoring Company Name', description: 'The customer name for QBO invoices.' },
    { name: 'factoringClearing', label: 'Factoring Clearing Account', description: 'Asset account for staging advances.' },
    { name: 'fuelAdvancesReceivable', label: 'Fuel Advances Receivable Account', description: 'Asset account for driver fuel deductions.' },
    { name: 'escrowPayable', label: 'Escrow Payable Account', description: 'Liability account for driver escrow.' },
    { name: 'factoringFees', label: 'Factoring Fees Account', description: 'Expense/COGS account for factoring costs.' },
    { name: 'linehaulRevenue', label: 'Linehaul Revenue Account', description: 'Income account for linehaul.' },
    { name: 'fuelSurchargeRevenue', label: 'Fuel Surcharge Revenue Account', description: 'Income account for fuel surcharges.' },
    { name: 'driverPayExpense', label: 'Driver Pay Expense Account', description: 'Expense/COGS account for driver gross pay.' },
  ]

  return (
    <div className="container mx-auto py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Map your QuickBooks Online Chart of Accounts.</p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Account Mapping</CardTitle>
          <CardDescription>
            These names must exactly match your QBO Chart of Accounts for CSV imports to work correctly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {formFields.map(f => (
                  <FormField
                    key={f.name}
                    control={form.control}
                    name={f.name}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{f.label}</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormDescription>{f.description}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>
              <Button type="submit">Save Settings</Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className="border-red-200 dark:border-red-900/50">
        <CardHeader>
          <CardTitle className="text-red-600 dark:text-red-400">Danger Zone</CardTitle>
          <CardDescription>
            Destructive actions that cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg border-red-100 dark:border-red-900/30">
            <div>
              <h3 className="font-medium text-red-600 dark:text-red-400">Delete Profile</h3>
              <p className="text-sm text-muted-foreground">Permanently delete your personal profile and account data.</p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="mt-4 sm:mt-0" disabled={isDeletingProfile || isDeletingCompany}>
                  {isDeletingProfile ? 'Deleting...' : 'Delete Profile'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete your personal account
                    and remove your data from our servers.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteProfile} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete My Profile
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg border-red-100 dark:border-red-900/30">
            <div>
              <h3 className="font-medium text-red-600 dark:text-red-400">Delete Company</h3>
              <p className="text-sm text-muted-foreground">Permanently delete the entire company and ALL associated users. Only do this if you are a company owner.</p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="mt-4 sm:mt-0" disabled={isDeletingProfile || isDeletingCompany}>
                  {isDeletingCompany ? 'Deleting...' : 'Delete Company'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the entire company
                    and <strong>ALL</strong> associated user accounts from our servers.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteCompany} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete Entire Company
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
