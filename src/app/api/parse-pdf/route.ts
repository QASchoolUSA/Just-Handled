import { NextResponse } from 'next/server';
import PDFParser from 'pdf2json';

export async function POST(req: Request): Promise<Response> {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const pdfParser = new PDFParser(null, true);

        return new Promise<Response>((resolve) => {
            pdfParser.on("pdfParser_dataError", (errData: any) => {
                console.error(errData.parserError);
                resolve(NextResponse.json({ error: 'Failed to parse PDF' }, { status: 500 }));
            });

            pdfParser.on("pdfParser_dataReady", () => {
                const text = pdfParser.getRawTextContent();
                resolve(NextResponse.json({ text }));
            });

            pdfParser.parseBuffer(buffer);
        });

    } catch (error) {
        console.error('Error parsing PDF:', error);
        return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
    }
}
