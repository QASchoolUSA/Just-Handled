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
import type { Expense, Driver, Owner } from '@/lib/types';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { CalendarIcon } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from './ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const formSchema = z.object({
  date: z.date({ required_error: 'A date is required.' }),
  description: z.string().min(1, { message: 'Description is required.' }),
  amount: z.coerce.number().min(0.01, { message: 'Amount must be positive.' }),
  gallons: z.coerce.number().optional(),
  unitId: z.string().min(1, { message: 'Unit ID is required.' }),
  expenseCategory: z.string().optional(),
  locationState: z.string().max(2, { message: 'State must be 2 characters.' }).optional(),
  category: z.enum(['addition', 'deduction']).optional(),
  type: z.enum(['driver', 'owner', 'company']),
});

type ExpenseFormValues = z.infer<typeof formSchema>;

interface ExpenseFormProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (expense: Omit<Expense, 'id'>) => void;
  expense?: Expense;
  drivers: Driver[];
  owners: Owner[];
}

export function ExpenseForm({ isOpen, onOpenChange, onSave, expense, drivers, owners }: ExpenseFormProps) {
  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: new Date(),
      description: '',
      amount: 0,
      gallons: 0,
      unitId: '',
      expenseCategory: 'Fuel',
      locationState: '',
      category: 'deduction',
      type: 'company',
    },
  });

  const selectedUnitId = form.watch('unitId');
  const selectedType = form.watch('type');

  // Derive if the selected unit belongs to a driver or owner for auto-selection suggestion
  // (Only if user hasn't explicitly changed it? For now, we manually select)
  React.useEffect(() => {
    if (selectedUnitId && !expense) {
      const driver = drivers.find(d => d.unitId === selectedUnitId);
      const owner = owners.find(o => o.unitId === selectedUnitId);

      if (driver) {
        form.setValue('type', 'driver');
      } else if (owner) {
        form.setValue('type', 'owner');
      } else {
        form.setValue('type', 'company');
      }
    }
  }, [selectedUnitId, drivers, owners, form, expense]);

  React.useEffect(() => {
    if (isOpen) {
      if (expense) {
        form.reset({
          date: new Date(expense.date),
          description: expense.description,
          amount: expense.amount,
          gallons: expense.gallons || 0,
          unitId: expense.unitId || '',
          locationState: expense.locationState || '',
          expenseCategory: expense.expenseCategory || 'Fuel',
          category: expense.category || 'deduction',
          type: expense.type,
        });
      } else {
        form.reset({
          date: new Date(),
          description: '',
          amount: 0,
          gallons: 0,
          unitId: '',
          locationState: '',
          expenseCategory: 'Fuel',
          category: 'deduction',
          type: 'company',
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
    owners.forEach(o => {
      if (o.unitId) ids.add(o.unitId);
    });
    return Array.from(ids).sort();
  }, [drivers, owners]);

  function onSubmit(values: ExpenseFormValues) {
    const driver = drivers.find(d => d.unitId === values.unitId);
    const owner = owners.find(o => o.unitId === values.unitId);

    const dataToSave: Omit<Expense, 'id'> = {
      date: values.date.toISOString(),
      description: values.description,
      amount: values.amount,
      gallons: values.gallons,
      unitId: values.unitId,
      locationState: values.locationState?.toUpperCase(),
      expenseCategory: values.expenseCategory,
      type: values.type,
      driverId: values.type === 'driver' && driver ? driver.id : undefined,
      ownerId: values.type === 'owner' && owner ? owner.id : undefined,
      category: values.category,
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
                    <FormLabel>Gallons</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="locationState"
                render={({ field }) => (
                  <FormItem className="w-24">
                    <FormLabel>State</FormLabel>
                    <FormControl>
                      <Input placeholder="NY" maxLength={2} {...field} onChange={e => field.onChange(e.target.value.toUpperCase())} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>



            <FormField
              control={form.control}
              name="expenseCategory"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expense Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Fuel">Fuel</SelectItem>
                      <SelectItem value="Tolls">Tolls</SelectItem>
                      <SelectItem value="ELD">ELD</SelectItem>
                      <SelectItem value="Insurance">Insurance</SelectItem>
                      <SelectItem value="Admin Fee">Admin Fee</SelectItem>
                      <SelectItem value="Repair">Repair</SelectItem>
                      <SelectItem value="Lease">Lease</SelectItem>
                      <SelectItem value="Maintenance">Maintenance</SelectItem>
                      <SelectItem value="Advance">Advance</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Bill To</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      value={field.value}
                      className="flex flex-row space-x-4"
                    >
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="company" />
                        </FormControl>
                        <FormLabel className="font-normal">
                          Company
                        </FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="driver" />
                        </FormControl>
                        <FormLabel className="font-normal">
                          Driver
                        </FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="owner" />
                        </FormControl>
                        <FormLabel className="font-normal">
                          Owner
                        </FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {(selectedType === 'driver' || selectedType === 'owner') && (
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category ({selectedType === 'driver' ? 'Driver' : 'Owner'} Deduction)</FormLabel>
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
      </DialogContent >
    </Dialog >
  );
}
