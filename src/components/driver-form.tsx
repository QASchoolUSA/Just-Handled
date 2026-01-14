'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Driver } from '@/lib/types';

const formSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  unitId: z.string().optional(),
  payType: z.enum(['percentage', 'cpm']),
  rate: z.coerce.number().min(0, { message: 'Rate must be a positive number.' }),
  insurance: z.coerce.number().min(0).default(0),
  escrow: z.coerce.number().min(0).default(0),
  eld: z.coerce.number().min(0).default(0),
  adminFee: z.coerce.number().min(0).default(0),
  fuel: z.coerce.number().min(0).default(0),
  tolls: z.coerce.number().min(0).default(0),
});

type DriverFormValues = z.infer<typeof formSchema>;

interface DriverFormProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (driver: DriverFormValues) => void;
  driver?: Driver;
}

export function DriverForm({ isOpen, onOpenChange, onSave, driver }: DriverFormProps) {
  const form = useForm<DriverFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      unitId: '',
      payType: 'percentage',
      rate: 0,
      insurance: 0,
      escrow: 0,
      eld: 0,
      adminFee: 0,
      fuel: 0,
      tolls: 0,
    },
  });

  React.useEffect(() => {
    if (driver) {
      form.reset({
        name: driver.name,
        unitId: driver.unitId || '',
        payType: driver.payType,
        rate: driver.rate,
        insurance: driver.recurringDeductions.insurance,
        escrow: driver.recurringDeductions.escrow,
        eld: driver.recurringDeductions.eld || 0,
        adminFee: driver.recurringDeductions.adminFee || 0,
        fuel: driver.recurringDeductions.fuel || 0,
        tolls: driver.recurringDeductions.tolls || 0,
      });
    } else {
      form.reset({
        name: '',
        unitId: '',
        payType: 'percentage',
        rate: 0.25,
        insurance: 0,
        escrow: 0,
        eld: 0,
        adminFee: 0,
        fuel: 0,
        tolls: 0,
      });
    }
  }, [driver, form, isOpen]);

  function onSubmit(values: DriverFormValues) {
    onSave(values);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{driver ? 'Edit Driver' : 'Add Driver'}</DialogTitle>
          <DialogDescription>
            {driver ? 'Update the details for this driver.' : 'Add a new driver to your company.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            {/* Same Name/Unit/PayType fields */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Driver Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unitId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit ID</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 101" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="payType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pay Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a pay type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage</SelectItem>
                        <SelectItem value="cpm">CPM</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rate</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="e.g., 0.30 or 0.65" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="insurance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Weekly Insurance</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="escrow"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Weekly Escrow</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="eld"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ELD</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="adminFee"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Admin Fee</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="fuel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fuel</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tolls"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tolls</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="submit">Save Driver</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
