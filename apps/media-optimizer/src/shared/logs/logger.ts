/**
 * One JSON object per line on stdout. Lambda ships stdout to CloudWatch Logs
 * verbatim, so each line is directly queryable in Logs Insights
 * (`filter action = "compressed" | stats sum(bytesIn - bytesOut)`). No pino:
 * a handful of lines per invocation does not need a logging framework in the
 * bundle.
 */
export type LogFields = Record<string, unknown>;

export interface Logger {
  info(fields: LogFields): void;
  warn(fields: LogFields): void;
  error(fields: LogFields): void;
}

export function createLogger(
  service: string,
  write: (line: string) => void = (line) => process.stdout.write(line)
): Logger {
  const emit = (level: string, fields: LogFields): void => {
    write(`${JSON.stringify({ level, time: new Date().toISOString(), service, ...fields })}\n`);
  };
  return {
    info: (fields) => emit("info", fields),
    warn: (fields) => emit("warn", fields),
    error: (fields) => emit("error", fields),
  };
}
