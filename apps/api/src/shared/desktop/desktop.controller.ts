import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { desktopSetupSchema, type DesktopSetupInput, type RuntimeInfoDto } from '@erp-platform/contracts';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { DesktopSetupService } from './desktop-setup.service';

/**
 * Public, pre-login routes. `GET /runtime` answers in every deployment
 * (cloud just says `{ mode: 'cloud' }`); `POST /desktop/setup` refuses
 * outside desktop mode and once any user exists (DesktopSetupService).
 */
@Controller()
export class DesktopController {
  constructor(private readonly setup: DesktopSetupService) {}

  @Get('runtime')
  getRuntime(): Promise<RuntimeInfoDto> {
    return this.setup.getRuntimeInfo();
  }

  @Post('desktop/setup')
  @HttpCode(201)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  completeSetup(@Body(new ZodValidationPipe(desktopSetupSchema)) body: DesktopSetupInput): Promise<{ email: string }> {
    return this.setup.completeSetup(body);
  }
}
