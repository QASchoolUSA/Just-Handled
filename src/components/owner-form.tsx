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
    name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
    unitId: z.string().optional(),
    percentage: z.coerce.number().min(0, { message: 'Percentage must be positive.' }).max(1, { message: 'Percentage cannot exceed 1.0 (100%).' }),
    fuelRebate: z.coerce.number().min(0).default(0),
    insurance: z.coerce.number().min(0).default(0),
    escrow: z.coerce.number().min(0).default(0),
    eld: z.coerce.number().min(0).default(0),
    adminFee: z.coerce.number().min(0).default(0),
    fuel: z.coerce.number().min(0).default(0),
    tolls: z.coerce.number().min(0).default(0),
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
            unitId: '',
            percentage: 0.88,
            fuelRebate: 0,
            insurance: 0,
            escrow: 0,
            eld: 0,
            adminFee: 0,
            fuel: 0,
            tolls: 0,
        },
    });

    React.useEffect(() => {
        if (owner) {
            form.reset({
                name: owner.name,
                unitId: owner.unitId || '',
                percentage: owner.percentage,
                fuelRebate: owner.fuelRebate || 0,
                insurance: owner.recurringDeductions.insurance,
                escrow: owner.recurringDeductions.escrow,
                eld: owner.recurringDeductions.eld || 0,
                adminFee: owner.recurringDeductions.adminFee || 0,
                fuel: owner.recurringDeductions.fuel || 0,
                tolls: owner.recurringDeductions.tolls || 0,
            });
        } else {
            form.reset({
                name: '',
                unitId: '',
                percentage: 0.88,
                fuelRebate: 0,
                insurance: 0,
                escrow: 0,
                eld: 0,
                adminFee: 0,
                fuel: 0,
                tolls: 0,
            });
        }
    }, [owner, form]);

    const onSubmit = (values: OwnerFormValues) => {
        onSave(values);
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>{owner ? 'Edit Owner' : 'Add New Owner'}</DialogTitle>
                    <DialogDescription>
                        {owner ? 'Edit the details of this owner.' : 'Add a new owner to your system.'}
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
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
                                name="percentage"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Percentage Split (e.g. 0.88)</FormLabel>
                                        <FormControl>
                                            <Input type="number" step="0.01" max="1" placeholder="0.88" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="fuelRebate"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Fuel Rebate (Weekly)</FormLabel>
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
                            <Button type="submit">Save Owner</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
