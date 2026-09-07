import { Global, Module } from '@nestjs/common';
import { EMAIL_SENDER } from './email-sender.port';
import { ConsoleEmailSender } from './console-email-sender';

@Global()
@Module({
  providers: [{ provide: EMAIL_SENDER, useClass: ConsoleEmailSender }],
  exports: [EMAIL_SENDER],
})
export class EmailModule {}
