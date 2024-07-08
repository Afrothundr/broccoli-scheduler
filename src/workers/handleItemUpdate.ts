import { ItemStatusType } from "@prisma/client";
import type { Job } from "bullmq";
import { type WorkerJob, jobTypes } from "../jobs";
import prisma from "../repository/prisma";
import logger from "../utils/logger";

const handleItemUpdate = async (job: Job<WorkerJob>) => {
  switch (job.data.type) {
    case jobTypes.ITEM_UPDATER: {
      const { ids, status } = job.data.data;
      try {
        logger.info(`Starting to update items: ${ids}`);
        await prisma.item.updateMany({
          where: {
            id: { in: ids },
            status: {
              notIn: [ItemStatusType.EATEN, ItemStatusType.BAD],
            },
          },
          data: { status: status as ItemStatusType },
        });
        logger.info(`Completed Updates on items: ${ids} => status ${status}`);
      } catch (err) {
        logger.error(`Problem updating item: ${err}`);
      }
      return;
    }
  }
};

export default handleItemUpdate;
