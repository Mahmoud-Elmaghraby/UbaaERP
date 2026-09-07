/**
 * Outbound transactional email — currently consumed only by
 * AccountAccessService (password reset + user invite), but deliberately
 * placed under shared/ rather than inside users-permissions: sending
 * email is a generic capability every module will eventually want
 * (e.g. an invoice emailed to a customer in Sales), not something
 * specific to accounts.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

export interface EmailSenderPort {
  send(message: EmailMessage): Promise<void>;
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
