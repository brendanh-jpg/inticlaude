import { z } from "zod";

// Shared infrastructure — always required (Browserbase is managed centrally)
const envSchema = z.object({
  BROWSERBASE_API_KEY: z.string().min(1, "BROWSERBASE_API_KEY is required"),
  BROWSERBASE_PROJECT_ID: z.string().min(1, "BROWSERBASE_PROJECT_ID is required"),

  SYNC_LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),

  // CLI-only settings (optional — not used by the API)
  OWL_PRACTICE_URL: z.string().optional(),
  OWL_PRACTICE_EMAIL: z.string().optional(),
  OWL_PRACTICE_PASSWORD: z.string().optional(),
  PLAYSPACE_CLIENT_ID: z.string().optional(),
  PLAYSPACE_CLIENT_SECRET: z.string().optional(),
  PLAYSPACE_AUTH0_DOMAIN: z.string().optional(),
  PLAYSPACE_AUDIENCE: z.string().optional(),
  PLAYSPACE_BASE_URL: z.string().optional(),
  SYNC_DRY_RUN: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  SYNC_LEDGER_PATH: z
    .string()
    .default("./sync_ledger.db"),
});

export type SyncEnv = z.infer<typeof envSchema>;

let _env: SyncEnv | null = null;

export function getEnv(): SyncEnv {
  if (!_env) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      const missing = result.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(
        `Sync environment validation failed:\n${missing}\n\nCopy .env.example to .env.local and fill in the values.`
      );
    }
    _env = result.data;
  }
  return _env;
}
