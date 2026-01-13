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
import type { Owner } from '@/lib/types';

const formSchema = z.object({
    name: z.string().min(2, { message: 'Company Name must be at least 2 characters.' }),
    percentage: z.coerce.number().min(0).max(100, { message: 'Percentage must be between 0 and 100.' }),
    insurance: z.coerce.number().min(0).default(0),
    escrow: z.coerce.number().min(0).default(0),
});

type OwnerFormValues = z.infer<typeof formSchema>;

interface OwnerFormProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    onSave: (owner: OwnerFormValues) => void;
    owner?: Owner;
}

export function OwnerForm({ isOpen, onOpenChange, onSave, owner }: OwnerFormProps) {
    const form = useForm<OwnerFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: '',
            percentage: 88,
            insurance: 0,
            escrow: 0,
        },
    });

    React.useEffect(() => {
        if (owner) {
            form.reset({
                name: owner.name,
                percentage: owner.percentage * 100, // Convert decimal to percentage for display
                insurance: owner.recurringDeductions.insurance,
                escrow: owner.recurringDeductions.escrow,
            });
        } else {
            form.reset({
                name: '',
                percentage: 88,
                insurance: 0,
                escrow: 0,
            });
        }
    }, [owner, form, isOpen]);

    function onSubmit(values: OwnerFormValues) {
        onSave(values);
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{owner ? 'Edit Owner' : 'Add Owner'}</DialogTitle>
                    <DialogDescription>
                        {owner ? 'Update the details for this owner.' : 'Add a new owner company.'}
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Company Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Acme Logistics LLC" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="percentage"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Percentage (%)</FormLabel>
                                    <FormControl>
                                        <Input type="number" step="0.01" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
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
                        <DialogFooter>
                            <Button type="submit">Save Owner</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
