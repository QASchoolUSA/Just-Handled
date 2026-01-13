'use server';

/**
 * @fileOverview Validates that the 'Accrued Driver Pay' liability account nets to $0 after settlements.
 *
 * - validateAccruedPay - A function that validates the accrued pay.
 * - ValidateAccruedPayInput - The input type for the validateAccruedPay function.
 * - ValidateAccruedPayOutput - The return type for the validateAccruedPay function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ValidateAccruedPayInputSchema = z.number().describe('The balance of the Accrued Driver Pay account.');
export type ValidateAccruedPayInput = z.infer<typeof ValidateAccruedPayInputSchema>;

const ValidateAccruedPayOutputSchema = z.object({
  isValid: z.boolean().describe('Whether the Accrued Driver Pay account balance is valid (i.e., $0).'),
  message: z.string().describe('A message indicating whether the balance is valid or explaining the discrepancy.'),
});
export type ValidateAccruedPayOutput = z.infer<typeof ValidateAccruedPayOutputSchema>;

export async function validateAccruedPay(input: ValidateAccruedPayInput): Promise<ValidateAccruedPayOutput> {
  return validateAccruedPayFlow(input);
}

const validateAccruedPayPrompt = ai.definePrompt({
  name: 'validateAccruedPayPrompt',
  input: {schema: ValidateAccruedPayInputSchema},
  output: {schema: ValidateAccruedPayOutputSchema},
  prompt: `You are an expert accounting assistant. Your task is to validate the balance of the 'Accrued Driver Pay' account.

  The account balance is: {{input}}.

  If the balance is 0, then the account is valid. If the balance is not 0, then the account is invalid and there is a discrepancy that needs to be investigated.

  Return a JSON object with the following schema:
  {
    "isValid": boolean, // true if the balance is 0, false otherwise
    "message": string // A message indicating whether the balance is valid or explaining the discrepancy.
  }

  If the balance is valid, the message should be 'Accrued Driver Pay balance is valid (i.e., $0).' If the balance is not valid, the message should be 'Accrued Driver Pay balance is invalid. Please investigate the discrepancy.'

  Make sure to return a valid JSON object.
  `,
});

const validateAccruedPayFlow = ai.defineFlow(
  {
    name: 'validateAccruedPayFlow',
    inputSchema: ValidateAccruedPayInputSchema,
    outputSchema: ValidateAccruedPayOutputSchema,
  },
  async input => {
    const {output} = await validateAccruedPayPrompt(input);
    return output!;
  }
);
