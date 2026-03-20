'use client';

import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  ONBOARDING_SYSTEM_FIELDS,
  SYSTEM_FIELD_LABELS,
  REQUIRED_SYSTEM_FIELDS,
} from '@/lib/onboarding/types';
import type { ParsedFile, ColumnMapping, NormalizedRow, OnboardingSystemField } from '@/lib/onboarding/types';
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

  const setFieldMapping = (field: OnboardingSystemField, value: string | undefined) => {
    // Enforce uniqueness: a given file column can only be mapped to one system field.
    // If a new mapping collides with an existing one, clear the other field.
    const next: ColumnMapping = { ...mapping, [field]: value };
    if (value) {
      for (const otherField of ONBOARDING_SYSTEM_FIELDS) {
        if (otherField === field) continue;
        if (next[otherField] === value) next[otherField] = undefined;
      }
    }
    onMappingChange(next);
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
          {(() => {
            const allOptions = parsed.headers.map((h, i) => {
              const raw = h === '' || h == null ? `__empty_${i}__` : h;
              const label = h === '' || h == null ? '(Empty column)' : h;
              return { value: raw, label };
            });

            const taken = new Set(
              Object.values(mapping).filter((v): v is string => typeof v === 'string' && v.trim() !== '')
            );

            function FieldPicker({ field }: { field: OnboardingSystemField }) {
              const [query, setQuery] = React.useState('');
              const currentValue = mapping[field];

              React.useEffect(() => setQuery(''), [currentValue]);

              const currentLabel = allOptions.find((o) => o.value === currentValue)?.label;

              const available = allOptions.filter((opt) => {
                if (taken.has(opt.value) && opt.value !== currentValue) return false;
                return true;
              });

              const filtered = query.trim()
                ? available.filter((opt) => opt.label.toLowerCase().includes(query.trim().toLowerCase()))
                : available;

              return (
                <div key={String(field)} className="space-y-2">
                  <Label className="flex items-center gap-1 text-sm">
                    {SYSTEM_FIELD_LABELS[field] ?? String(field)}
                    {REQUIRED_SYSTEM_FIELDS.includes(field) && (
                      <span className="text-destructive" aria-label="Required">*</span>
                    )}
                  </Label>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start h-9 font-normal text-left"
                        type="button"
                      >
                        {currentValue ? (
                          <span className="truncate" title={currentLabel ?? currentValue}>
                            {currentLabel ?? currentValue}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Select column…</span>
                        )}
                      </Button>
                    </PopoverTrigger>

                    <PopoverContent className="w-[360px] max-w-[92vw] p-2 bg-background text-foreground border border-border/60 shadow-lg">
                      <div className="space-y-3">
                        <Input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Search columns…"
                          className="h-9"
                        />

                        <div className="max-h-[200px] overflow-auto bg-background border border-border/60 rounded-md">
                          <div className="p-1">
                            <button
                              type="button"
                              className="w-full text-left px-2 py-2 rounded text-foreground hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              onClick={() => setFieldMapping(field, undefined)}
                            >
                              Don&apos;t map
                            </button>
                          </div>
                          <div className="border-t" />
                          <div className="p-1">
                            {filtered.length === 0 ? (
                              <div className="px-2 py-2 text-sm text-muted-foreground">No matching columns.</div>
                            ) : (
                              filtered.map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  className="w-full text-left px-2 py-2 rounded text-foreground hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                  onClick={() => setFieldMapping(field, opt.value)}
                                >
                                  <span className="truncate block" title={opt.label}>
                                    {opt.label}
                                  </span>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Showing {filtered.length} available column{filtered.length === 1 ? '' : 's'}.
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              );
            }

            return ONBOARDING_SYSTEM_FIELDS.map((field) => (
              <FieldPicker key={field} field={field} />
            ));
          })()}
        </div>
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
