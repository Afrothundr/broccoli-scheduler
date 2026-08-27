import dotenv from "dotenv";
import express from "express";
import cron from "node-cron";
import expireCoreItems from "./workers/expireCoreItems";
import sendCoreNudges from "./workers/sendCoreNudges";
import sendCoreMealNudges from "./workers/sendMealNudges";
import logger from "./utils/logger";

dotenv.config();

// This service is a clock, nothing more. It owns no data and holds no queue:
// every tick is one idempotent HTTP call to broccoli-api's token-gated
// `internal.*` tRPC surface, which stays the single writer of record (PRD §4).
// A missed tick self-heals on the next hour, so there is nothing to retry.

const app = express();

// Railway needs a listening port and a healthcheck target; the crons above
// are the actual work.
app.get("/health", (_req, res) =>
  res.status(200).json({ status: "ok", service: "broccoli-scheduler" }),
);

app.listen(process.env.PORT ?? 3000, () => {
  logger.info(`broccoli-scheduler listening on ${process.env.PORT ?? 3000}`);
});

// Phase 3 expiration sweep (core PRD §7): hourly, on the quarter hour.
cron.schedule("15 * * * *", async () => {
  try {
    const expired = await expireCoreItems();
    if (expired > 0) {
      logger.info(`expiration sweep: ${expired} item(s) marked EXPIRED`);
    }
  } catch (err) {
    logger.error("expiration sweep failed", err);
  }
});

// Phase 4 nudge tick (core PRD §7): hourly at :20, right after the expiry
// sweep so freshly-EXPIRED items make it into the day's nudge. The api
// decides who's eligible (quiet hours, one nudge per local day) — the
// hourly tick just means each user is nudged at the first eligible hour.
cron.schedule("20 * * * *", async () => {
  try {
    const result = await sendCoreNudges();
    if (result && result.usersNudged > 0) {
      logger.info(
        `nudge tick: ${result.usersNudged} user(s) nudged, ${result.messagesSent} message(s), ${result.tokensPruned} token(s) pruned`,
      );
    }
  } catch (err) {
    logger.error("nudge tick failed", err);
  }
});

// Meal-window tick (PRD Pillar 4): every 5 minutes so meal prompts land
// within ±5 min of the user's chosen time. The api decides which windows are
// due (per-day-of-week, idempotent per local day) — this is just the clock,
// same shape as the hourly nudges above.
cron.schedule("*/5 * * * *", async () => {
  try {
    const result = await sendCoreMealNudges();
    if (result && result.mealsFired > 0) {
      logger.info(
        `meal tick: ${result.mealsFired} meal(s) fired, ${result.messagesSent} message(s), ${result.tokensPruned} token(s) pruned`,
      );
    }
  } catch (err) {
    logger.error("meal tick failed", err);
  }
});
