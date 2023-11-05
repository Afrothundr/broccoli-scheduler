import { Queue } from "bullmq";
import cors from "cors";
import dotenv from "dotenv";
import express, { Request } from "express";
import { createClient } from "redis";
import { WorkerJob, jobTypes } from "./jobs";
import { QUEUE_TYPES } from "./types";
dotenv.config();

export const redisOptions = {
  host: process.env.REDISHOST ?? "localhost",
  port: parseInt(process.env.REDISPORT ?? "6379"),
};

const client = createClient({
  url: process.env.REDIS_PRIVATE_URL,
});

const queues = {
  itemUpdater: new Queue(QUEUE_TYPES.ITEM_UPDATER, {
    connection: redisOptions,
  }),
};

const app = express();

// Utilities

const addJobToItemUpdaterQueue = async (job: WorkerJob, delay: number) =>
  await queues.itemUpdater.add(job.type, job, { delay });

(async () => {
  try {
    app.use(express.json(), cors());
    app.post(
      "/items/update",
      async (
        req: Request<{ ids: number[]; status: string; delay: number }>,
        res
      ) => {
        const { ids, status, delay } = req.body;
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
      }
    );
    app.listen(process.env.PORT, async () => {
      console.log(
        `Server running at ${process.env.BASE_URL}:${process.env.PORT}`
      );
      await client.connect();
    });
  } catch (e) {
    console.error("error on startup:", e);
  }
})();

client.on("error", (err) => {
  console.log("Error occurred while connecting or accessing redis server", err);
});
