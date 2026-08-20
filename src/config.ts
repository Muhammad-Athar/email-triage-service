import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  geminiApiKey: requireEnv("GEMINI_API_KEY"),
  port: Number(process.env.PORT ?? 3000),
  model: "gemini-3.6-flash",
} as const;
