import { createBullBoard } from "@bull-board/api";
import { BullAdapter } from "@bull-board/api/bullAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { Queue } from "bullmq";
import cors from "cors";
import dotenv from "dotenv";
import express, { Request } from "express";
import { createClient } from "redis";
import { WorkerJob, jobTypes } from "./jobs";
import { QUEUE_TYPES } from "./types";
dotenv.config();

export const redisOptions = { host: process.env.REDIS_HOST, port: 6379 };

const client = createClient({
  url: `redis://@${redisOptions.host}:${redisOptions.port}`,
});

const queues = {
  itemUpdater: new Queue(QUEUE_TYPES.ITEM_UPDATER, {
    connection: redisOptions,
  }),
};

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

createBullBoard({
  queues: [new BullAdapter(queues.itemUpdater)],
  serverAdapter: serverAdapter,
});

const app = express();
app.use("/admin/queues", serverAdapter.getRouter());

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
      console.log(
        `For the UI, open http://${process.env.BASE_URL}:${process.env.PORT}/admin/queues`
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
