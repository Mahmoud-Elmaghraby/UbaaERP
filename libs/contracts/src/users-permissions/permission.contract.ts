import { z } from 'zod';

export const permissionSchema = z.object({
  id: z.string().uuid(),
  key: z.string().min(1),
  description: z.string().min(1),
  createdAt: z.coerce.date(),
});
export type PermissionDto = z.infer<typeof permissionSchema>;
