import cron from "node-cron";
import app from "./app";
import { logger } from "./lib/logger";
import { runAllEnabledSources } from "./lib/rate-ingest";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // ── DSR/SSR rate auto-sync scheduler ──────────────────────────────────────
  // Daily at 02:00 server time, run every enabled rate source.
  cron.schedule("0 2 * * *", () => {
    logger.info("Running scheduled rate sync");
    runAllEnabledSources()
      .then((results) => logger.info({ count: results.length }, "Scheduled rate sync complete"))
      .catch((e) => logger.error({ err: e?.message ?? String(e) }, "Scheduled rate sync failed"));
  });
  logger.info("Rate sync scheduler armed (daily at 02:00)");
});
