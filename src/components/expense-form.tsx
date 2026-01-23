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
import type { Expense, Driver } from '@/lib/types';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { CalendarIcon } from 'lucide-react';
import { Calendar } from './ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const formSchema = z.object({
  date: z.date({ required_error: 'A date is required.' }),
  description: z.string().min(1, { message: 'Description is required.' }),
  amount: z.coerce.number().min(0.01, { message: 'Amount must be positive.' }),
  type: z.enum(['company', 'driver']),
  driverId: z.string().optional(),
}).refine(data => {
  if (data.type === 'driver' && !data.driverId) {
    return false;
  }
  return true;
}, {
  message: 'A driver is required for driver deductions.',
  path: ['driverId'],
});


type ExpenseFormValues = z.infer<typeof formSchema>;

interface ExpenseFormProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (expense: Omit<Expense, 'id'>) => void;
  expense?: Expense;
  drivers: Driver[];
}

export function ExpenseForm({ isOpen, onOpenChange, onSave, expense, drivers }: ExpenseFormProps) {
  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: new Date(),
      description: '',
      amount: 0,
      type: 'company',
      driverId: undefined,
    },
  });

  const expenseType = form.watch('type');

  React.useEffect(() => {
    if (isOpen) {
      if (expense) {
        form.reset({ ...expense, date: new Date(expense.date) });
      } else {
        form.reset({
          date: new Date(),
          description: '',
          amount: 0,
          type: 'company',
          driverId: undefined,
        });
      }
    }
  }, [expense, form, isOpen]);

  function onSubmit(values: ExpenseFormValues) {
    const dataToSave: Omit<Expense, 'id'> = {
      ...values,
      date: values.date.toISOString(),
    };

    if (values.type === 'company') {
      delete dataToSave.driverId;
    }

    onSave(dataToSave);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{expense ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
          <DialogDescription>
            {expense ? 'Update this expense record.' : 'Add a new company expense or driver deduction.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) =>
                          date > new Date() || date < new Date("1900-01-01")
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Fuel, Tolls, Scale ticket" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expense Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an expense type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="company">Company Expense</SelectItem>
                      <SelectItem value="driver">Driver Deduction</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {expenseType === 'driver' && (
              <FormField
                control={form.control}
                name="driverId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Driver</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Assign to a driver" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {drivers.map(driver => (
                          <SelectItem key={driver.id} value={driver.id}>{driver.firstName} {driver.lastName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <DialogFooter>
              <Button type="submit">Save Expense</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
