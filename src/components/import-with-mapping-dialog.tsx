'use client';

import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import type { ParsedFile } from '@/lib/onboarding/types';
import type { ColumnMapping, ImportMappingConfig } from '@/lib/import-mapping';
import { canImportWithMapping, SENTINEL_NONE } from '@/lib/import-mapping';

export interface ImportWithMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parsed: ParsedFile | null;
  config: ImportMappingConfig;
  title?: string;
  description?: string;
  /** Called with the chosen mapping when user clicks Import. */
  onConfirm: (mapping: ColumnMapping) => void;
  /** Optional: render custom preview (e.g. first 5 rows table). If not provided, shows row count only. */
  renderPreview?: (mapping: ColumnMapping, parsed: ParsedFile) => React.ReactNode;
}

export function ImportWithMappingDialog({
  open,
  onOpenChange,
  parsed,
  config,
  title = 'Map columns',
  description = 'Match each field to a column in your file. Required fields are marked with *.',
  onConfirm,
  renderPreview,
}: ImportWithMappingDialogProps) {
  const [mapping, setMapping] = useState<ColumnMapping>({});

  const takenColumns = useMemo(() => {
    // `mapping` stores only actual mapped column ids (not SENTINEL_NONE), so we can safely use its values.
    return new Set(Object.values(mapping).filter((v): v is string => typeof v === 'string' && v.trim() !== ''));
  }, [mapping]);

  const getOptionValue = (header: string, i: number) => {
    return header === '' || header == null ? `__empty_${i}__` : header;
  };

  const getOptionLabel = (header: string, i: number) => {
    return header === '' || header == null ? `(Column ${i + 1})` : header;
  };

  function ColumnPicker({
    headers,
    value,
    onChange,
  }: {
    headers: string[];
    value: string | undefined;
    onChange: (next: string | undefined) => void;
  }) {
    const [query, setQuery] = React.useState('');

    const currentValue = value ?? undefined;
    React.useEffect(() => {
      setQuery('');
    }, [currentValue]);

    const selectedIdx = currentValue
      ? headers.findIndex((h, i) => getOptionValue(String(h ?? ''), i) === currentValue)
      : -1;
    const selectedLabel =
      selectedIdx >= 0
        ? getOptionLabel(String(headers[selectedIdx] ?? ''), selectedIdx)
        : currentValue;

    const available = React.useMemo(() => {
      return headers
        .map((h, i) => {
          const raw = String(h ?? '');
          const v = getOptionValue(raw, i);
          return { raw, index: i, value: v, label: getOptionLabel(raw, i) };
        })
        .filter((opt) => {
          // Exclude values taken by other fields.
          if (takenColumns.has(opt.value) && opt.value !== currentValue) return false;
          return true;
        });
    }, [headers, takenColumns, currentValue]);

    const filtered = React.useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return available;
      return available.filter((opt) => opt.label.toLowerCase().includes(q));
    }, [available, query]);

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-start h-9 font-normal text-left"
            type="button"
          >
            {currentValue ? <span className="truncate" title={selectedLabel}>{selectedLabel}</span> : (
              <span className="text-muted-foreground">Select column…</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[520px] max-w-[85vw] p-3">
          <div className="space-y-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search columns…"
              className="h-9"
            />
            <div className="max-h-[260px] overflow-auto border rounded-md">
              <div className="p-1">
                <button
                  type="button"
                  className="w-full text-left px-2 py-2 rounded hover:bg-muted/50"
                  onClick={() => onChange(undefined)}
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
                      className="w-full text-left px-2 py-2 rounded hover:bg-muted/50"
                      onClick={() => onChange(opt.value)}
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
    );
  }

  const canImport = useMemo(
    () => parsed != null && canImportWithMapping(parsed, mapping, config),
    [parsed, mapping, config]
  );

  const handleConfirm = () => {
    if (!canImport || !parsed) return;
    onConfirm(mapping);
    onOpenChange(false);
    setMapping({});
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) setMapping({});
    onOpenChange(next);
  };

  return (
    // Important: Popovers inside this dialog render via Portal.
    // When the dialog is modal, Radix can treat portal interactions as "outside"
    // and close the dialog before the mapping state can be reflected.
    <Dialog open={open} onOpenChange={handleOpenChange} modal={false}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {parsed && (
          <>
            <div className="grid gap-4 py-2">
              {config.systemFields.map((fieldId) => (
                <div key={fieldId} className="grid gap-2">
                  <Label className="flex items-center gap-1 text-sm">
                    {config.fieldLabels[fieldId] ?? fieldId}
                    {config.requiredFields.includes(fieldId) && (
                      <span className="text-destructive" aria-label="Required">*</span>
                    )}
                  </Label>
                  <ColumnPicker
                    headers={parsed.headers}
                    value={mapping[fieldId]}
                    onChange={(nextValue) => {
                      setMapping((prev) => {
                        const next: ColumnMapping = { ...prev };
                        next[fieldId] = nextValue;

                        if (nextValue) {
                          for (const otherFieldId of config.systemFields) {
                            if (otherFieldId === fieldId) continue;
                            if (next[otherFieldId] === nextValue) next[otherFieldId] = undefined;
                          }
                        }

                        return next;
                      });
                    }}
                  />
                </div>
              ))}
            </div>

            <div className="rounded-lg border bg-muted/10 p-3 text-sm text-muted-foreground">
              {parsed.rows.length.toLocaleString()} row{parsed.rows.length !== 1 ? 's' : ''} will be imported
              {!canImport && mapping && Object.keys(mapping).length > 0 && (
                <span className="block mt-1 text-destructive">Map all required fields to continue.</span>
              )}
            </div>

            {renderPreview && renderPreview(mapping, parsed)}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canImport} onClick={handleConfirm}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
