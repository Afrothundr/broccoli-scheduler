export enum jobTypes {
  ITEM_UPDATER = "Update Item Freshness",
  IMAGE_PROCESSOR = "Processes Image",
}

export interface ItemUpdateJob {
  type: jobTypes.ITEM_UPDATER;
  data: { ids: number[]; status: string };
}

export interface ImageProcessJob {
  type: jobTypes.IMAGE_PROCESSOR;
  data: { receiptId: number; url: string };
}

export type WorkerJob = ItemUpdateJob | ImageProcessJob;
