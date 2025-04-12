import type { Job } from "bullmq";
import { type WorkerJob, jobTypes } from "../jobs";
import prisma from "../repository/prisma";
import { ReceiptStatus } from "@prisma/client";
import updateReceipt, { type ScrapedItem } from "./updateReceipt";
import logger from "../utils/logger";

const handleImageProcess = async (job: Job<WorkerJob>) => {
  switch (job.data.type) {
    case jobTypes.IMAGE_PROCESSOR: {
      const { receiptId, url } = job.data.data;
      try {
        logger.info(`Starting to process image: ${url}`);
        const result = await fetch(`${process.env.IMAGE_PROCESSOR_URL}/ocr`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.IMAGE_PROCESSOR_API_KEY ?? "",
          },
          body: JSON.stringify({
            url,
            receiptId,
          }),
        });
        if (!result.ok) {
          const text = await result.text();
          throw new Error(text);
        }
        const { data } = await result.json();
        const castedData = data as ScrapedItem[];
        await updateReceipt({
          receiptId,
          data: castedData,
        });
      } catch (err) {
        logger.error(`Problem processing of image: ${url}`);
        logger.error(err);
        await prisma.receipt.update({
          where: {
            id: receiptId,
          },
          data: {
            status: ReceiptStatus.ERROR,
          },
        });
      }
      return;
    }
  }
};

export default handleImageProcess;
