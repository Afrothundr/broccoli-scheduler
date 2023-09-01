import { ItemStatusType, PrismaClient } from "@prisma/client";
import { Job, Worker, WorkerOptions } from "bullmq";
import { redisOptions } from "./app";
import { WorkerJob, jobTypes } from "./jobs";
import { QUEUE_TYPES } from "./types";

const prisma = new PrismaClient();

const workerHandler = async (job: Job<WorkerJob>) => {
  switch (job.data.type) {
    case jobTypes.ITEM_UPDATER: {
      const { ids, status } = job.data.data;
      console.log(`Starting to update items: ${ids}`);
      await prisma.item.updateMany({
        where: { id: { in: ids } },
        data: { status: status as ItemStatusType },
      });
      console.log(`Completed Updates on items: ${ids}`);
      return;
    }
  }
};

const workerOptions: WorkerOptions = {
  connection: {
    host: redisOptions.host,
    port: redisOptions.port,
  },
};

const worker = new Worker(
  QUEUE_TYPES.ITEM_UPDATER,
  workerHandler,
  workerOptions
);

console.log("worker started");
