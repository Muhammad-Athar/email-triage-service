import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import { FALLBACK_RESULT, TriageResultSchema, type TriageResult } from "../schemas/triage.js";

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

const SYSTEM_PROMPT = `You are a support email triage classifier. Given the body of a customer support email, respond with ONLY a raw JSON object — no prose, no explanation, no markdown code fences. The object must exactly match this shape:

{
  "requestType": "billing" | "bug" | "feature" | "other",
  "urgency": "low" | "medium" | "high",
  "summary": string (exactly two sentences summarizing the email),
  "team": "payments" | "engineering" | "product" | "general_support",
  "fallbackUsed": false
}

Examples:

Email: "I was charged twice for my subscription this month and need a refund for the duplicate charge."
Response: {"requestType":"billing","urgency":"medium","summary":"The customer was charged twice for their subscription this month. They are requesting a refund for the duplicate charge.","team":"payments","fallbackUsed":false}

Email: "The app crashes every time I try to upload a photo larger than 5MB. This is blocking me from using the product at all."
Response: {"requestType":"bug","urgency":"high","summary":"The app crashes whenever the customer uploads a photo larger than 5MB. This is completely blocking their ability to use the product.","team":"engineering","fallbackUsed":false}

Email: "It would be great if you could add dark mode to the dashboard at some point."
Response: {"requestType":"feature","urgency":"low","summary":"The customer is requesting a dark mode option for the dashboard. This is a nice-to-have suggestion, not an urgent issue.","team":"product","fallbackUsed":false}

Always set "fallbackUsed" to false — that field is only set to true by the calling system, never by you.`;

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const captured = fenceMatch?.[1];
  return captured !== undefined ? captured.trim() : trimmed;
}

function parseAndValidate(raw: string): TriageResult | null {
  let candidate: unknown;
  try {
    candidate = JSON.parse(stripCodeFences(raw));
  } catch {
    return null;
  }

  const result = TriageResultSchema.safeParse(candidate);
  return result.success ? result.data : null;
}

async function callModel(emailBody: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: config.model,
    contents: emailBody,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      // gemini-3.6-flash spends some of this budget on internal "thinking" tokens
      // before the JSON output, so the cap needs headroom beyond the ~50-80 tokens
      // the JSON reply itself needs.
      maxOutputTokens: 2048,
    },
  });

  return response.text ?? "";
}

export async function classifyEmail(emailBody: string): Promise<TriageResult> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await callModel(emailBody);
      const parsed = parseAndValidate(raw);
      if (parsed) {
        return parsed;
      }
      console.error(`[classifier] attempt ${attempt} produced unparseable/invalid output:`, raw);
    } catch (err) {
      // Covers network errors, auth failures (ApiError), and any other Gemini API failure.
      console.error(`[classifier] attempt ${attempt} threw:`, err);
    }
  }

  return FALLBACK_RESULT;
}
