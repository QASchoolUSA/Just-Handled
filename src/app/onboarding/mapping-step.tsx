'use client';

import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  ONBOARDING_SYSTEM_FIELDS,
  SYSTEM_FIELD_LABELS,
  REQUIRED_SYSTEM_FIELDS,
} from '@/lib/onboarding/types';
import type { ParsedFile, ColumnMapping, NormalizedRow } from '@/lib/onboarding/types';
import { normalizeRows } from '@/lib/onboarding/normalize-rows';
import { ArrowRight, ArrowLeft } from 'lucide-react';

interface OnboardingMappingStepProps {
  parsed: ParsedFile;
  mapping: ColumnMapping;
  onMappingChange: (m: ColumnMapping) => void;
  onStartImport: (rows: NormalizedRow[]) => void;
  onBack: () => void;
}

export function OnboardingMappingStep({
  parsed,
  mapping,
  onMappingChange,
  onStartImport,
  onBack,
}: OnboardingMappingStepProps) {
  const SENTINEL_NONE = '__none__';
  const updateMapping = (field: keyof ColumnMapping, value: string) => {
    const v = value === SENTINEL_NONE || value === '' ? undefined : value;
    onMappingChange({ ...mapping, [field]: v });
  };

  const normalized = useMemo(() => normalizeRows(parsed, mapping), [parsed, mapping]);
  const requiredOk = REQUIRED_SYSTEM_FIELDS.every(
    (f) => mapping[f] && String(mapping[f]).trim()
  );
  const canImport = requiredOk && normalized.length > 0;

  const handleImport = () => {
    if (canImport) onStartImport(normalized);
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Map each system field to a column from your file. Required: Load #, Driver, Pickup Date, Delivery Date.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {ONBOARDING_SYSTEM_FIELDS.map((field) => (
          <div key={field} className="space-y-2">
            <Label className="flex items-center gap-1">
              {SYSTEM_FIELD_LABELS[field]}
              {REQUIRED_SYSTEM_FIELDS.includes(field) && (
                <span className="text-destructive">*</span>
              )}
            </Label>
            <Select
              value={mapping[field] ?? SENTINEL_NONE}
              onValueChange={(v) => updateMapping(field, v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select column..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SENTINEL_NONE}>Don&apos;t map</SelectItem>
                {parsed.headers.map((h, i) => {
                  const value = h === '' || h == null ? `__empty_${i}__` : h;
                  return (
                    <SelectItem key={value} value={value}>
                      {h === '' || h == null ? '(Empty column)' : h}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-muted/20 p-3">
        <p className="text-sm font-medium mb-2">
          Preview: {normalized.length} row{normalized.length !== 1 ? 's' : ''} will be imported
        </p>
        {normalized.length > 0 && (
          <div className="overflow-x-auto max-h-40 overflow-y-auto border rounded-md">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left p-2">Load #</th>
                  <th className="text-left p-2">Driver</th>
                  <th className="text-left p-2">Pickup</th>
                  <th className="text-left p-2">Delivery</th>
                  <th className="text-right p-2">Pay</th>
                </tr>
              </thead>
              <tbody>
                {normalized.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{row.loadNumber}</td>
                    <td className="p-2">{row.driverName}</td>
                    <td className="p-2">{row.pickupDate}</td>
                    <td className="p-2">{row.deliveryDate}</td>
                    <td className="p-2 text-right">{row.invoiceAmount ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button disabled={!canImport} onClick={handleImport}>
          Start import
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
