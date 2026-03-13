'use client';

import React, { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { runOnboardingImport } from '@/lib/onboarding/import-batches';
import type { ImportProgress } from '@/lib/onboarding/import-batches';
import type { NormalizedRow } from '@/lib/onboarding/types';
import type { Firestore } from 'firebase/firestore';

interface OnboardingImportStepProps {
  firestore: Firestore;
  companyId: string;
  rows: NormalizedRow[];
  onComplete: () => void;
}

function formatEta(ms: number): string {
  if (ms < 1000) return 'Less than a second';
  const sec = Math.ceil(ms / 1000);
  if (sec < 60) return `About ${sec} sec`;
  const min = Math.ceil(sec / 60);
  return `About ${min} min`;
}

export function OnboardingImportStep({
  firestore,
  companyId,
  rows,
  onComplete,
}: OnboardingImportStepProps) {
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ driversCreated: number; loadsCreated: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await runOnboardingImport(
          firestore,
          companyId,
          rows,
          (p) => {
            if (!cancelled) setProgress(p);
          }
        );
        if (!cancelled) {
          setResult({ driversCreated: res.driversCreated, loadsCreated: res.loadsCreated });
          setDone(true);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Import failed');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firestore, companyId, rows]);

  const totalSteps = progress
    ? progress.phase === 'drivers' || progress.phase === 'merging'
      ? progress.total
      : rows.length
    : rows.length;
  const currentStep = progress?.current ?? 0;
  const percent = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;

  if (error) {
    return (
      <div className="py-8 text-center">
        <p className="text-destructive font-medium">{error}</p>
        <p className="text-sm text-muted-foreground mt-2">You can try again from the mapping step or skip onboarding.</p>
      </div>
    );
  }

  if (done && result) {
    return (
      <div className="py-8 flex flex-col items-center justify-center text-center">
        <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <h3 className="font-semibold text-lg">Import complete</h3>
        <p className="text-muted-foreground mt-1">
          {result.driversCreated} driver{result.driversCreated !== 1 ? 's' : ''} and {result.loadsCreated} load{result.loadsCreated !== 1 ? 's' : ''} added.
        </p>
        <button
          onClick={onComplete}
          className="mt-6 px-6 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90"
        >
          Go to dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="py-8 space-y-6">
      <div className="flex items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
        <span className="font-medium">{progress?.message ?? 'Preparing...'}</span>
      </div>
      <div className="space-y-2">
        <Progress value={percent} className="h-3" />
        <p className="text-sm text-muted-foreground text-center">
          {currentStep} of {totalSteps} · {percent}%
          {progress?.estimatedMsRemaining != null && progress.estimatedMsRemaining > 0 && (
            <> · {formatEta(progress.estimatedMsRemaining)} remaining</>
          )}
        </p>
      </div>
    </div>
  );
}
