'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, Loader, Scale } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { validateAccruedPay } from '@/ai/flows/accrued-pay-validation';
import { useToast } from '@/hooks/use-toast';

type ValidationResult = {
  isValid: boolean;
  message: string;
} | null;

export default function AccruedPayHealthCheck({ balance }: { balance: number }) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ValidationResult>(null);
  const { toast } = useToast();

  const handleValidation = async () => {
    setIsLoading(true);
    setResult(null);
    try {
      const validationResponse = await validateAccruedPay(balance);
      setResult(validationResponse);
    } catch (error) {
      console.error('Validation failed:', error);
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Could not connect to the validation service.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Accrued Pay Balance</CardTitle>
        <Scale className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{formatCurrency(balance)}</div>
        <p className="text-xs text-muted-foreground">
          Should be $0 after all settlements are paid.
        </p>
        {result && (
          <Alert variant={result.isValid ? 'default' : 'destructive'} className="mt-4">
            {result.isValid ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            <AlertTitle>{result.isValid ? 'Valid' : 'Discrepancy Detected'}</AlertTitle>
            <AlertDescription>{result.message}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={handleValidation} disabled={isLoading} size="sm">
          {isLoading ? (
            <Loader className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle className="mr-2 h-4 w-4" />
          )}
          Validate Balance
        </Button>
      </CardFooter>
    </Card>
  );
}
