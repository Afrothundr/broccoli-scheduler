import type { Job } from "bullmq";
import { Queue } from "bullmq";
import { type WorkerJob, jobTypes, type ItemUpdateJob } from "../jobs";
import prisma from "../repository/prisma";
import logger from "../utils/logger";
import redis from "../redisConnection";
import * as types from "../types";

const handleItemRemove = async (job: Job<WorkerJob>) => {
  switch (job.data.type) {
    case jobTypes.ITEM_REMOVER: {
      const { ids } = job.data.data;
      try {
        logger.info(`Starting to remove items: ${ids}`);

        // Create a queue instance to access the itemUpdater queue
        const itemUpdaterQueue = new Queue(types.QUEUE_TYPES.ITEM_UPDATER, {
          connection: redis.duplicate(),
        });

        // Get all jobs from the queue (waiting, delayed, and active)
        const [waitingJobs, delayedJobs, activeJobs] = await Promise.all([
          itemUpdaterQueue.getWaiting(),
          itemUpdaterQueue.getDelayed(),
          itemUpdaterQueue.getActive(),
        ]);

        const allJobs = [...waitingJobs, ...delayedJobs, ...activeJobs];

        // Filter and remove jobs that contain any of the item IDs being removed
        let removedJobCount = 0;
        for (const queueJob of allJobs) {
          const jobData = queueJob.data as WorkerJob;
          if (jobData.type === jobTypes.ITEM_UPDATER) {
            const updateJobData = jobData as ItemUpdateJob;
            const hasMatchingId = updateJobData.data.ids.some((id) =>
              ids.includes(id),
            );
            if (hasMatchingId) {
              await queueJob.remove();
              removedJobCount++;
              logger.info(
                `Removed update job ${queueJob.id} for items: ${updateJobData.data.ids}`,
              );
            }
          }
        }

        logger.info(
          `Removed ${removedJobCount} update job(s) for items: ${ids}`,
        );

        // Close the queue connection
        await itemUpdaterQueue.close();
      } catch (err) {
        logger.error(`Problem removing items: ${err}`);
      }
      return;
    }
  }
};

export default handleItemRemove;
