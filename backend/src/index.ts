import { createServer } from "node:http";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { createSocketServer } from "./sockets/index.js";
import { startEventSubscriber } from "./sockets/event-subscriber.js";
import { resumeStuckSeals } from "./services/seal.service.js";
import { logger } from "./utils/logger.js";
import { prisma } from "./utils/prisma.js";
import { redis } from "./utils/redis.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

const app = createApp();
const server = createServer(app);
createSocketServer(server);
startEventSubscriber();

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, `API listening on ${env.API_URL}`);
});

// A session left SEALING means the process died mid-seal; finish it instead of leaving it stuck.
void resumeStuckSeals().catch((err: unknown) => logger.error({ err }, "seal resume on boot failed"));

let shuttingDown = false;

async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down");

  const force = setTimeout(() => {
    logger.error("forced shutdown after timeout");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);

  clearTimeout(force);
  process.exit(exitCode);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "unhandled promise rejection");
  void shutdown("unhandledRejection", 1);
});

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "uncaught exception");
  void shutdown("uncaughtException", 1);
});
