import { Queue, type WorkerOptions, Worker, delay } from "bullmq";
import cors from "cors";
import dotenv from "dotenv";
import express, { type Request } from "express";
import cron from "node-cron";
import { type WorkerJob, jobTypes } from "./jobs";
import { QUEUE_TYPES, UserPreferences } from "./types";
import redis from "./redisConnection";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import handleItemUpdate from "./workers/handleItemUpdate";
import handleImageProcess from "./workers/handleImageProcess";
import updateReceipt, { type ScrapedItem } from "./workers/updateReceipt";
import passport from "passport";
import { HeaderAPIKeyStrategy } from "passport-headerapikey";
import handleDailyReport from "./workers/handleDailyReport";
import prisma from "./repository/prisma";
import logger from "./utils/logger";
import dayjs from "dayjs";
dotenv.config();

export const redisOptions = {
  host: process.env.REDISHOST ?? "localhost",
  port: Number.parseInt(process.env.REDISPORT ?? "6379"),
  password: process.env.REDISPASSWORD,
};

const queues = {
  itemUpdater: new Queue(QUEUE_TYPES.ITEM_UPDATER, {
    connection: redis.duplicate(),
  }),
  imageProcessors: new Queue(QUEUE_TYPES.IMAGE_PROCESSOR, {
    connection: redis.duplicate(),
  }),
  dailyReporter: new Queue(QUEUE_TYPES.DAILY_REPORTER, {
    connection: redis.duplicate(),
  }),
};

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

createBullBoard({
  queues: [
    new BullMQAdapter(queues.itemUpdater),
    new BullMQAdapter(queues.imageProcessors),
    new BullMQAdapter(queues.dailyReporter),
  ],
  serverAdapter: serverAdapter,
});

passport.use(
  new HeaderAPIKeyStrategy(
    { header: "x-api-key", prefix: "api-key-" },
    false,
    (apiKey, done) =>
      process.env.API_KEYS?.includes(apiKey)
        ? done(null, true)
        : done(null, false)
  )
);

const app = express();

const workerOptions: WorkerOptions = {
  connection: redisOptions,
};

try {
  new Worker(QUEUE_TYPES.ITEM_UPDATER, handleItemUpdate, workerOptions);
  new Worker(QUEUE_TYPES.IMAGE_PROCESSOR, handleImageProcess, workerOptions);
  new Worker(QUEUE_TYPES.DAILY_REPORTER, handleDailyReport, workerOptions);
  logger.info(
    "started worker",
    QUEUE_TYPES.ITEM_UPDATER,
    QUEUE_TYPES.IMAGE_PROCESSOR
  );
} catch (err) {
  logger.error(err);
}

// Utilities

const addJobToItemUpdaterQueue = async (job: WorkerJob, delay: number) =>
  await queues.itemUpdater.add(job.type, job, { delay });

const addJobToImageProcessingQueue = async (job: WorkerJob, delay: number) =>
  await queues.imageProcessors.add(job.type, job, { delay });

const addJobToDailyReportQueue = async (job: WorkerJob, delay: number) =>
  await queues.dailyReporter.add(job.type, job, { delay });

const authMiddleware = () =>
  passport.authenticate("headerapikey", {
    session: false,
  });

(async () => {
  try {
    app.use(express.json(), cors());
    app.post(
      "/items/update",
      authMiddleware(),
      async (
        req: Request<{ ids: number[]; status: string; delay: number }>,
        res
      ) => {
        try {
          const { ids, status, delay } = req.body;
          logger.info(
            `adding job to item updater queue: ${ids} - ${dayjs()
              .add(delay, "millisecond")
              .format("MM-DD-YYYY HH:mm:ss")}`
          );
          await addJobToItemUpdaterQueue(
            {
              type: jobTypes.ITEM_UPDATER,
              data: { ids, status },
            },
            delay
          );
          res.status(200).json({
            queued: true,
          });
        } catch (err) {
          return res.status(500).send("error in worker");
        }
      }
    );
    app.post(
      "/receipts/process",
      authMiddleware(),
      async (
        req: Request<{ receiptId: number; url: string; delay: number }>,
        res
      ) => {
        try {
          const { receiptId, url, delay } = req.body;
          await addJobToImageProcessingQueue(
            {
              type: jobTypes.IMAGE_PROCESSOR,
              data: { receiptId, url },
            },
            delay
          );
          res.status(200).json({
            queued: true,
          });
        } catch (err) {
          return res.status(500).send("error in worker");
        }
      }
    );
    app.post(
      "/receipts/callback",
      authMiddleware(),
      async (req: Request<{ receiptId: number; data: unknown }>, res) => {
        try {
          const { receiptId, data } = req.body;
          const castedData = data as ScrapedItem[];
          await updateReceipt({
            receiptId,
            data: castedData,
          });
          res.status(200).json({
            success: true,
          });
        } catch (err) {
          logger.error(err);
          return res.status(500).send("error in worker");
        }
      }
    );
    app.post(
      "/reports/daily",
      authMiddleware(),
      async (req: Request<{ userId: number; delay: number }>, res) => {
        try {
          const { userId: id, delay } = req.body;
          await addJobToDailyReportQueue(
            {
              type: jobTypes.DAILY_REPORTER,
              data: { id },
            },
            delay
          );
          res.status(200).json({
            queued: true,
          });
        } catch (err) {
          return res.status(500).send("error in worker");
        }
      }
    );
    app.use("/admin/queues", serverAdapter.getRouter());
    app.use(passport.initialize());
    app.listen(process.env.PORT, async () => {
      logger.info(
        `Server running at ${process.env.BASE_URL}:${process.env.PORT}`
      );
      logger.info(
        `For the UI, open ${process.env.BASE_URL}:${process.env.PORT}/admin/queues`
      );
    });
    cron.schedule(
      "30 10 * * *",
      async () => {
        logger.info("Starting daily reports queue");
        const users = await prisma.user.findMany();
        users.map((user, index) => {
          const preferences = (user.preferences ??
            {}) as unknown as UserPreferences;
          if (!preferences?.notifications) {
            return;
          }
          switch (preferences?.emailFrequency) {
            case "weekly":
              if (dayjs().day() !== 0) {
                break;
              }
            case "monthly":
              if (dayjs().date() !== 1) {
                break;
              }
            case "daily":
            default:
              addJobToDailyReportQueue(
                {
                  type: jobTypes.DAILY_REPORTER,
                  data: { id: user.id },
                },
                index * 5000
              );
          }
        });
      },
      {
        scheduled: true,
        timezone: "America/Chicago",
      }
    );
  } catch (e) {
    logger.error("error on startup:", e);
  }
})();
