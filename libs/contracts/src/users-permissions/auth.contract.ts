import { z } from 'zod';
import { userSchema } from './user.contract';

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequestDto = z.infer<typeof loginRequestSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequestDto = z.infer<typeof refreshRequestSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: userSchema.pick({ id: true, email: true, fullName: true, roleId: true }),
});
export type AuthTokensDto = z.infer<typeof authTokensSchema>;
