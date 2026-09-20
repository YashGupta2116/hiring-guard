import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv({
  path: process.env.NODE_ENV === "test" ? ".env.test" : ".env",
  quiet: true,
});

/**
 * `z.coerce.boolean()` is unusable for env flags: it is `Boolean(string)`, so the string "false" is truthy.
 * Accept only explicit spellings instead.
 */
const flag = z.enum(["true", "false", "1", "0"]).transform((value) => value === "true" || value === "1");

const csv = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(9000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  APP_URL: z.url().default("http://localhost:3000"),
  API_URL: z.url().default("http://localhost:9000"),
  CORS_ORIGINS: csv,

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),

  HASH_PEPPER: z.string().min(32, "HASH_PEPPER must be at least 32 characters"),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  JOIN_TOKEN_SECRET: z.string().min(32, "JOIN_TOKEN_SECRET must be at least 32 characters"),
  CANDIDATE_TOKEN_SECRET: z.string().min(32, "CANDIDATE_TOKEN_SECRET must be at least 32 characters"),
  INTERNAL_SERVICE_TOKEN: z.string().min(32, "INTERNAL_SERVICE_TOKEN must be at least 32 characters"),

  STORAGE_PROVIDER: z.enum(["local"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),

  MAIL_PROVIDER: z.enum(["smtp", "log"]).default("smtp"),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default("HiringGuard <no-reply@hiringguard.local>"),

  LLM_PROVIDER: z.enum(["mock"]).default("mock"),
  MEDIA_PROVIDER: z.enum(["mock"]).default("mock"),
  SANDBOX_PROVIDER: z.enum(["mock", "docker", "local"]).default("mock"),

  EVIDENCE_SIGNING_PRIVATE_KEY: z.string().optional(),
  EVIDENCE_SIGNING_KEY_ID: z.string().default("local-dev-1"),

  /** PDF is optional (Architecture.md §1); HTML report rendering is never gated by this. */
  REPORT_PDF_ENABLED: flag.default(false),

  /** Retention windows, days (PRD FR-RET-1 / Phases.md §11). */
  RETENTION_MEDIA_DAYS: z.coerce.number().int().min(1).default(90),
  RETENTION_OBSERVATIONS_DAYS: z.coerce.number().int().min(1).default(180),
  RETENTION_EVIDENCE_LOG_FLOOR_DAYS: z.coerce.number().int().min(1).default(30),
  RETENTION_REPORTS_DAYS: z.coerce.number().int().min(1).default(1095),
  /** BullMQ repeat pattern for the nightly retention job (cron syntax, worker process local time). */
  RETENTION_CRON: z.string().default("0 3 * * *"),
});

const envSchemaWithRefinements = envSchema.refine(
  (value) => !(value.NODE_ENV === "production" && value.SANDBOX_PROVIDER === "local"),
  {
    message: "SANDBOX_PROVIDER=local runs candidate code on the API host with no isolation and must not be used when NODE_ENV=production.",
    path: ["SANDBOX_PROVIDER"],
  },
);

const parsed = envSchemaWithRefinements.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`);
  console.error(`Invalid environment variables:\n${lines.join("\n")}`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
