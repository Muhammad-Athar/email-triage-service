import express from "express";
import { config } from "./config.js";
import { triageRouter } from "./routes/triage.js";

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api", triageRouter);

app.listen(config.port, () => {
  console.log(`support-email-triage listening on port ${config.port}`);
});
