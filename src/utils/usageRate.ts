import { type GroceryTrip, type Item, ItemStatusType } from "@prisma/client";
import logger from "./logger";

export default function calculateUsageRate(
  groceryTrips: (GroceryTrip & {
    items: (Item & { status: ItemStatusType })[];
  })[]
) {
  try {
    const filteredTrips = groceryTrips.reduce(
      (acc, curr) => {
        if (curr.items.length > 0) {
          acc.push({
            totalItems: curr.items.length,
            itemsConsumed: curr.items.reduce(
              (total, item) =>
                item.status === ItemStatusType.EATEN
                  ? total + 1
                  : total + item.percentConsumed * 0.01,
              0
            ),
          });
        }
        return acc;
      },
      [] as {
        totalItems: number;
        itemsConsumed: number;
      }[]
    );
    const averageConsumed = Math.round(
      (filteredTrips.reduce(
        (acc, curr) =>
          acc +
          curr.itemsConsumed / (curr.totalItems > 0 ? curr.totalItems : 1),
        0
      ) /
        filteredTrips.length) *
        100
    );

    return averageConsumed;
  } catch (e) {
    logger.error(`Error calculating usage rate: ${e}`);
    return null;
  }
}
