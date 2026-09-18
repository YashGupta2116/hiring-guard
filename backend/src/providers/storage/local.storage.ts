import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { StorageProvider, StoredObject } from "./storage.provider.js";

export class LocalStorageProvider implements StorageProvider {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = path.resolve(rootDir);
  }

  /** Resolves a key under the storage root, rejecting anything that escapes it (`..`, absolute paths). */
  private resolveKey(key: string): string {
    const resolved = path.resolve(this.root, key);
    if (key.length === 0 || (resolved !== this.root && !resolved.startsWith(this.root + path.sep)) || resolved === this.root) {
      throw new Error(`Unsafe storage key: ${key}`);
    }
    return resolved;
  }

  async put(key: string, data: Buffer | Readable): Promise<StoredObject> {
    const target = this.resolveKey(key);
    await mkdir(path.dirname(target), { recursive: true });
    await pipeline(Buffer.isBuffer(data) ? Readable.from([data]) : data, createWriteStream(target));
    return { key, sizeBytes: (await stat(target)).size };
  }

  async getBuffer(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolveKey(key));
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  async deletePrefix(prefix: string): Promise<void> {
    await rm(this.resolveKey(prefix), { recursive: true, force: true });
  }
}
