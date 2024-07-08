export enum jobTypes {
  ITEM_UPDATER = "Update Item Freshness",
  IMAGE_PROCESSOR = "Processes Image",
  DAILY_REPORTER = "Send Daily Report Email",
}

export interface ItemUpdateJob {
  type: jobTypes.ITEM_UPDATER;
  data: { ids: number[]; status: string };
}

export interface ImageProcessJob {
  type: jobTypes.IMAGE_PROCESSOR;
  data: { receiptId: number; url: string };
}

export interface DailyReporterJob {
  type: jobTypes.DAILY_REPORTER;
  data: { id: number };
}

export type WorkerJob = ItemUpdateJob | ImageProcessJob | DailyReporterJob;
