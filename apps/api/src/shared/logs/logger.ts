import pino, { type Logger } from "pino";

const rootLogger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : { target: "pino-pretty", options: { translateTime: true } },
});

export function createModuleLogger(namespace: string): Logger {
  return rootLogger.child({ module: namespace });
}
