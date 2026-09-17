export type MailAttachment = {
  filename: string;
  content: string | Buffer;
  contentType: string;
};

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
};

export interface MailProvider {
  send(message: MailMessage): Promise<{ messageId: string }>;
}
