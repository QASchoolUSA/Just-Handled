'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { parseUploadedFile, getAcceptedFileTypes } from '@/lib/onboarding/parse-file';
import type { ParsedFile } from '@/lib/onboarding/types';

interface OnboardingUploadStepProps {
  onParsed: (parsed: ParsedFile) => void;
}

export function OnboardingUploadStep({ onParsed }: OnboardingUploadStepProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      const parsed = await parseUploadedFile(file);
      if (parsed.rows.length === 0) {
        setError('No data rows found in the file.');
        setLoading(false);
        return;
      }
      onParsed(parsed);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to parse file.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
          drag ? 'border-primary bg-primary/5' : 'border-border bg-muted/20'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
      >
        <input
          type="file"
          accept={getAcceptedFileTypes()}
          className="hidden"
          id="onboarding-file"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          disabled={loading}
        />
        <label htmlFor="onboarding-file" className="cursor-pointer block">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              {loading ? (
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              ) : (
                <Upload className="h-8 w-8 text-primary" />
              )}
            </div>
          </div>
          <p className="font-medium text-foreground">
            {loading ? 'Reading file...' : 'Drop your file here or click to browse'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            CSV or Excel (.xlsx, .xls) — loads and trips
          </p>
        </label>
      </div>
      {error && (
        <p className="text-sm text-destructive flex items-center gap-2">
          <FileText className="h-4 w-4" />
          {error}
        </p>
      )}
    </div>
  );
}
