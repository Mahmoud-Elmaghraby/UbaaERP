import { Global, Module } from '@nestjs/common';
import { SettingsModule } from '../../modules/settings/settings.module';
import { PrintController } from './print.controller';
import { PrintRegistry } from './print-registry';
import { PrintService } from './print.service';

/** Global: every module injects PrintRegistry to register its printable documents. */
@Global()
@Module({
  imports: [SettingsModule],
  controllers: [PrintController],
  providers: [PrintRegistry, PrintService],
  exports: [PrintRegistry],
})
export class PrintingModule {}
