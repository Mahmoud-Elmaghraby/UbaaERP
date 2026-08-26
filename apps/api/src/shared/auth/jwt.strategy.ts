import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtAccessPayload } from './jwt-payload.type';

function mustGetAccessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET is not set. The API cannot verify access tokens without it.');
  }
  return secret;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: mustGetAccessSecret(),
    });
  }

  // passport-jwt already verified the signature/expiry before this runs;
  // whatever this returns becomes `request.user`.
  validate(payload: JwtAccessPayload): JwtAccessPayload {
    return payload;
  }
}
