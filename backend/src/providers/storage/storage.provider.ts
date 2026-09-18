import type { Readable } from "node:stream";

export type StoredObject = {
  /** Opaque key, also what callers persist in the DB (`rawUri`, `htmlUri`, `manifestUri`, ...). */
  key: string;
  sizeBytes: number;
};

/** Object storage behind an interface so local disk can be swapped for S3 later (Architecture.md §7.3). */
export interface StorageProvider {
  put(key: string, data: Buffer | Readable): Promise<StoredObject>;
  getBuffer(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** Removes every object whose key starts with `prefix`. A prefix with nothing under it is not an error. */
  deletePrefix(prefix: string): Promise<void>;
}
