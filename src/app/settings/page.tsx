'use client';

import React from 'react';
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

const formSchema = z.object({
  factoringCompany: z.string().min(1, 'Required'),
  factoringClearing: z.string().min(1, 'Required'),
  accruedDriverPay: z.string().min(1, 'Required'),
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
  
  const formFields: {name: keyof SettingsFormValues; label: string; description: string}[] = [
      { name: 'factoringCompany', label: 'Factoring Company Name', description: 'The customer name for QBO invoices.' },
      { name: 'factoringClearing', label: 'Factoring Clearing Account', description: 'Asset account for staging advances.' },
      { name: 'accruedDriverPay', label: 'Accrued Driver Pay Account', description: 'Critical liability account for settlements.' },
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

      <Card>
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
    </div>
  );
}
