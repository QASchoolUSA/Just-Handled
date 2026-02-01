import { NextRequest, NextResponse } from 'next/server';
import { ai } from '@/ai/genkit';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString('base64');
        const dataUri = `data:${file.type};base64,${base64Data}`;

        const prompt = `
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

        const result = await ai.generate({
            prompt: [
                { text: prompt },
                { media: { url: dataUri } }
            ]
        });

        const textResponse = result.text;

        // Attempt to parse JSON from the response (it might be wrapped in markdown code blocks)
        let cleanedJson = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        let parsedData;

        try {
            parsedData = JSON.parse(cleanedJson);
        } catch (e) {
            console.error("Failed to parse JSON from Genkit response:", textResponse);
            return NextResponse.json({ error: 'Failed to parse AI response', raw: textResponse }, { status: 500 });
        }

        return NextResponse.json({ receipts: parsedData });

    } catch (error) {
        console.error('Error analyzing document:', error);
        return NextResponse.json({ error: 'Failed to analyze document' }, { status: 500 });
    }
}
