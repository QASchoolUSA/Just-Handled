'use client';

import React, { useState } from 'react';
import { Upload, Loader2, FileWarning } from 'lucide-react';
import { parseUploadedFile, getAcceptedFileTypes } from '@/lib/onboarding/parse-file';
import type { ParsedFile } from '@/lib/onboarding/types';

interface OnboardingUploadStepProps {
  onParsed: (parsed: ParsedFile) => void;
}

export function OnboardingUploadStep({ onParsed }: OnboardingUploadStepProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setSelectedName(file.name);
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

  const accept = getAcceptedFileTypes();

  return (
    <div className="space-y-5">
      <div
        className={`
          relative border-2 border-dashed rounded-2xl min-h-[200px] sm:min-h-[240px] flex flex-col items-center justify-center
          px-6 py-8 sm:px-10 sm:py-12 text-center transition-all duration-200 ease-out
          ${drag ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-muted-foreground/30 bg-muted/10 hover:bg-muted/20'}
          ${error ? 'border-destructive/50 bg-destructive/5' : ''}
        `}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
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
          accept={accept}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          id="onboarding-file"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          disabled={loading}
          aria-label="Select CSV or Excel file"
        />
        <div className="pointer-events-none flex flex-col items-center">
          <div
            className={`
              h-16 w-16 sm:h-20 sm:w-20 rounded-2xl flex items-center justify-center mb-4 transition-colors
              ${loading ? 'bg-primary/10' : 'bg-primary/5'}
            `}
          >
            {loading ? (
              <Loader2 className="h-8 w-8 sm:h-10 sm:w-10 text-primary animate-spin" />
            ) : (
              <Upload className="h-8 w-8 sm:h-10 sm:w-10 text-primary" />
            )}
          </div>
          <p className="font-semibold text-foreground text-base sm:text-lg">
            {loading ? 'Reading file…' : 'Drop your file here or click to select'}
          </p>
          <p className="text-sm text-muted-foreground mt-1.5">
            CSV or Excel (.xlsx, .xls) — loads and trips
          </p>
          {selectedName && !loading && !error && (
            <p className="text-sm text-muted-foreground mt-3 font-mono truncate max-w-full px-4" title={selectedName}>
              Selected: {selectedName}
            </p>
          )}
        </div>
      </div>
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <FileWarning className="h-5 w-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
