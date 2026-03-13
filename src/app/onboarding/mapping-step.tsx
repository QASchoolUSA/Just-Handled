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
    <div className="space-y-6 sm:space-y-8">
      <section>
        <h3 className="text-sm font-medium text-foreground mb-1">Column mapping</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Match each system field to a column in your file. Fields marked with * are required.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {ONBOARDING_SYSTEM_FIELDS.map((field) => (
            <div key={field} className="space-y-2">
              <Label className="flex items-center gap-1 text-sm">
                {SYSTEM_FIELD_LABELS[field]}
                {REQUIRED_SYSTEM_FIELDS.includes(field) && (
                  <span className="text-destructive" aria-label="Required">*</span>
                )}
              </Label>
              <Select
                value={mapping[field] ?? SENTINEL_NONE}
                onValueChange={(v) => updateMapping(field, v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select column…" />
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
      </section>

      <section className="rounded-xl border bg-muted/10 overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/20">
          <p className="text-sm font-medium text-foreground">
            Preview · {normalized.length.toLocaleString()} row{normalized.length !== 1 ? 's' : ''} will be imported
          </p>
        </div>
        {normalized.length > 0 && (
          <div className="overflow-x-auto max-h-44 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 sticky top-0">
                <tr>
                  <th className="text-left p-3 font-medium">Load #</th>
                  <th className="text-left p-3 font-medium">Driver</th>
                  <th className="text-left p-3 font-medium">Pickup</th>
                  <th className="text-left p-3 font-medium">Delivery</th>
                  <th className="text-right p-3 font-medium">Pay</th>
                </tr>
              </thead>
              <tbody>
                {normalized.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-t border-border/50 hover:bg-muted/10">
                    <td className="p-3">{row.loadNumber}</td>
                    <td className="p-3">{row.driverName}</td>
                    <td className="p-3">{row.pickupDate}</td>
                    <td className="p-3">{row.deliveryDate}</td>
                    <td className="p-3 text-right">{row.invoiceAmount ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-3 pt-1">
        <Button variant="outline" onClick={onBack} className="min-w-[100px]">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button disabled={!canImport} onClick={handleImport} className="min-w-[140px]">
          Start import
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
