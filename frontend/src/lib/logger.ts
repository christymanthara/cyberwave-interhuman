const ENABLE_DEBUG_LOGS =
  process.env.NEXT_PUBLIC_DEBUG_LOGS === "true" || process.env.NODE_ENV !== "production";

function stamp() {
  return new Date().toISOString();
}

export const appLogger = {
  debug(scope: string, message: string, meta?: unknown) {
    if (!ENABLE_DEBUG_LOGS) return;
    console.debug(`[${stamp()}] [${scope}] ${message}`, meta ?? "");
  },
  info(scope: string, message: string, meta?: unknown) {
    console.info(`[${stamp()}] [${scope}] ${message}`, meta ?? "");
  },
  warn(scope: string, message: string, meta?: unknown) {
    console.warn(`[${stamp()}] [${scope}] ${message}`, meta ?? "");
  },
  error(scope: string, message: string, meta?: unknown) {
    console.error(`[${stamp()}] [${scope}] ${message}`, meta ?? "");
  },
};
