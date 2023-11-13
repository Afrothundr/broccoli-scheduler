import { Job, Queue, WorkerOptions, Worker } from "bullmq";
import cors from "cors";
import dotenv from "dotenv";
import express, { Request } from "express";
import { WorkerJob, jobTypes } from "./jobs";
import { QUEUE_TYPES } from "./types";
import redis from "./redisConnection";
import { PrismaClient, ItemStatusType } from "@prisma/client";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
dotenv.config();

export const redisOptions = {
  host: process.env.REDISHOST ?? "localhost",
  port: parseInt(process.env.REDISPORT ?? "6379"),
  password: process.env.REDISPASSWORD,
};

const queues = {
  itemUpdater: new Queue(QUEUE_TYPES.ITEM_UPDATER, {
    connection: redis.duplicate(),
  }),
};

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

createBullBoard({
  queues: [new BullMQAdapter(queues.itemUpdater)],
  serverAdapter: serverAdapter,
});

const app = express();

const prisma = new PrismaClient();

const workerHandler = async (job: Job<WorkerJob>) => {
  switch (job.data.type) {
    case jobTypes.ITEM_UPDATER: {
      const { ids, status } = job.data.data;
      try {
        console.log(`Starting to update items: ${ids}`);
        await prisma.item.updateMany({
          where: { id: { in: ids } },
          data: { status: status as ItemStatusType },
        });
        console.log(`Completed Updates on items: ${ids} => status ${status}`);
      } catch (err) {
        console.error(`Problem updating item: ${err}`);
      }
      return;
    }
  }
};

const workerOptions: WorkerOptions = {
  connection: redisOptions,
};

try {
  new Worker(QUEUE_TYPES.ITEM_UPDATER, workerHandler, workerOptions);
  console.log("started worker", QUEUE_TYPES.ITEM_UPDATER);
} catch (err) {
  console.error(err);
}

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
        try {
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
        } catch (err) {
          return res.status(500).send("error in worker");
        }
      }
    );
    app.use("/admin/queues", serverAdapter.getRouter());
    app.listen(process.env.PORT, async () => {
      console.log(
        `Server running at ${process.env.BASE_URL}:${process.env.PORT}`
      );
      console.log(
        `For the UI, open ${process.env.BASE_URL}:${process.env.PORT}/admin/queues`
      );
    });
  } catch (e) {
    console.error("error on startup:", e);
  }
})();
