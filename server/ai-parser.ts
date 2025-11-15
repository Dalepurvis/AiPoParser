import OpenAI from "openai";
import type { AIParserResponse } from "@shared/schema";

export class AIParserError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = "AIParserError";
  }
}

function checkOpenAICredentials(): void {
  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    throw new AIParserError(
      "OpenAI API key is not configured. Please set up your OpenAI integration.",
      503,
      { missingCredential: "AI_INTEGRATIONS_OPENAI_API_KEY" }
    );
  }
  
  if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
    throw new AIParserError(
      "OpenAI base URL is not configured. Please set up your OpenAI integration.",
      503,
      { missingCredential: "AI_INTEGRATIONS_OPENAI_BASE_URL" }
    );
  }
}

interface BusinessRules {
  [key: string]: string;
}

interface Supplier {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface PriceRow {
  id: string;
  supplierId: string;
  sku: string;
  productName: string;
  unitType: string;
  minQty: number | null;
  maxQty: number | null;
  unitPrice: number;
  currency: string;
  notes: string | null;
}

function buildSystemMessage(
  businessRules: BusinessRules,
  suppliers: Supplier[],
  priceRows: PriceRow[]
): string {
  const businessRulesJson = JSON.stringify(businessRules, null, 2);
  const suppliersJson = JSON.stringify(suppliers, null, 2);
  const priceRowsJson = JSON.stringify(priceRows, null, 2);

  return `You are an AI purchase-order assistant for a trade/retail business.
Your job is to:
1) Interpret the user's free-text request for a purchase order.
2) Use the known supplier price lists and business rules to propose a DRAFT purchase order.
3) ALWAYS surface uncertainty and ask clarifying questions instead of guessing.
4) Think about profitability: suggest more profitable or more consistent alternatives when appropriate.
5) Respond ONLY with STRICT JSON matching the schema provided below. No extra text, no explanations outside JSON.

You MUST follow these rules:
- If you are not at least 0.8 confident about a field (like SKU, quantity, or price), add that field name to ai_uncertain_fields and create an entry in questions_for_user.
- NEVER invent a new SKU or product that does not appear in the input price lists or business rules.
- If multiple SKUs or price breaks could apply, present them as suggested_options in questions_for_user and do NOT silently choose the lower-priced option.
- If there is not enough information to build a draft, you MUST still return a valid JSON structure with empty or null fields and helpful questions_for_user.
- Always include a short reasoning_summary with decision, considerations, alternatives, and a global confidence score.

IMPORTANT JSON RULES:
- You MUST return ONLY JSON. No markdown, no backticks, no comments.
- Do NOT include trailing commas.
- Do NOT include any keys that are not in the schema.
- If you don't know a value, use null (for numbers/strings) or an empty string/array as appropriate.
- Make sure the JSON is syntactically valid and can be parsed by a standard JSON parser.

JSON SCHEMA (for your response):

{
  "draft_po": {
    "supplier_name": "string",
    "status": "draft",
    "items": [
      {
        "sku": "string or null",
        "product_name": "string",
        "unit_type": "string",
        "requested_quantity_raw": "string",
        "quantity": 0,
        "unit_price": null,
        "currency": "string",
        "line_total": null,
        "price_source": "string",
        "ai_confidence": 0.0,
        "ai_uncertain_fields": ["string"],
        "notes": "string"
      }
    ],
    "extra_notes_for_supplier": "string",
    "delivery_instructions": "string",
    "business_profitability_hints": [
      {
        "message": "string",
        "estimated_savings": null,
        "applies_to_item_indexes": [0]
      }
    ]
  },
  "questions_for_user": [
    {
      "id": "string",
      "question": "string",
      "reason": "string",
      "related_item_indexes": [0],
      "suggested_options": ["string"]
    }
  ],
  "reasoning_summary": {
    "overall_decision": "string",
    "considerations": ["string"],
    "alternatives": ["string"],
    "global_confidence": 0.0
  }
}

CONTEXT YOU KNOW:

BUSINESS_RULES:
${businessRulesJson}

EXISTING_SUPPLIERS:
${suppliersJson}

PRICE_LIST_ROWS:
${priceRowsJson}

Remember:
- Use PRICE_LIST_ROWS to find matching SKUs, unit types (box/pallet/m2), and price breaks.
- Use BUSINESS_RULES only as high-level guidance (e.g., default tax, fitting rates), not to invent new products.

Return ONLY a JSON object that matches the schema.`;
}

function extractJson(text: string): any {
  text = text.trim();

  try {
    return JSON.parse(text);
  } catch {
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    const candidate = text.substring(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch {
    }
  }

  throw new Error("Could not parse valid JSON from model output.");
}

export async function generateDraftPO(
  userRequest: string,
  businessRules: BusinessRules,
  suppliers: Supplier[],
  priceRows: PriceRow[]
): Promise<AIParserResponse> {
  checkOpenAICredentials();

  const openai = new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
  });

  const systemMessage = buildSystemMessage(businessRules, suppliers, priceRows);

  const messages = [
    { role: "system" as const, content: systemMessage },
    { role: "user" as const, content: `User request: "${userRequest}"` },
  ];

  let response;
  try {
    response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.0,
    });
  } catch (error: any) {
    console.error("OpenAI API call failed:", error);

    if (error?.status === 401 || error?.code === "invalid_api_key") {
      throw new AIParserError(
        "OpenAI authentication failed. Please check your API key configuration.",
        503,
        { errorType: "authentication", originalError: error.message }
      );
    }

    if (error?.status === 429 || error?.code === "rate_limit_exceeded") {
      throw new AIParserError(
        "OpenAI rate limit exceeded. Please try again in a few moments.",
        503,
        { errorType: "rate_limit", originalError: error.message }
      );
    }

    if (error?.status === 503 || error?.code === "service_unavailable") {
      throw new AIParserError(
        "OpenAI service is temporarily unavailable. Please try again later.",
        503,
        { errorType: "service_unavailable", originalError: error.message }
      );
    }

    if (error?.code === "ENOTFOUND" || error?.code === "ECONNREFUSED" || error?.code === "ETIMEDOUT") {
      throw new AIParserError(
        "Unable to connect to OpenAI service. Please check your network connection.",
        503,
        { errorType: "network", originalError: error.message }
      );
    }

    throw new AIParserError(
      "Failed to generate purchase order draft. Please try again.",
      500,
      { errorType: "unknown", originalError: error.message }
    );
  }

  const rawText = response.choices[0]?.message?.content || "";
  
  if (!rawText) {
    console.error("OpenAI returned empty response");
    throw new AIParserError(
      "AI service returned an empty response. Please try again.",
      500,
      { errorType: "empty_response" }
    );
  }

  let data;
  try {
    data = extractJson(rawText);
  } catch (error: any) {
    console.error("Failed to parse AI response as JSON:", error.message);
    console.error("Raw response:", rawText);
    throw new AIParserError(
      "Failed to parse AI response. The AI service returned an unexpected format.",
      500,
      { errorType: "json_parse_error", originalError: error.message }
    );
  }

  return data as AIParserResponse;
}

export async function regeneratePOWithClarifications(
  userRequest: string,
  previousDraft: AIParserResponse,
  answers: Record<string, any>,
  businessRules: BusinessRules,
  suppliers: Supplier[],
  priceRows: PriceRow[]
): Promise<AIParserResponse> {
  checkOpenAICredentials();

  const openai = new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
  });

  const systemMessage = buildSystemMessage(businessRules, suppliers, priceRows);

  const questionsAsked = previousDraft.questions_for_user.map(q => ({
    id: q.id,
    question: q.question,
    reason: q.reason,
    related_item_indexes: q.related_item_indexes,
    suggested_options: q.suggested_options,
  }));

  const answeredQuestionIds = Object.keys(answers);
  const questionAnswerMapping = questionsAsked.map(q => ({
    question_id: q.id,
    question_text: q.question,
    user_answer: answers[q.id] !== undefined ? answers[q.id] : "NOT ANSWERED",
    affects_items: q.related_item_indexes,
  }));

  const clarificationContext = `
CLARIFICATION UPDATE REQUIRED:

The user has provided answers to clarification questions. You MUST use these answers to update the purchase order draft.

QUESTION-ANSWER MAPPING:
${JSON.stringify(questionAnswerMapping, null, 2)}

PREVIOUS DRAFT (for reference only):
${JSON.stringify(previousDraft.draft_po, null, 2)}

CRITICAL INSTRUCTIONS FOR REGENERATION:

1. USE THE ANSWERS TO UPDATE FIELDS:
   - For each answered question, identify which item(s) it relates to (see affects_items)
   - Update the relevant fields (SKU, product_name, unit_price, quantity, etc.) based on the user's answer
   - If the answer provides a specific SKU, price, or product selection, use it EXACTLY
   - Remove that field from ai_uncertain_fields if it was there

2. UPDATE CONFIDENCE SCORES:
   - For any item where fields were clarified by user answers, INCREASE ai_confidence
   - If all uncertain fields for an item have been clarified, set ai_confidence to at least 0.9
   - Update global_confidence in reasoning_summary accordingly

3. MANAGE questions_for_user ARRAY:
   - DO NOT include questions with IDs: ${JSON.stringify(answeredQuestionIds)}
   - These questions have been answered and must NOT be asked again
   - Only include NEW questions if there are still genuine uncertainties
   - If all uncertainties are resolved, return an EMPTY array for questions_for_user

4. VALIDATION:
   - Verify that each answer was actually used to update the draft
   - Ensure the draft reflects ALL the information provided by the user
   - Double-check that answered questions are not in the new questions_for_user array

EXAMPLE:
If user answered a question about SKU selection with "SKU-12345", then:
- Update the relevant item's sku field to "SKU-12345"
- Remove "sku" from ai_uncertain_fields for that item
- Increase ai_confidence for that item to at least 0.85
- DO NOT include that question in the new questions_for_user array

Remember: Return ONLY valid JSON matching the schema. The user has taken time to answer questions - you MUST incorporate their answers into the updated draft.
`;

  const messages = [
    { role: "system" as const, content: systemMessage },
    { role: "user" as const, content: `User request: "${userRequest}"` },
    { role: "assistant" as const, content: JSON.stringify(previousDraft) },
    { role: "user" as const, content: clarificationContext },
  ];

  let response;
  try {
    response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.0,
    });
  } catch (error: any) {
    console.error("OpenAI API call failed during clarification:", error);

    if (error?.status === 401 || error?.code === "invalid_api_key") {
      throw new AIParserError(
        "OpenAI authentication failed. Please check your API key configuration.",
        503,
        { errorType: "authentication", originalError: error.message }
      );
    }

    if (error?.status === 429 || error?.code === "rate_limit_exceeded") {
      throw new AIParserError(
        "OpenAI rate limit exceeded. Please try again in a few moments.",
        503,
        { errorType: "rate_limit", originalError: error.message }
      );
    }

    if (error?.status === 503 || error?.code === "service_unavailable") {
      throw new AIParserError(
        "OpenAI service is temporarily unavailable. Please try again later.",
        503,
        { errorType: "service_unavailable", originalError: error.message }
      );
    }

    if (error?.code === "ENOTFOUND" || error?.code === "ECONNREFUSED" || error?.code === "ETIMEDOUT") {
      throw new AIParserError(
        "Unable to connect to OpenAI service. Please check your network connection.",
        503,
        { errorType: "network", originalError: error.message }
      );
    }

    throw new AIParserError(
      "Failed to regenerate purchase order draft. Please try again.",
      500,
      { errorType: "unknown", originalError: error.message }
    );
  }

  const rawText = response.choices[0]?.message?.content || "";
  
  if (!rawText) {
    console.error("OpenAI returned empty response during clarification");
    throw new AIParserError(
      "AI service returned an empty response. Please try again.",
      500,
      { errorType: "empty_response" }
    );
  }

  let data;
  try {
    data = extractJson(rawText);
  } catch (error: any) {
    console.error("Failed to parse AI clarification response as JSON:", error.message);
    console.error("Raw response:", rawText);
    throw new AIParserError(
      "Failed to parse AI response. The AI service returned an unexpected format.",
      500,
      { errorType: "json_parse_error", originalError: error.message }
    );
  }

  // Safety post-processing: ensure answered questions are removed
  const answeredIds = Object.keys(answers);
  if (data.questions_for_user && Array.isArray(data.questions_for_user)) {
    data.questions_for_user = data.questions_for_user.filter(
      (q: any) => !answeredIds.includes(q.id)
    );
  }

  return data as AIParserResponse;
}
