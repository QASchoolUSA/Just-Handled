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

  // Logistics
  pickupLocation: z.string().min(1, { message: 'Pickup Location is required.' }),
  deliveryLocation: z.string().min(1, { message: 'Delivery Location is required.' }),
  pickupDate: z.string().min(1, { message: 'Pickup Date is required.' }),
  deliveryDate: z.string().min(1, { message: 'Delivery Date is required.' }),
  truckId: z.string().min(1, { message: 'Truck ID is required.' }),
  trailerNumber: z.string().min(1, { message: 'Trailer Number is required.' }),
  miles: z.coerce.number().min(0),
  emptyMiles: z.coerce.number().min(0),

  // Financials
  invoiceAmount: z.coerce.number().min(0),
  factoringFee: z.coerce.number().min(0),
  advance: z.coerce.number().min(0),
  reserveAmount: z.coerce.number().min(0),
  primeRateSurcharge: z.coerce.number().min(0).default(0),
  transactionFee: z.coerce.number().min(0).default(0),

  brokerId: z.string().optional(),
  invoiceId: z.string().min(1, { message: 'Invoice ID is required.' }),

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
      pickupLocation: '',
      deliveryLocation: '',
      pickupDate: new Date().toISOString().split('T')[0],
      deliveryDate: new Date().toISOString().split('T')[0],
      truckId: '',
      trailerNumber: '',
      miles: 0,
      emptyMiles: 0,
      invoiceAmount: 0,
      factoringFee: 0,
      advance: 0,
      reserveAmount: 0,
      primeRateSurcharge: 0,
      transactionFee: 0,
      brokerId: '',
      invoiceId: '',
    },
  });

  React.useEffect(() => {
    if (isOpen) {
      if (load) {
        form.reset({
          ...load,
          brokerId: load.brokerId || '',
          truckId: load.truckId,
          trailerNumber: load.trailerNumber,
          proofOfDelivery: undefined,
          rateConfirmation: undefined,
        });
      } else {
        form.reset({
          loadNumber: '',
          driverId: '',
          pickupLocation: '',
          deliveryLocation: '',
          pickupDate: new Date().toISOString().split('T')[0],
          deliveryDate: new Date().toISOString().split('T')[0],
          truckId: '',
          trailerNumber: '',
          miles: 0,
          emptyMiles: 0,
          invoiceAmount: 0,
          factoringFee: 0,
          advance: 0,
          reserveAmount: 0,
          primeRateSurcharge: 0,
          transactionFee: 0,
          brokerId: '',
          invoiceId: '',
          proofOfDelivery: undefined,
          rateConfirmation: undefined,
        });
      }
    }
  }, [load, form, isOpen]);

  function onSubmit(values: LoadFormValues) {
    const { proofOfDelivery, rateConfirmation, ...saveableValues } = values;

    const driver = drivers.find(d => d.id === values.driverId);
    const driverName = driver ? `${driver.firstName} ${driver.lastName}` : undefined;

    const dataToSave: SaveableLoad = {
      ...saveableValues,
      driverName,
      proofOfDeliveryUrl: load?.proofOfDeliveryUrl,
      rateConfirmationUrl: load?.rateConfirmationUrl,
      brokerId: saveableValues.brokerId || undefined,
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
                name="driverId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Driver</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a driver" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {drivers.map((driver) => (
                          <SelectItem key={driver.id} value={driver.id}>
                            {driver.firstName} {driver.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4 rounded-lg border p-4 bg-muted/20">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Logistics</h3>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="pickupLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pickup Location</FormLabel>
                      <FormControl>
                        <Input placeholder="City, State" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="deliveryLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Delivery Location</FormLabel>
                      <FormControl>
                        <Input placeholder="City, State" {...field} />
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
                  name="deliveryDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Delivery Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
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
                <FormField
                  control={form.control}
                  name="emptyMiles"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Empty Miles</FormLabel>
                      <FormControl>
                        <Input type="number" step="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="truckId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Truck ID</FormLabel>
                      <FormControl>
                        <Input placeholder="Truck 101" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="trailerNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Trailer Number</FormLabel>
                      <FormControl>
                        <Input placeholder="Trailer 500" {...field} />
                      </FormControl>
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
            </div>

            <div className="space-y-4 rounded-lg border p-4 bg-muted/20">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Financials</h3>
              <div className="grid grid-cols-2 gap-4">
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

              <div className="grid grid-cols-3 gap-4 border-t pt-4 border-border/50">
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
