import { z } from 'zod';

export const auditLogSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  metadata: z.record(z.unknown()),
  createdAt: z.coerce.date(),
});
export type AuditLogDto = z.infer<typeof auditLogSchema>;
