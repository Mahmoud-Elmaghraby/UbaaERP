import { z } from 'zod';

export const etaEnvironmentSchema = z.enum(['preprod', 'production']);

export const etaCredentialsSchema = z.object({
  id: z.string().uuid(),
  clientId: z.string().nullable(),
  clientSecretConfigured: z.boolean(),
  taxRegistrationNumber: z.string().nullable(),
  environment: etaEnvironmentSchema,
  documentVersion: z.string().min(1),
  isEnabled: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type EtaCredentialsDto = z.infer<typeof etaCredentialsSchema>;

export const updateEtaCredentialsSchema = z.object({
  clientId: z.string().min(1).nullable().optional(),
  /** Plaintext on the wire (over HTTPS only) — encrypted server-side before storage; never returned back. */
  clientSecret: z.string().min(1).nullable().optional(),
  taxRegistrationNumber: z.string().min(1).nullable().optional(),
  environment: etaEnvironmentSchema.optional(),
  documentVersion: z.string().min(1).optional(),
  isEnabled: z.boolean().optional(),
});
export type UpdateEtaCredentialsDto = z.infer<typeof updateEtaCredentialsSchema>;
