import { type GroceryTrip, type Item, ItemStatusType } from "@prisma/client";
import logger from "./logger";

export default function calculateTotalSavings(
  groceryTrips: (GroceryTrip & {
    Item: (Item & { status: ItemStatusType })[];
  })[]
) {
  try {
    const filteredTrips = groceryTrips.reduce(
      (acc, curr) => {
        if (curr.Item.length > 0) {
          acc.push({
            totalItems: curr.Item.length,
            cost: curr.Item.reduce((acc, curr) => acc + curr.price, 0),
            itemsConsumed: curr.Item.reduce(
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
        cost: number;
      }[]
    );

    const averageConsumed =
      filteredTrips.reduce(
        (acc, curr) =>
          acc +
          curr.itemsConsumed / (curr.totalItems > 0 ? curr.totalItems : 1),
        0
      ) / filteredTrips.length;
    const totalCost = filteredTrips.reduce(
      (total, trip) => total + trip.cost,
      0
    );

    const BASELINE_LOSS = (1 / 3) * -1;
    const savingsPercentage = BASELINE_LOSS + averageConsumed;
    const averageAmountSaved =
      (totalCost * savingsPercentage) / filteredTrips.length;
    const value = Number.isNaN(averageAmountSaved)
      ? 0
      : Number.parseFloat(averageAmountSaved.toFixed(2));
    return Number.parseFloat((value > 0 ? value : 0).toFixed(2));
  } catch (e) {
    logger.error(`Error occurred calculating total savings: ${e}`);
    return null;
  }
}
