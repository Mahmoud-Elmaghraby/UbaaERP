import { Injectable, Logger } from '@nestjs/common';
import type { EmailMessage, EmailSenderPort } from './email-sender.port';

/**
 * Placeholder EmailSenderPort implementation: logs the message instead
 * of actually sending it. This is the same "build the readiness, not
 * the missing external integration" pattern already established for
 * ETA e-invoice credentials (see sales-einvoice-spike.md and
 * eta_credentials — config storage only, no real submission engine
 * until real credentials/a provider decision exist). Choosing a real
 * transactional-email provider (SES, SendGrid, Postmark, etc.) and
 * wiring real SMTP/API credentials is a deliberate, separate decision
 * for the user to make — not something to invent here. Swapping this
 * for a real sender later is a one-file change: implement
 * EmailSenderPort and rebind EMAIL_SENDER in EmailModule.
 */
@Injectable()
export class ConsoleEmailSender implements EmailSenderPort {
  private readonly logger = new Logger(ConsoleEmailSender.name);

  async send(message: EmailMessage): Promise<void> {
    this.logger.warn(
      `[email:not-actually-sent] to=${message.to} subject="${message.subject}"\n${message.body}`,
    );
  }
}
