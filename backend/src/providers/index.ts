import { env } from "../config/env.js";
import { MockLlmProvider } from "./llm/mock.llm.js";
import type { LlmProvider } from "./llm/llm.provider.js";
import { LogMailProvider } from "./mail/log.mail.js";
import type { MailProvider } from "./mail/mail.provider.js";
import { SmtpMailProvider } from "./mail/smtp.mail.js";
import type { MediaProvider } from "./media/media.provider.js";
import { MockMediaProvider } from "./media/mock.media.js";
import { DockerSandboxProvider } from "./sandbox/docker.sandbox.js";
import { MockSandboxProvider } from "./sandbox/mock.sandbox.js";
import type { SandboxProvider } from "./sandbox/sandbox.provider.js";
import { Ed25519Signer } from "./signer/ed25519.signer.js";
import type { Signer } from "./signer/signer.js";
import { LocalStorageProvider } from "./storage/local.storage.js";
import type { StorageProvider } from "./storage/storage.provider.js";

/** Lazily created singletons. Services import these getters, never concrete classes. */
function lazy<T>(factory: () => T): () => T {
  let instance: T | undefined;
  return () => (instance ??= factory());
}

export const getStorage = lazy<StorageProvider>(() => new LocalStorageProvider(env.STORAGE_LOCAL_DIR));

export const getMail = lazy<MailProvider>(() =>
  env.MAIL_PROVIDER === "log"
    ? new LogMailProvider()
    : new SmtpMailProvider({ host: env.SMTP_HOST, port: env.SMTP_PORT, user: env.SMTP_USER, pass: env.SMTP_PASS, from: env.MAIL_FROM }),
);

export const getLlm = lazy<LlmProvider>(() => new MockLlmProvider());

export const getMedia = lazy<MediaProvider>(() => new MockMediaProvider());

export const getSandbox = lazy<SandboxProvider>(() => (env.SANDBOX_PROVIDER === "docker" ? new DockerSandboxProvider() : new MockSandboxProvider()));

export const getSigner = lazy<Signer>(() => {
  if (!env.EVIDENCE_SIGNING_PRIVATE_KEY) {
    throw new Error("EVIDENCE_SIGNING_PRIVATE_KEY is not set. Run: npm run keys:generate");
  }
  return new Ed25519Signer(env.EVIDENCE_SIGNING_PRIVATE_KEY, env.EVIDENCE_SIGNING_KEY_ID);
});
