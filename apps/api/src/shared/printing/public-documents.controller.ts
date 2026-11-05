import { Controller, Get, Header, Param, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { PrintResponseDto } from '@erp-platform/contracts';
import { DocumentShareService } from './document-share.service';

/**
 * Public document view for share links (/share/:token on the web).
 * Unauthenticated on purpose, like LocalFilesController's signed links: the
 * HMAC-signed token IS the authorization — it names one tenant, one
 * document of a shareable type and an expiry, and cannot be altered.
 * Throttled to blunt token guessing / scraping.
 */
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller('public/documents')
export class PublicDocumentsController {
  constructor(private readonly shares: DocumentShareService) {}

  @Get(':token')
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex')
  view(@Param('token') token: string): Promise<PrintResponseDto> {
    return this.shares.resolve(token);
  }
}
