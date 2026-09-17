import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/** HMAC with the server pepper. Used for IP and user-agent hashing (never store raw values). */
export function pepperedHash(value: string): string {
  return createHmac("sha256", env.HASH_PEPPER).update(value).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Deterministic JSON: object keys sorted recursively, no whitespace,
 * Dates as ISO strings, bigint as decimal strings. Used for the evidence hash chain.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalise(value));
}

function normalise(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(normalise);
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => [key, normalise(item)] as const);
    return Object.fromEntries(entries);
  }
  return value;
}
