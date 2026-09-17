import nodemailer, { type Transporter } from "nodemailer";
import type { MailMessage, MailProvider } from "./mail.provider.js";

type SmtpConfig = {
  host: string;
  port: number;
  user: string | undefined;
  pass: string | undefined;
  from: string;
};

export class SmtpMailProvider implements MailProvider {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: SmtpConfig) {
    this.from = config.from;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      ...(config.user && config.pass ? { auth: { user: config.user, pass: config.pass } } : {}),
    });
  }

  async send(message: MailMessage): Promise<{ messageId: string }> {
    const info = await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.attachments ? { attachments: message.attachments } : {}),
    });
    return { messageId: String(info.messageId) };
  }
}
