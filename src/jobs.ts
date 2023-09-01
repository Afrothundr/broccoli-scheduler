export enum jobTypes {
  ITEM_UPDATER = "Update Item Freshness",
}

export interface ItemUpdateJob {
  type: jobTypes.ITEM_UPDATER;
  data: { ids: number[]; status: string };
}

export type WorkerJob = ItemUpdateJob;
