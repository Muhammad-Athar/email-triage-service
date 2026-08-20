import { Router, type Request, type Response } from "express";
import { TriageRequestSchema } from "../schemas/triage.js";
import { classifyEmail } from "../services/classifier.js";

export const triageRouter = Router();

triageRouter.post("/triage", async (req: Request, res: Response) => {
  const parsedRequest = TriageRequestSchema.safeParse(req.body);

  if (!parsedRequest.success) {
    const message = parsedRequest.error.issues[0]?.message ?? "Invalid request body";
    return res.status(400).json({ error: message });
  }

  const result = await classifyEmail(parsedRequest.data.emailBody);
  return res.status(200).json(result);
});
