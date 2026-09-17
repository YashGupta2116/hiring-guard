import { generateKeyPairSync } from "node:crypto";
import { rm } from "node:fs/promises";
import { afterAll, describe, expect, it } from "vitest";
import { MockLlmProvider } from "../../src/providers/llm/mock.llm.js";
import { Ed25519Signer } from "../../src/providers/signer/ed25519.signer.js";
import { LocalStorageProvider } from "../../src/providers/storage/local.storage.js";
import { parsedJdSchema } from "../../src/types/parsed-jd.js";
import { canonicalJson, pepperedHash, sha256Hex } from "../../src/utils/hash.js";
import { newSessionId } from "../../src/utils/ids.js";

describe("hash utils", () => {
  it("canonicalJson is independent of key order", () => {
    const a = canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: new Date("2026-01-01T00:00:00Z") } });
    const b = canonicalJson({ a: { c: new Date("2026-01-01T00:00:00Z"), d: [1, { y: 2, z: 1 }] }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":{"c":"2026-01-01T00:00:00.000Z","d":[1,{"y":2,"z":1}]},"b":1}');
  });

  it("serialises bigint and drops undefined", () => {
    expect(canonicalJson({ id: 10n, skip: undefined })).toBe('{"id":"10"}');
  });

  it("peppered hash differs from plain sha256", () => {
    expect(pepperedHash("127.0.0.1")).not.toBe(sha256Hex("127.0.0.1"));
    expect(pepperedHash("127.0.0.1")).toHaveLength(64);
  });

  it("session ids use the ses_ prefix", () => {
    expect(newSessionId()).toMatch(/^ses_[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});

describe("providers", () => {
  const dir = "./.test-storage-unit";
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("local storage round-trips and rejects path traversal", async () => {
    const storage = new LocalStorageProvider(dir);
    const stored = await storage.put("orgs/o1/sessions/s1/jd/original.txt", Buffer.from("hello"));
    expect(stored.sizeBytes).toBe(5);
    expect((await storage.getBuffer(stored.key)).toString()).toBe("hello");
    await expect(storage.put("../escape.txt", Buffer.from("x"))).rejects.toThrow("Unsafe storage key");
  });

  it("Ed25519 signer detects tampering", () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const signer = new Ed25519Signer(Buffer.from(pem).toString("base64"), "test");
    const data = Buffer.from('{"chainHead":"abc"}');
    const { signatureBase64 } = signer.sign(data);
    expect(signer.verify(data, signatureBase64)).toBe(true);
    expect(signer.verify(Buffer.from('{"chainHead":"abd"}'), signatureBase64)).toBe(false);
  });

  it("mock LLM returns a schema-valid ParsedJD", async () => {
    const parsed = await new MockLlmProvider().parseJd(
      "Senior Backend Engineer\nWe use Node.js, TypeScript, PostgreSQL and Redis. Node.js experience required.",
      60,
    );
    expect(parsedJdSchema.parse(parsed)).toBeTruthy();
    expect(parsed.seniority).toBe("SENIOR");
    expect(parsed.skills[0]?.name).toBe("node.js");
  });
});
