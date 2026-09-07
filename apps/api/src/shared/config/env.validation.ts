import { z } from 'zod';

/**
 * Startup-time environment validation.
 *
 * Previously, every required env var was checked lazily, deep inside
 * whichever module first touched it (TenancyModule's mustGetDatabaseUrl,
 * AuthInfraModule's mustGetAccessSecret, SecretsEncryptionService's own
 * check) — each individually correct ("fail loudly, don't guess"), but
 * scattered: a typo'd var name only surfaces the first time that
 * specific code path runs, sometimes well after boot, and there was no
 * single place that described the full shape of what this process
 * actually needs to run. This does not replace those individual checks
 * (defense in depth, and SecretsEncryptionService's own check remains
 * the source of truth for its lazy-required var) — it adds one
 * upfront pass so a misconfigured deployment fails at the very first
 * line of `bootstrap()`, with every problem reported at once, not one
 * at a time across however many requests it takes to touch each path.
 */
const envSchema = z.object({
  // Always required — the process cannot serve a single request without these.
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required.')
    .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a postgres:// or postgresql:// connection string.'),
  JWT_ACCESS_SECRET: z
    .string()
    .min(16, 'JWT_ACCESS_SECRET must be at least 16 characters — this signs every access token issued.'),

  // Optional, with defaults applied elsewhere (AuthInfraModule,
  // AuthService) — validated here only for *shape*, so a malformed
  // value fails at boot instead of producing a confusing runtime error
  // the first time a token is issued.
  JWT_ACCESS_TTL: z.string().min(1).optional(),
  JWT_REFRESH_TTL_DAYS: z
    .string()
    .regex(/^\d+$/, 'JWT_REFRESH_TTL_DAYS must be a positive integer (days).')
    .optional(),
  PORT: z.string().regex(/^\d+$/, 'PORT must be a positive integer.').optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),

  // CORS_ORIGIN is conditionally required (production only) — that
  // check stays in main.ts right next to where enableCors() actually
  // uses it, rather than duplicated here with a second NODE_ENV branch.
  CORS_ORIGIN: z.string().min(1).optional(),

  // Lazily required (only once a tenant stores its first encrypted
  // secret) — SecretsEncryptionService.getKey() already validates its
  // exact base64/32-byte shape with a clear error at that point. Only
  // checked here if present, so an intentionally-unset key in an
  // environment that hasn't needed it yet doesn't fail boot.
  SECRETS_ENCRYPTION_KEY: z.string().min(1).optional(),
});

export type ValidatedEnv = z.infer<typeof envSchema>;

/**
 * Validates `process.env` against the schema above and throws a single,
 * fully-aggregated error (every problem at once, not just the first)
 * if anything required is missing or malformed. Call this once, as the
 * very first statement in bootstrap() — before NestFactory.create(),
 * so a misconfigured deployment never gets as far as trying to open a
 * database connection or bind a port.
 */
export function validateEnv(): ValidatedEnv {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
