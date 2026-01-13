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
  linehaul: z.coerce.number().min(0),
  fuelSurcharge: z.coerce.number().min(0),
  factoringFee: z.coerce.number().min(0),
  advance: z.coerce.number().min(0),
  miles: z.coerce.number().min(1, { message: 'Miles are required.' }),
  proofOfDelivery: z.any().optional(),
  rateConfirmation: z.any().optional(),
});

type LoadFormValues = z.infer<typeof formSchema>;

// The form will now pass the full Load object (minus id) to the onSave handler
// The handler will be responsible for file uploads and creating URLs
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
      linehaul: 0,
      fuelSurcharge: 0,
      factoringFee: 0,
      advance: 0,
      miles: 0,
    },
  });

  React.useEffect(() => {
    if (isOpen) {
      if (load) {
        // We don't populate file inputs, but we reset other fields
        form.reset({
          ...load,
          proofOfDelivery: undefined,
          rateConfirmation: undefined,
        });
      } else {
        form.reset({
          loadNumber: '',
          driverId: '',
          linehaul: 0,
          fuelSurcharge: 0,
          factoringFee: 0,
          advance: 0,
          miles: 0,
          proofOfDelivery: undefined,
          rateConfirmation: undefined,
        });
      }
    }
  }, [load, form, isOpen]);

  function onSubmit(values: LoadFormValues) {
    // This is a temporary setup. The actual file objects are in `values.proofOfDelivery`
    // and `values.rateConfirmation`. The onSave handler will need to process them.
    // For now, we'll pass placeholder URLs if the form is being edited, or nothing if new.
    const { proofOfDelivery, rateConfirmation, ...saveableValues } = values;

    const dataToSave: SaveableLoad = {
        ...saveableValues,
        // In a real scenario, you'd upload files and get URLs here.
        // We are passing existing URLs if they exist on the `load` prop.
        proofOfDeliveryUrl: load?.proofOfDeliveryUrl,
        rateConfirmationUrl: load?.rateConfirmationUrl,
    };
    
    // In the next step, we will handle the actual file upload logic
    // inside the onSave prop in the parent component.
    onSave(dataToSave);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
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
            </div>
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

            <div className="grid grid-cols-2 gap-4">
               <FormField
                control={form.control}
                name="linehaul"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gross Linehaul</FormLabel>
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
                render={({ field: { onChange, value, ...rest }}) => (
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
                render={({ field: { onChange, value, ...rest }}) => (
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
