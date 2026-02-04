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
You are an expert OCR analyzer for trucking company expense receipts, including CAT scale tickets and combos like Love's + CAT scale. You are analyzing one or more images that might be part of the SAME transaction (e.g., a payment receipt and its corresponding scale ticket).

Task:
Analyze all provided images and extract receipt data.
- **Merge logic**: If you see a Scale Ticket in one image and a Payment Receipt in another (or same image) that appear to be for the same event (similar time, location, or context), COMBINE them into a SINGLE receipt object.
- **Separate logic**: If the images clearly show completely unrelated transactions (different dates, different vendors not part of a combo), return them as SEPARATE objects in the array.

Output ONLY valid JSON as an array of receipts. Extract attributes:

[
  {
    "receipt_type": "receipt, cat_scale, toll, parking_ticket, or other",
    "receipt_number": "Invoice/receipt/scale ticket #",
    "transaction_date": "YYYY-MM-DD",
    "transaction_time": "HH:MM",
    "vendor_name": "Business/store/scale name",
    "vendor_location": "City, state",
    "unit_id": "Extract ONLY the main 4-digit Truck/Unit ID (e.g., '2319'). CRITICAL: Do NOT extract 'Unit', 'Suite', or 'Ste' numbers from addresses (e.g. '123 Main St Unit B' -> Unit ID is NULL). Only extract if labeled as Truck/Tractor/Unit # separate from an address.",
    "payment_method": "Cash, Card, Fuel Card",
    "subtotal": "Number",
    "tax": "Number",
    "total_amount": "Number (Sum of all related costs if merged)",
    "line_items": [
      {
        "description": "Item/service",
        "quantity": "Number",
        "unit_price": "Number",
        "line_total": "Number",
        "category": "fuel, scale, tolls, parking, lodging, meals, repairs, supplies, other"
      }
    ],
    "cat_scale_data": {
      "gross_weight": "Number",
      "axle_weights": "String/Array",
      "scale_id": "ID",
      "ticket_number": "Ticket #"
    },
    "notes": "Notes about merging or issues",
    "source_image_indices": "Array of integers (0-based) representing the input images used for this receipt. Example: [0] or [0, 1] for merged docs."
  }
]

Examples:
- Input: Image 1 (Scale Ticket #555), Image 2 (Receipt for $50).
- Output: ONE object with vendor="CAT Scale", total="50.00", cat_scale_data filled from Image 1.

Rules:
- Scan ALL images provided.
- Merge "informational" docs (like weight tickets) with "financial" docs (receipts) if they match.
- Be precise with Unit IDs.
- Return ONLY JSON.
`;

// Input type
interface AnalyzeDocsData {
    base64Image?: string; // Legacy support (optional)
    images?: string[];    // Legacy array support
    files?: { data: string; mimeType: string }[]; // New robust support
}

export const analyzeDocs = onCall<AnalyzeDocsData>(
    {
        cors: true,
        region: 'us-central1',
        timeoutSeconds: 60, // Increase timeout for multiple images
        memory: "1GiB"
    },
    async (request) => {
        console.log("analyzeDocs v4 loaded");
        // Auth check
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'User must be authenticated.');
        }

        const { base64Image, images, files } = request.data;
        const inputs: { data: string; mimeType: string }[] = [];

        if (files && Array.isArray(files) && files.length > 0) {
            inputs.push(...files);
        } else if (images && Array.isArray(images) && images.length > 0) {
            inputs.push(...images.map(img => ({ data: img, mimeType: 'image/jpeg' })));
        } else if (base64Image) {
            inputs.push({ data: base64Image, mimeType: 'image/jpeg' });
        } else {
            throw new HttpsError('invalid-argument', 'No images/files provided.');
        }

        try {
            // Prepare prompt parts
            const promptParts: any[] = [{ text: ANALYZE_PROMPT }];

            // Add all files
            for (const file of inputs) {
                const mime = file.mimeType || 'image/jpeg';
                const b64 = file.data;
                promptParts.push({
                    media: {
                        url: `data:${mime};base64,${b64}`,
                        contentType: mime // Optional but helpful hint
                    }
                });
            }

            const result = await ai.generate({
                prompt: promptParts
            });

            const textResponse = result.text;

            // Clean JSON
            let cleanedJson = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsedData = JSON.parse(cleanedJson);

            return { receipts: parsedData };
        } catch (error: any) {
            console.error("Analysis Error:", error);
            if (error instanceof HttpsError) throw error;
            throw new HttpsError('internal', error.message || 'Analysis failed');
        }
    }
);
