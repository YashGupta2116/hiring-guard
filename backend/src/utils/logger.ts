import { pino, type LoggerOptions } from "pino";
import { env, isProduction, isTest } from "../config/env.js";

const baseOptions: LoggerOptions = {
  level: isTest ? "silent" : env.LOG_LEVEL,
  base: { service: "veritrust-api" },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'res.headers["set-cookie"]',
      "*.password",
      "*.token",
      "*.accessToken",
      "*.refreshToken",
    ],
    censor: "[redacted]",
  },
};

function createLogger() {
  if (isProduction || isTest) return pino(baseOptions);
  try {
    return pino({
      ...baseOptions,
      transport: { target: "pino-pretty", options: { translateTime: "SYS:HH:MM:ss.l", ignore: "pid,hostname,service" } },
    });
  } catch {
    // pino-pretty is a devDependency — a production-built image with NODE_ENV left unset (or any
    // other non-"production", non-"test" value) would otherwise hard-crash on boot with "unable to
    // determine transport target", since it's never installed in that node_modules. Falling back to
    // plain JSON output is always safe; it's only the formatting that's lost, not any log data.
    return pino(baseOptions);
  }
}

export const logger = createLogger();

export type Logger = typeof logger;
