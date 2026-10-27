import type { Logger } from "pino";
import { abortAllJobs } from "../services/jobs.js";

/**
 * Graceful process shutdown: cancel running scans (killing their scanner children and writing
 * their final manifests), run `close`, then exit. SIGINT/SIGTERM trigger it; a second signal
 * exits immediately. Returns the same shutdown for other triggers (e.g. the stdio client leaving).
 */
export function installShutdown(close: () => Promise<void>, logger: Logger): (reason: string) => Promise<void> {
  let shuttingDown: Promise<void> | undefined;
  const shutdown = (reason: string): Promise<void> => {
    shuttingDown ??= (async () => {
      logger.info({ reason }, "shutting down");
      try {
        await abortAllJobs();
        await close();
      } catch (err) {
        logger.error({ err }, "error during shutdown");
      }
      process.exit(0);
    })();
    return shuttingDown;
  };
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      if (shuttingDown) process.exit(1);
      void shutdown(sig);
    });
  }
  return shutdown;
}
