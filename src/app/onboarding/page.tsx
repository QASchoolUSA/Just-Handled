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
  CheckCircle2,
  ArrowRight,
  Truck,
} from 'lucide-react';
import { OnboardingUploadStep } from '@/app/onboarding/upload-step';
import { OnboardingMappingStep } from '@/app/onboarding/mapping-step';
import { OnboardingImportStep } from '@/app/onboarding/import-step';
import type { ParsedFile } from '@/lib/onboarding/types';
import type { ColumnMapping } from '@/lib/onboarding/types';
import type { NormalizedRow } from '@/lib/onboarding/types';

type Step = 'upload' | 'mapping' | 'import';

export default function OnboardingPage() {
  const router = useRouter();
  const firestore = useFirestore();
  const { user } = useUser();
  const { companyId, company } = useCompany();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('upload');
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [normalizedRows, setNormalizedRows] = useState<NormalizedRow[]>([]);

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
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container max-w-3xl mx-auto py-10 px-4">
        <div className="flex flex-col items-center text-center mb-10">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Truck className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome to Just Handled</h1>
          <p className="text-muted-foreground mt-1">
            Import your loads and drivers to get started, or skip and add data later.
          </p>
          <div className="mt-6">
            <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground">
              <SkipForward className="mr-2 h-4 w-4" />
              Skip for now
            </Button>
          </div>
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardHeader className="border-b bg-muted/20">
            <div className="flex items-center gap-2">
              {step === 'upload' && <Upload className="h-5 w-5 text-primary" />}
              {step === 'mapping' && <FileSpreadsheet className="h-5 w-5 text-primary" />}
              {step === 'import' && <Loader2 className="h-5 w-5 text-primary" />}
              <CardTitle className="text-lg">
                {step === 'upload' && 'Step 1: Upload your file'}
                {step === 'mapping' && 'Step 2: Map columns'}
                {step === 'import' && 'Step 3: Importing...'}
              </CardTitle>
            </div>
            <CardDescription>
              {step === 'upload' && 'Upload a CSV or Excel file with your loads and trips.'}
              {step === 'mapping' && 'Match your file columns to our system fields.'}
              {step === 'import' && 'Your data is being imported. This may take a few minutes.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
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
