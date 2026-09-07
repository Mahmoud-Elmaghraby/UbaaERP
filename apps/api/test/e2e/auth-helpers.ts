import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

export interface LoggedInSession {
  accessToken: string;
  userId: string;
}

/** Logs in through the real /auth/login HTTP endpoint (header-based
 * tenant resolution, since there's no JWT yet — see auth.controller.ts's
 * class comment) and returns the issued access token. The refresh token
 * is never in the response body (it's an httpOnly cookie — Task 9); tests
 * that specifically exercise refresh/logout use their own
 * `request.agent()` to carry that cookie, see auth.e2e-spec.ts. */
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
    userId: response.body.user.id,
  };
}

export function authHeader(session: LoggedInSession): [string, string] {
  return ['Authorization', `Bearer ${session.accessToken}`];
}

/** Pulls the `refresh_token` cookie's value out of a raw Set-Cookie
 * response header array (supertest exposes it as `response.headers['set-
 * cookie']`) — shared by every e2e test that needs to inspect or replay
 * the httpOnly refresh cookie directly rather than through an agent's
 * automatic cookie jar. */
export function extractRefreshTokenCookie(setCookieHeaders: string[] | undefined): string {
  const raw = (setCookieHeaders ?? []).find((cookie) => cookie.startsWith('refresh_token='));
  if (!raw) {
    throw new Error('Expected a refresh_token Set-Cookie header in the response, found none.');
  }
  return raw.split(';')[0].split('=')[1];
}
