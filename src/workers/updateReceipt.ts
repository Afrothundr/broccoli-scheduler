import { ReceiptStatus } from "@prisma/client";
import prisma from "../repository/prisma";
import { randomUUID } from "crypto";
import logger from "../utils/logger";

export type ScrapedItem = {
  name?: string;
  price?: number;
  quantity?: number;
  unit?: string;
  itemTypes?: {
    id: number;
    name: string;
  }[];
};

const updateReceipt = async ({
  receiptId,
  data,
}: {
  receiptId: number;
  data: ScrapedItem[];
}) => {
  try {
    await prisma.receipt.update({
      where: {
        id: receiptId,
      },
      data: {
        scrapedData: JSON.stringify({
          items: data.map((data) => ({ ...data, importId: randomUUID() })),
        }),
        status: ReceiptStatus.IMPORTED,
      },
    });
  } catch (err) {
    logger.error(`Problem updating receipt: ${err}`);
    await prisma.receipt.update({
      where: {
        id: receiptId,
      },
      data: {
        status: ReceiptStatus.ERROR,
      },
    });
    throw err;
  }
  return;
};

export default updateReceipt;
