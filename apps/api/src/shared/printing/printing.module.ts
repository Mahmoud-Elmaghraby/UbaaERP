import { Global, Module } from '@nestjs/common';
import { SettingsModule } from '../../modules/settings/settings.module';
import { PrintController } from './print.controller';
import { PrintRegistry } from './print-registry';
import { PrintService } from './print.service';
import { DocumentShareService } from './document-share.service';
import { PublicDocumentsController } from './public-documents.controller';

/** Global: every module injects PrintRegistry to register its printable documents. */
@Global()
@Module({
  imports: [SettingsModule],
  controllers: [PrintController, PublicDocumentsController],
  providers: [PrintRegistry, PrintService, DocumentShareService],
  exports: [PrintRegistry, DocumentShareService],
})
export class PrintingModule {}
