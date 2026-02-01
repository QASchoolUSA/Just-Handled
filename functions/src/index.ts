import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { genkit } from 'genkit';
import { vertexAI } from '@genkit-ai/vertexai';

// Initialize Genkit
const ai = genkit({
    plugins: [
        vertexAI({ location: 'us-central1' })
    ],
    model: 'vertexai/gemini-2.5-flash',
});

const ANALYZE_PROMPT = `
You are an expert OCR analyzer for trucking company expense receipts, including CAT scale tickets and combos like Love's + CAT scale in one image. Analyze the uploaded image(s) and extract ALL visible text accurately. Always treat as MULTIPLE receipts if more than one vendor/document appears (e.g., fuel receipt next to scale ticket).

Output ONLY valid JSON as an array of receipts for reimbursements and IRS compliance. Extract EXACTLY these fields for each (leave as null/empty string if not found; infer trucking categories):

[
  {
    "receipt_type": "receipt, cat_scale, toll, parking_ticket, or other",
    "receipt_number": "Invoice/receipt/scale ticket # (e.g., INV-1234 or CAT-567)",
    "transaction_date": "YYYY-MM-DD format (or full date if unclear)",
    "transaction_time": "HH:MM if available",
    "vendor_name": "Business/store/scale name (e.g., Love's, CAT Scale)",
    "vendor_location": "City, state, or full address (e.g., Auburndale, FL)",
    "payment_method": "Cash, Card (last 4 digits if shown), Fuel Card, etc.",
    "subtotal": "Number only, e.g., 125.50",
    "tax": "Number only, e.g., 8.25",
    "total_amount": "Number only, e.g., 133.75",
    "line_items": [
      {
        "description": "Item/service (e.g., Diesel Fuel 50 gal, Scale Weigh)",
        "quantity": "Number, e.g., 50",
        "unit_price": "Number, e.g., 4.25",
        "line_total": "Number, e.g., 212.50",
        "category": "fuel, scale, tolls, parking, lodging, meals, repairs, supplies, other"
      }
    ],
    "cat_scale_data": {
      "gross_weight": "Number, e.g., 78500 lbs",
      "axle_weights": "Array or string, e.g., [12000, 34000, 32500] or 'Steer:12k Drive:34k Trailer:32k'",
      "scale_id": "Scale location/ID if shown",
      "truck_info": "Truck/trailer VIN, plate, or unit #"
    },
    "notes": "Business purpose, truck #, load ID, low-confidence text, or 'Combo image with Love's fuel'"
  }
]

Rules:
- Scan entire image for multiple docs; output one object per distinct receipt/scale ticket.
- CAT scales: Prioritize weights (gross, steer/drive/trailer axle), scale ID/location; categorize as "scale".
- Fuel receipts (Love's, Pilot): Extract gallons, $/gal, odometer if shown.
- Infer category from description (Diesel/Unleaded → fuel; 'Weigh' or weights → scale).
- Handle faded/angled/combined images best effort; flag issues in notes.
- Prioritize bold/large text for totals/dates/weights.
- Respond ONLY with valid JSON array, no extra text. Empty image? Return [].
`;

// Input type
interface AnalyzeDocsData {
    base64Image: string;
}

export const analyzeDocs = onCall<AnalyzeDocsData>(
    {
        cors: true,
        region: 'us-central1'
    },
    async (request) => {
        // Auth check
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'User must be authenticated.');
        }

        const { base64Image } = request.data;
        if (!base64Image) {
            throw new HttpsError('invalid-argument', 'base64Image is required.');
        }

        try {
            const dataUri = `data:image/jpeg;base64,${base64Image}`;

            const result = await ai.generate({
                prompt: [
                    { text: ANALYZE_PROMPT },
                    { media: { url: dataUri } }
                ]
            });

            const textResponse = result.text;

            // Clean JSON
            let cleanedJson = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
            let parsedData;

            try {
                parsedData = JSON.parse(cleanedJson);
            } catch (e) {
                console.error("Failed to parse JSON from Genkit response:", textResponse);
                throw new HttpsError('internal', 'Failed to parse AI response', { raw: textResponse });
            }

            return { receipts: parsedData };
        } catch (error: any) {
            console.error("Analysis Error:", error);
            // Re-throw HttpsError or wrap others
            if (error instanceof HttpsError) throw error;
            throw new HttpsError('internal', error.message || 'Analysis failed');
        }
    }
);
