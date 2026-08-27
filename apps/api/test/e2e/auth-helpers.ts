import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

export interface LoggedInSession {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

/** Logs in through the real /auth/login HTTP endpoint (header-based
 * tenant resolution, since there's no JWT yet — see auth.controller.ts's
 * class comment) and returns the issued tokens. */
export async function loginAs(
  app: INestApplication,
  schema: string,
  email: string,
  password: string,
): Promise<LoggedInSession> {
  const response = await request(app.getHttpServer())
    .post('/auth/login')
    .set('x-tenant-schema', schema)
    .send({ email, password })
    .expect(201); // NestJS's default success code for @Post() with no @HttpCode override

  return {
    accessToken: response.body.accessToken,
    refreshToken: response.body.refreshToken,
    userId: response.body.user.id,
  };
}

export function authHeader(session: LoggedInSession): [string, string] {
  return ['Authorization', `Bearer ${session.accessToken}`];
}
