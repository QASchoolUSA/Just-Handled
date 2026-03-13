'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc } from 'firebase/firestore';
import { useFirestore, useUser, useCompany } from '@/firebase/provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  Upload,
  FileSpreadsheet,
  SkipForward,
  Loader2,
  Truck,
  Check,
} from 'lucide-react';
import { OnboardingUploadStep } from '@/app/onboarding/upload-step';
import { OnboardingMappingStep } from '@/app/onboarding/mapping-step';
import { OnboardingImportStep } from '@/app/onboarding/import-step';
import type { ParsedFile } from '@/lib/onboarding/types';
import type { ColumnMapping } from '@/lib/onboarding/types';
import type { NormalizedRow } from '@/lib/onboarding/types';

type Step = 'upload' | 'mapping' | 'import';

const STEPS: { id: Step; label: string; short: string }[] = [
  { id: 'upload', label: 'Upload file', short: 'Upload' },
  { id: 'mapping', label: 'Map columns', short: 'Map' },
  { id: 'import', label: 'Import data', short: 'Import' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const firestore = useFirestore();
  const { user } = useUser();
  const { companyId } = useCompany();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('upload');
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [normalizedRows, setNormalizedRows] = useState<NormalizedRow[]>([]);

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const handleSkip = useCallback(async () => {
    if (!firestore || !companyId) return;
    try {
      await updateDoc(doc(firestore, 'companies', companyId), {
        onboardingSkippedAt: Date.now(),
      });
      toast({ title: 'Onboarding skipped', description: 'You can import data later from Settlements.' });
      router.push('/');
    } catch (e) {
      console.error(e);
      toast({ variant: 'destructive', title: 'Could not skip', description: 'Please try again.' });
    }
  }, [firestore, companyId, router, toast]);

  const handleComplete = useCallback(async () => {
    if (!firestore || !companyId) return;
    try {
      await updateDoc(doc(firestore, 'companies', companyId), {
        onboardingCompleted: true,
      });
      toast({ title: 'Import complete', description: 'Your data is ready in Settlements.' });
      router.push('/');
    } catch (e) {
      console.error(e);
      toast({ variant: 'destructive', title: 'Could not complete', description: 'Please try again.' });
    }
  }, [firestore, companyId, router, toast]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      <div className="container max-w-3xl mx-auto py-8 sm:py-12 px-4 sm:px-6">
        <header className="flex flex-col items-center text-center mb-8 sm:mb-10">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Truck className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Welcome to Just Handled</h1>
          <p className="text-muted-foreground mt-1.5 text-sm sm:text-base max-w-md">
            Import your loads and drivers to get started, or skip and add data later.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            className="mt-5 text-muted-foreground hover:text-foreground"
          >
            <SkipForward className="mr-2 h-4 w-4" />
            Skip for now
          </Button>
        </header>

        {/* Step indicator */}
        <nav className="flex items-center justify-center gap-0 sm:gap-2 mb-6 sm:mb-8" aria-label="Progress">
          {STEPS.map((s, i) => {
            const isActive = step === s.id;
            const isPast = stepIndex > i;
            return (
              <React.Fragment key={s.id}>
                <div
                  className={`
                    flex items-center justify-center gap-2 rounded-full border-2 transition-all duration-300
                    w-9 h-9 sm:w-10 sm:h-10 text-sm font-medium
                    ${isActive ? 'border-primary bg-primary text-primary-foreground' : ''}
                    ${isPast ? 'border-primary bg-primary/10 text-primary' : ''}
                    ${!isActive && !isPast ? 'border-muted-foreground/30 bg-muted/30 text-muted-foreground' : ''}
                  `}
                  title={s.label}
                >
                  {isPast ? <Check className="h-4 w-4 sm:h-5 sm:w-5" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`
                      hidden sm:block w-8 sm:w-12 h-0.5 rounded-full transition-colors duration-300
                      ${isPast ? 'bg-primary' : 'bg-muted-foreground/20'}
                    `}
                  />
                )}
              </React.Fragment>
            );
          })}
        </nav>

        <Card className="border-border/50 shadow-lg overflow-hidden">
          <CardHeader className="border-b bg-muted/10 px-4 sm:px-6 py-5 sm:py-6">
            <CardTitle className="text-lg sm:text-xl">
              {STEPS[stepIndex]?.label}
            </CardTitle>
            <CardDescription className="text-sm sm:text-base mt-0.5">
              {step === 'upload' && 'Upload a CSV or Excel file with your loads and trips.'}
              {step === 'mapping' && 'Match your file columns to our system fields. Required: Load #, Driver, Pickup Date, Delivery Date.'}
              {step === 'import' && 'Your data is being imported. Do not close this page.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 py-5 sm:py-6">
            {step === 'upload' && (
              <OnboardingUploadStep
                onParsed={(p) => {
                  setParsed(p);
                  setStep('mapping');
                }}
              />
            )}
            {step === 'mapping' && parsed && (
              <OnboardingMappingStep
                parsed={parsed}
                mapping={mapping}
                onMappingChange={setMapping}
                onStartImport={(rows) => {
                  setNormalizedRows(rows);
                  setStep('import');
                }}
                onBack={() => setStep('upload')}
              />
            )}
            {step === 'import' && normalizedRows.length > 0 && companyId && firestore && (
              <OnboardingImportStep
                firestore={firestore}
                companyId={companyId}
                rows={normalizedRows}
                onComplete={handleComplete}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
