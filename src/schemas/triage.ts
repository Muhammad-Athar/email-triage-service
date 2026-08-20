import { z } from "zod";

export const TriageRequestSchema = z.object({
  emailBody: z
    .string({ required_error: "emailBody is required" })
    .trim()
    .min(1, "emailBody must not be empty")
    .max(10_000, "emailBody must not exceed 10,000 characters"),
});

export type TriageRequest = z.infer<typeof TriageRequestSchema>;

export const TriageResultSchema = z.object({
  requestType: z.enum(["billing", "bug", "feature", "other"]),
  urgency: z.enum(["low", "medium", "high"]),
  summary: z.string().min(1),
  team: z.enum(["payments", "engineering", "product", "general_support"]),
  fallbackUsed: z.boolean(),
});

export type TriageResult = z.infer<typeof TriageResultSchema>;

// Fallback is a fixed constant, not model output, so it never needs re-validation.
export const FALLBACK_RESULT: TriageResult = {
  requestType: "other",
  urgency: "medium",
  summary: "Automatic classification failed; needs manual review.",
  team: "general_support",
  fallbackUsed: true,
};
