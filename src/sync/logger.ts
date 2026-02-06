import winston from "winston";

const isProduction = process.env.NODE_ENV === "production";

export const logger = winston.createLogger({
  level: process.env.SYNC_LOG_LEVEL || "info",
  format: isProduction
    ? winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    : winston.format.combine(
        winston.format.timestamp({ format: "HH:mm:ss" }),
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, context, ...rest }) => {
          const ctx = context ? `[${context}]` : "";
          const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : "";
          return `${timestamp} ${level} ${ctx} ${message}${extra}`;
        })
      ),
  transports: [new winston.transports.Console()],
});

export function createChildLogger(context: string) {
  return logger.child({ context });
}
