import OpenAI from "openai";
import { parse } from "csv-parse/sync";
import { PDFParse } from "pdf-parse";
import type { InsertPriceListRow } from "@shared/schema";

export class DocumentParserError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = "DocumentParserError";
  }
}

export type ExtractedPriceListItem = Omit<InsertPriceListRow, 'supplierId'> & {
  confidence?: number;
  uncertainFields?: string[];
};

export type ParsedDocumentResult = {
  items: ExtractedPriceListItem[];
  metadata: {
    fileName: string;
    fileType: string;
    itemCount: number;
    avgConfidence?: number;
  };
};

function checkOpenAICredentials(): void {
  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    throw new DocumentParserError(
      "OpenAI API key is not configured. Please set up your OpenAI integration.",
      503,
      { missingCredential: "AI_INTEGRATIONS_OPENAI_API_KEY" }
    );
  }
  
  if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
    throw new DocumentParserError(
      "OpenAI base URL is not configured. Please set up your OpenAI integration.",
      503,
      { missingCredential: "AI_INTEGRATIONS_OPENAI_BASE_URL" }
    );
  }
}

/**
 * Parse CSV file and extract price list items
 */
export async function parseCSV(buffer: Buffer, fileName: string): Promise<ParsedDocumentResult> {
  try {
    const records = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });

    if (!records || records.length === 0) {
      throw new DocumentParserError("CSV file is empty or has no data rows", 400);
    }

    const items: ExtractedPriceListItem[] = records.map((record: any) => {
      // Try to match common column names (case-insensitive)
      const getField = (variations: string[]): string | null => {
        for (const key of Object.keys(record)) {
          if (variations.some(v => key.toLowerCase().includes(v.toLowerCase()))) {
            return record[key]?.toString().trim() || null;
          }
        }
        return null;
      };

      const sku = getField(['sku', 'code', 'item code', 'product code']) || '';
      const productName = getField(['product', 'name', 'description', 'item name']) || '';
      const unitType = (getField(['unit', 'type', 'uom', 'unit type']) || 'box').toLowerCase();
      const unitPrice = parseFloat(getField(['price', 'unit price', 'cost', 'unit cost']) || '0');
      const currency = getField(['currency', 'curr']) || 'GBP';
      const minQty = parseInt(getField(['min', 'min qty', 'minimum']) || '1');
      const maxQty = parseInt(getField(['max', 'max qty', 'maximum']) || '0') || null;
      const notes = getField(['notes', 'note', 'comments', 'description']) || '';

      return {
        sku,
        productName,
        unitType,
        unitPrice,
        currency,
        minQty: isNaN(minQty) ? 1 : minQty,
        maxQty: maxQty && !isNaN(maxQty) ? maxQty : null,
        notes: notes || '',
        confidence: 1.0, // CSV is structured, high confidence
        uncertainFields: [],
      };
    });

    // Filter out items with missing required fields
    const validItems = items.filter(item => item.productName && item.unitPrice > 0);

    if (validItems.length === 0) {
      throw new DocumentParserError(
        "Could not extract any valid price list items from CSV. Please ensure the file has columns for product name and price.",
        400
      );
    }

    return {
      items: validItems,
      metadata: {
        fileName,
        fileType: 'csv',
        itemCount: validItems.length,
        avgConfidence: 1.0,
      },
    };
  } catch (error: any) {
    if (error instanceof DocumentParserError) {
      throw error;
    }
    console.error("CSV parsing error:", error);
    throw new DocumentParserError(
      "Failed to parse CSV file. Please ensure it's a valid CSV with headers.",
      400,
      { originalError: error.message }
    );
  }
}

/**
 * Parse PDF file and extract price list items using OpenAI vision
 */
export async function parsePDF(buffer: Buffer, fileName: string): Promise<ParsedDocumentResult> {
  try {
    // Extract text from PDF using pdf-parse
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const pdfText = result.text;

    if (!pdfText || pdfText.trim().length === 0) {
      throw new DocumentParserError("PDF appears to be empty or contains no extractable text", 400);
    }

    // Use OpenAI to parse the PDF text into structured data
    return await parseWithAI(pdfText, fileName, 'pdf');
  } catch (error: any) {
    if (error instanceof DocumentParserError) {
      throw error;
    }
    console.error("PDF parsing error:", error);
    throw new DocumentParserError(
      "Failed to parse PDF file. Please ensure it's a valid PDF document.",
      400,
      { originalError: error.message }
    );
  }
}

/**
 * Parse image file (PNG/JPG) using OpenAI vision API
 */
export async function parseImage(buffer: Buffer, fileName: string, mimeType: string): Promise<ParsedDocumentResult> {
  checkOpenAICredentials();

  const openai = new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
  });

  try {
    // Convert buffer to base64
    const base64Image = buffer.toString('base64');
    const imageUrl = `data:${mimeType};base64,${base64Image}`;

    const systemMessage = `You are a data extraction assistant. Extract product price list information from the image.
Extract ALL products/items you can find in the table or list format.

For each item, extract:
- sku: Product SKU/code (if available, otherwise leave empty)
- productName: Product name/description (REQUIRED)
- unitType: Unit type (box, pallet, m2, unit, etc. - default to "box" if unclear)
- unitPrice: Price per unit (REQUIRED, must be a number)
- currency: Currency code (default to "GBP" if not specified)
- minQty: Minimum quantity (default to 1 if not specified)
- maxQty: Maximum quantity (null if not specified)
- notes: Any additional notes or specifications

Return ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "items": [
    {
      "sku": "string",
      "productName": "string",
      "unitType": "string",
      "unitPrice": number,
      "currency": "string",
      "minQty": number,
      "maxQty": number or null,
      "notes": "string",
      "confidence": number (0.0-1.0),
      "uncertainFields": ["field1", "field2"]
    }
  ]
}

If you're uncertain about any field, include it in uncertainFields array and lower the confidence score.
If you cannot extract any valid items, return: {"items": []}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: systemMessage
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract all product price list items from this image."
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
              }
            }
          ]
        }
      ],
      temperature: 0.0,
    });

    const rawText = response.choices[0]?.message?.content || "";
    
    if (!rawText) {
      throw new DocumentParserError("AI service returned empty response", 500);
    }

    // Parse JSON response
    const data = extractJson(rawText);

    if (!data.items || !Array.isArray(data.items)) {
      throw new DocumentParserError("Invalid response format from AI service", 500);
    }

    // Validate and clean items
    const validItems: ExtractedPriceListItem[] = data.items
      .filter((item: any) => item.productName && item.unitPrice > 0)
      .map((item: any) => ({
        sku: item.sku || '',
        productName: item.productName,
        unitType: item.unitType || 'box',
        unitPrice: parseFloat(item.unitPrice),
        currency: item.currency || 'GBP',
        minQty: item.minQty || 1,
        maxQty: item.maxQty || null,
        notes: item.notes || '',
        confidence: item.confidence || 0.8,
        uncertainFields: item.uncertainFields || [],
      }));

    if (validItems.length === 0) {
      throw new DocumentParserError(
        "Could not extract any valid price list items from the image. Please ensure the image contains a clear price list or table.",
        400
      );
    }

    const avgConfidence = validItems.reduce((sum, item) => sum + (item.confidence || 0), 0) / validItems.length;

    return {
      items: validItems,
      metadata: {
        fileName,
        fileType: mimeType,
        itemCount: validItems.length,
        avgConfidence,
      },
    };
  } catch (error: any) {
    if (error instanceof DocumentParserError) {
      throw error;
    }

    console.error("Image parsing error:", error);

    if (error?.status === 401 || error?.code === "invalid_api_key") {
      throw new DocumentParserError(
        "OpenAI authentication failed. Please check your API key configuration.",
        503,
        { errorType: "authentication" }
      );
    }

    if (error?.status === 429 || error?.code === "rate_limit_exceeded") {
      throw new DocumentParserError(
        "OpenAI rate limit exceeded. Please try again in a few moments.",
        503,
        { errorType: "rate_limit" }
      );
    }

    throw new DocumentParserError(
      "Failed to parse image. Please ensure the image is clear and contains a price list.",
      500,
      { originalError: error.message }
    );
  }
}

/**
 * Parse text content using OpenAI (for PDFs)
 */
async function parseWithAI(text: string, fileName: string, fileType: string): Promise<ParsedDocumentResult> {
  checkOpenAICredentials();

  const openai = new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
  });

  try {
    const systemMessage = `You are a data extraction assistant. Extract product price list information from the provided text.
Extract ALL products/items you can find.

For each item, extract:
- sku: Product SKU/code (if available, otherwise leave empty)
- productName: Product name/description (REQUIRED)
- unitType: Unit type (box, pallet, m2, unit, etc. - default to "box" if unclear)
- unitPrice: Price per unit (REQUIRED, must be a number)
- currency: Currency code (default to "GBP" if not specified)
- minQty: Minimum quantity (default to 1 if not specified)
- maxQty: Maximum quantity (null if not specified)
- notes: Any additional notes or specifications

Return ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "items": [
    {
      "sku": "string",
      "productName": "string",
      "unitType": "string",
      "unitPrice": number,
      "currency": "string",
      "minQty": number,
      "maxQty": number or null,
      "notes": "string",
      "confidence": number (0.0-1.0),
      "uncertainFields": ["field1", "field2"]
    }
  ]
}

If you're uncertain about any field, include it in uncertainFields array and lower the confidence score.
If you cannot extract any valid items, return: {"items": []}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: systemMessage
        },
        {
          role: "user",
          content: `Extract all product price list items from this text:\n\n${text}`
        }
      ],
      temperature: 0.0,
    });

    const rawText = response.choices[0]?.message?.content || "";
    
    if (!rawText) {
      throw new DocumentParserError("AI service returned empty response", 500);
    }

    const data = extractJson(rawText);

    if (!data.items || !Array.isArray(data.items)) {
      throw new DocumentParserError("Invalid response format from AI service", 500);
    }

    // Validate and clean items
    const validItems: ExtractedPriceListItem[] = data.items
      .filter((item: any) => item.productName && item.unitPrice > 0)
      .map((item: any) => ({
        sku: item.sku || '',
        productName: item.productName,
        unitType: item.unitType || 'box',
        unitPrice: parseFloat(item.unitPrice),
        currency: item.currency || 'GBP',
        minQty: item.minQty || 1,
        maxQty: item.maxQty || null,
        notes: item.notes || '',
        confidence: item.confidence || 0.8,
        uncertainFields: item.uncertainFields || [],
      }));

    if (validItems.length === 0) {
      throw new DocumentParserError(
        "Could not extract any valid price list items from the document. Please ensure it contains a price list.",
        400
      );
    }

    const avgConfidence = validItems.reduce((sum, item) => sum + (item.confidence || 0), 0) / validItems.length;

    return {
      items: validItems,
      metadata: {
        fileName,
        fileType,
        itemCount: validItems.length,
        avgConfidence,
      },
    };
  } catch (error: any) {
    if (error instanceof DocumentParserError) {
      throw error;
    }

    console.error("AI text parsing error:", error);
    throw new DocumentParserError(
      "Failed to extract price list items. Please try a different file format.",
      500,
      { originalError: error.message }
    );
  }
}

/**
 * Extract JSON from text that might contain markdown or other formatting
 */
function extractJson(text: string): any {
  text = text.trim();

  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Continue to extraction logic
  }

  // Remove markdown code blocks if present
  text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');

  // Try again after removing markdown
  try {
    return JSON.parse(text);
  } catch {
    // Continue to more aggressive extraction
  }

  // Find first { and last }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    const candidate = text.substring(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // Fall through
    }
  }

  throw new Error("Could not parse valid JSON from AI response");
}

/**
 * Main entry point for parsing any supported document type
 */
export async function parseDocument(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<ParsedDocumentResult> {
  const lowerFileName = fileName.toLowerCase();

  // Determine file type and route to appropriate parser
  if (mimeType === 'text/csv' || lowerFileName.endsWith('.csv')) {
    return parseCSV(buffer, fileName);
  } else if (mimeType === 'application/pdf' || lowerFileName.endsWith('.pdf')) {
    return parsePDF(buffer, fileName);
  } else if (
    mimeType === 'image/png' || 
    mimeType === 'image/jpeg' || 
    mimeType === 'image/jpg' ||
    lowerFileName.endsWith('.png') ||
    lowerFileName.endsWith('.jpg') ||
    lowerFileName.endsWith('.jpeg')
  ) {
    return parseImage(buffer, fileName, mimeType);
  } else {
    throw new DocumentParserError(
      `Unsupported file type: ${mimeType}. Please upload a PDF, CSV, PNG, or JPG file.`,
      400
    );
  }
}
