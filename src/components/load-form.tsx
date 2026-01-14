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
  FormDescription,
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
import type { Load, Driver } from '@/lib/types';

const formSchema = z.object({
  loadNumber: z.string().min(1, { message: 'Load number is required.' }),
  driverId: z.string().min(1, { message: 'Please select a driver.' }),

  // New Fields
  pickupDate: z.string().min(1, { message: 'Pickup Date is required.' }),
  brokerId: z.string().optional(),
  invoiceId: z.string().min(1, { message: 'Invoice ID is required.' }),
  invoiceDate: z.string().min(1, { message: 'Invoice Date is required.' }),
  poNumber: z.string().optional(),

  // Financials
  miles: z.coerce.number().min(0),
  linehaul: z.coerce.number().min(0),
  fuelSurcharge: z.coerce.number().min(0),

  invoiceAmount: z.coerce.number().min(0),
  reserveAmount: z.coerce.number().min(0),
  primeRateSurcharge: z.coerce.number().min(0).default(0),
  transactionFee: z.coerce.number().min(0).default(0),
  factoringFee: z.coerce.number().min(0),
  advance: z.coerce.number().min(0),

  proofOfDelivery: z.any().optional(),
  rateConfirmation: z.any().optional(),
});

type LoadFormValues = z.infer<typeof formSchema>;

type SaveableLoad = Omit<Load, 'id'>;

interface LoadFormProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (load: SaveableLoad) => void;
  load?: Load;
  drivers: Driver[];
}

export function LoadForm({ isOpen, onOpenChange, onSave, load, drivers }: LoadFormProps) {
  const form = useForm<LoadFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      loadNumber: '',
      driverId: '',
      pickupDate: '',
      brokerId: '',
      invoiceId: '',
      invoiceDate: '',
      poNumber: '',
      miles: 0,
      linehaul: 0,
      fuelSurcharge: 0,
      invoiceAmount: 0,
      reserveAmount: 0,
      primeRateSurcharge: 0,
      transactionFee: 0,
      factoringFee: 0,
      advance: 0,
    },
  });

  React.useEffect(() => {
    if (isOpen) {
      if (load) {
        form.reset({
          ...load,
          brokerId: load.brokerId || '',
          poNumber: load.poNumber || '',
          proofOfDelivery: undefined,
          rateConfirmation: undefined,
        });
      } else {
        form.reset({
          loadNumber: '',
          driverId: '',
          pickupDate: new Date().toISOString().split('T')[0],
          brokerId: '',
          invoiceId: '',
          invoiceDate: new Date().toISOString().split('T')[0],
          poNumber: '',
          miles: 0,
          linehaul: 0,
          fuelSurcharge: 0,
          invoiceAmount: 0,
          reserveAmount: 0,
          primeRateSurcharge: 0,
          transactionFee: 0,
          factoringFee: 0,
          advance: 0,
          proofOfDelivery: undefined,
          rateConfirmation: undefined,
        });
      }
    }
  }, [load, form, isOpen]);

  function onSubmit(values: LoadFormValues) {
    const { proofOfDelivery, rateConfirmation, ...saveableValues } = values;

    const dataToSave: SaveableLoad = {
      ...saveableValues,
      proofOfDeliveryUrl: load?.proofOfDeliveryUrl,
      rateConfirmationUrl: load?.rateConfirmationUrl,
      brokerId: saveableValues.brokerId || undefined,
      poNumber: saveableValues.poNumber || '',
    };

    onSave(dataToSave);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{load ? 'Edit Load' : 'Add Load'}</DialogTitle>
          <DialogDescription>
            {load ? 'Update the details for this load.' : 'Add a new load for this settlement period.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="loadNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Load #</FormLabel>
                    <FormControl>
                      <Input placeholder="123456" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="invoiceId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invoice ID</FormLabel>
                    <FormControl>
                      <Input placeholder="INV-001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="pickupDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pickup Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="invoiceDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invoice Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="driverId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Driver</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a driver" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {drivers.map(driver => (
                          <SelectItem key={driver.id} value={driver.id}>{driver.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="brokerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Broker ID (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Broker XYZ" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="poNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PO Number (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="PO-123" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="miles"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Miles</FormLabel>
                    <FormControl>
                      <Input type="number" step="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="linehaul"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Linehaul</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fuelSurcharge"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fuel Surcharge</FormLabel>
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
                name="invoiceAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invoice Amount</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reserveAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reserve Amount</FormLabel>
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
                name="primeRateSurcharge"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prime Rate Surch.</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="transactionFee"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Transaction Fee</FormLabel>
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
                name="factoringFee"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Factoring Fee</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="advance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cash Advance</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4">
              <FormField
                control={form.control}
                name="proofOfDelivery"
                render={({ field: { onChange, value, ...rest } }) => (
                  <FormItem>
                    <FormLabel>Proof of Delivery (POD)</FormLabel>
                    <FormControl>
                      <Input
                        type="file"
                        onChange={(e) => onChange(e.target.files ? e.target.files[0] : null)}
                        {...rest}
                      />
                    </FormControl>
                    <FormDescription>Upload the signed POD document.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="rateConfirmation"
                render={({ field: { onChange, value, ...rest } }) => (
                  <FormItem>
                    <FormLabel>Rate Confirmation</FormLabel>
                    <FormControl>
                      <Input
                        type="file"
                        onChange={(e) => onChange(e.target.files ? e.target.files[0] : null)}
                        {...rest}
                      />
                    </FormControl>
                    <FormDescription>Upload the rate confirmation document.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>


            <DialogFooter>
              <Button type="submit">Save Load</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
