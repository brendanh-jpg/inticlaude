import { z } from "zod";

const envSchema = z.object({
  BROWSERBASE_API_KEY: z.string().min(1, "BROWSERBASE_API_KEY is required"),
  BROWSERBASE_PROJECT_ID: z.string().min(1, "BROWSERBASE_PROJECT_ID is required"),

  OWL_PRACTICE_URL: z.string().min(1, "OWL_PRACTICE_URL is required"),
  OWL_PRACTICE_EMAIL: z.string().email("OWL_PRACTICE_EMAIL must be a valid email"),
  OWL_PRACTICE_PASSWORD: z.string().min(1, "OWL_PRACTICE_PASSWORD is required"),

  PLAYSPACE_API_BASE_URL: z.string().url("PLAYSPACE_API_BASE_URL must be a valid URL"),
  PLAYSPACE_API_KEY: z.string().min(1, "PLAYSPACE_API_KEY is required"),

  SYNC_LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
  SYNC_DRY_RUN: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
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
