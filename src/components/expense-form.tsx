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
  gallons: z.coerce.number().optional(),
  unitId: z.string().min(1, { message: 'Unit ID is required.' }),
  category: z.enum(['addition', 'deduction']).optional(),
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
      gallons: 0,
      unitId: '',
      category: 'deduction',
    },
  });

  const selectedUnitId = form.watch('unitId');

  // Derive if the selected unit belongs to a driver
  const matchedDriver = React.useMemo(() => {
    if (!selectedUnitId) return undefined;
    return drivers.find(d => d.unitId === selectedUnitId);
  }, [selectedUnitId, drivers]);

  React.useEffect(() => {
    if (isOpen) {
      if (expense) {
        form.reset({
          date: new Date(expense.date),
          description: expense.description,
          amount: expense.amount,
          gallons: expense.gallons || 0,
          unitId: expense.unitId || '',
          category: expense.category || 'deduction',
        });
      } else {
        form.reset({
          date: new Date(),
          description: '',
          amount: 0,
          gallons: 0,
          unitId: '',
          category: 'deduction',
        });
      }
    }
  }, [expense, form, isOpen]);

  // Extract unique unit IDs from drivers
  const unitIds = React.useMemo(() => {
    const ids = new Set<string>();
    drivers.forEach(d => {
      if (d.unitId) ids.add(d.unitId);
    });
    return Array.from(ids).sort();
  }, [drivers]);

  function onSubmit(values: ExpenseFormValues) {
    // Derive type and driverId
    const driver = drivers.find(d => d.unitId === values.unitId);

    const dataToSave: Omit<Expense, 'id'> = {
      date: values.date.toISOString(),
      description: values.description,
      amount: values.amount,
      gallons: values.gallons,
      unitId: values.unitId,
      // If matches a driver, it's a driver expense (deduction/addition)
      // Otherwise default to company
      type: driver ? 'driver' : 'company',
      driverId: driver?.id,
      category: driver ? values.category : undefined,
    };

    onSave(dataToSave);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{expense ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
          <DialogDescription>
            {expense ? 'Update this expense record.' : 'Add a new expense record.'}
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
              name="unitId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit ID</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Unit ID" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {unitIds.map(id => (
                        <SelectItem key={id} value={id}>{id}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

            <div className="flex gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem className="flex-1">
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
                name="gallons"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Gallons (Optional)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {matchedDriver && (
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category (Driver Detection)</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="deduction">Deduction (Negative)</SelectItem>
                        <SelectItem value="addition">Addition (Positive)</SelectItem>
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
