import { prisma } from "../utils/prisma.js";
import { redis } from "../utils/redis.js";

export type DependencyStatus = "ok" | "down";

export type ReadinessReport = {
  ready: boolean;
  db: DependencyStatus;
  redis: DependencyStatus;
};

const CHECK_TIMEOUT_MS = 2_000;

async function withTimeout(check: Promise<unknown>): Promise<DependencyStatus> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), CHECK_TIMEOUT_MS);
  });
  try {
    await Promise.race([check, timeout]);
    return "ok";
  } catch {
    return "down";
  } finally {
    clearTimeout(timer);
  }
}

export async function checkReadiness(): Promise<ReadinessReport> {
  const [db, cache] = await Promise.all([
    withTimeout(prisma.$queryRaw`SELECT 1`),
    withTimeout(redis.ping()),
  ]);
  return { ready: db === "ok" && cache === "ok", db, redis: cache };
}
