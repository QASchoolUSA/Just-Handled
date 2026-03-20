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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
                  <Select
                    value={mapping[fieldId] ?? SENTINEL_NONE}
                    onValueChange={(v) =>
                      setMapping((prev) => ({
                        ...prev,
                        [fieldId]: v === SENTINEL_NONE || v === '' ? undefined : v,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select column…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SENTINEL_NONE}>Don&apos;t map</SelectItem>
                      {parsed.headers.map((h, i) => {
                        const value = h === '' || h == null ? `__empty_${i}__` : h;
                        const currentValue = mapping[fieldId] ?? SENTINEL_NONE;
                        const isTakenByAnotherField = takenColumns.has(value) && value !== currentValue;
                        if (isTakenByAnotherField) return null;
                        return (
                          <SelectItem key={value} value={value}>
                            {h === '' || h == null ? `(Column ${i + 1})` : h}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
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
