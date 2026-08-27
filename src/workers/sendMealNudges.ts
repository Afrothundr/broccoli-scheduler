import logger from "../utils/logger";

export default async function sendCoreMealNudges(): Promise<{
  mealsFired: number;
  messagesSent: number;
  tokensPruned: number;
} | null> {
  const url = process.env.CORE_API_URL;
  const token = process.env.CORE_API_TOKEN;
  if (!url || !token) {
    logger.warn(
      "sendCoreMealNudges skipped: CORE_API_URL / CORE_API_TOKEN not configured",
    );
    return null;
  }

  const res = await fetch(`${url}/trpc/internal.sendMealNudges`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-service-token": token,
    },
    body: "{}",
  });
  if (!res.ok) {
    throw new Error(`internal.sendMealNudges failed: ${res.status}`);
  }
  const json = (await res.json()) as {
    result: {
      data: { mealsFired: number; messagesSent: number; tokensPruned: number };
    };
  };
  return json.result.data;
}