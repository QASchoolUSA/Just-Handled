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
  if (ms < 1000) return 'less than a second';
  const sec = Math.ceil(ms / 1000);
  if (sec < 60) return `~${sec} sec`;
  const min = Math.ceil(sec / 60);
  return `~${min} min`;
}

function phaseLabel(phase: ImportProgress['phase']): string {
  switch (phase) {
    case 'drivers':
      return 'Creating drivers';
    case 'loads':
      return 'Importing loads';
    case 'merging':
      return 'Merging drivers';
    default:
      return 'Processing';
  }
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
      <div className="py-8 sm:py-10 text-center px-2">
        <p className="text-destructive font-medium">{error}</p>
        <p className="text-sm text-muted-foreground mt-2">
          You can try again from the mapping step or skip onboarding.
        </p>
      </div>
    );
  }

  if (done && result) {
    return (
      <div className="py-8 sm:py-12 flex flex-col items-center justify-center text-center">
        <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mb-5">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <h3 className="font-semibold text-lg sm:text-xl">Import complete</h3>
        <p className="text-muted-foreground mt-1.5 text-sm sm:text-base">
          {result.driversCreated.toLocaleString()} driver{result.driversCreated !== 1 ? 's' : ''} and{' '}
          {result.loadsCreated.toLocaleString()} load{result.loadsCreated !== 1 ? 's' : ''} added.
        </p>
        <button
          onClick={onComplete}
          className="mt-6 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
        >
          Go to dashboard
        </button>
      </div>
    );
  }

  const phase = progress?.phase ?? 'drivers';
  const eta =
    progress?.estimatedMsRemaining != null && progress.estimatedMsRemaining > 0
      ? formatEta(progress.estimatedMsRemaining)
      : null;

  return (
    <div className="py-6 sm:py-8 space-y-6">
      <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
        <Loader2 className="h-7 w-7 sm:h-8 sm:w-8 text-primary animate-spin shrink-0" />
        <div className="text-center sm:text-left">
          <p className="font-medium text-foreground">{phaseLabel(phase)}</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {progress?.message ?? 'Preparing…'}
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <Progress value={percent} className="h-2.5 sm:h-3" />
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>
            <span className="font-medium tabular-nums text-foreground">
              {currentStep.toLocaleString()}
            </span>
            {' of '}
            <span className="font-medium tabular-nums text-foreground">
              {totalSteps.toLocaleString()}
            </span>
            {' · '}
            <span className="font-medium tabular-nums text-foreground">{percent}%</span>
          </span>
          {eta && (
            <>
              <span className="hidden sm:inline text-muted-foreground/70">·</span>
              <span>Est. {eta} left</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
