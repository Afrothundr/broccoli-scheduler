import { ReceiptStatus } from "@prisma/client";
import prisma from "../repository/prisma";
import { randomUUID } from "node:crypto";
import logger from "../utils/logger";

export type ScrapedResult = {
  store?: string;
  items: ScrapedItem[];
};
export type ScrapedItem = {
  name?: string;
  price?: number;
  quantity?: number;
  unit?: string;
  category?: string;
};

const updateReceipt = async ({
  receiptId,
  data,
}: {
  receiptId: number;
  data: ScrapedResult;
}) => {
  try {
    const store = data.store;
    const items = data.items.map((item) => ({
      ...item,
      importId: randomUUID(),
    }));
    const receipt = await prisma.receipt.update({
      where: {
        id: receiptId,
      },
      data: {
        scrapedData: JSON.stringify({
          items,
        }),
        status: ReceiptStatus.IMPORTED,
      },
    });
    if (store && receipt.groceryTripId) {
      await prisma.groceryTrip.update({
        where: {
          id: receipt.groceryTripId,
        },
        data: {
          name: store,
        },
      });
    }
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
