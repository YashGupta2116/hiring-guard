import { ulid } from "ulid";
import { logger } from "../../utils/logger.js";
import type { MailMessage, MailProvider } from "./mail.provider.js";

/** Logs the envelope only (never the body). Useful when no SMTP server is running, and in tests. */
export class LogMailProvider implements MailProvider {
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<{ messageId: string }> {
    this.sent.push(message);
    const messageId = `log-${ulid()}`;
    logger.info({ messageId, subject: message.subject, attachments: message.attachments?.length ?? 0 }, "mail (log provider)");
    return { messageId };
  }
}
