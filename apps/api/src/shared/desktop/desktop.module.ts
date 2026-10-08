import { Module } from '@nestjs/common';
import { DesktopController } from './desktop.controller';
import { DesktopSetupService } from './desktop-setup.service';

/** Desktop runtime info + first-run Owner setup (see DesktopSetupService). */
@Module({
  controllers: [DesktopController],
  providers: [DesktopSetupService],
})
export class DesktopModule {}
