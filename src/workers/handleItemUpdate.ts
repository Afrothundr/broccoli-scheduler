import { ItemStatusType } from "@prisma/client";
import { Job } from "bullmq";
import { WorkerJob, jobTypes } from "../jobs";
import prisma from "../repository/prisma";

const handleItemUpdate = async (job: Job<WorkerJob>) => {
  switch (job.data.type) {
    case jobTypes.ITEM_UPDATER: {
      const { ids, status } = job.data.data;
      try {
        console.log(`Starting to update items: ${ids}`);
        await prisma.item.updateMany({
          where: {
            id: { in: ids },
            status: {
              notIn: [ItemStatusType.EATEN, ItemStatusType.BAD],
            },
          },
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

export default handleItemUpdate;
