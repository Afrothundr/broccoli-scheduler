import logger from "../utils/logger";

// Phase 4 (core PRD §7): ask broccoli-api to send the day's grouped push
// nudges to whoever is eligible right now — the api owns eligibility (quiet
// hours, once per local day) and delivery (Expo Push API); this service is
// just the clock, same shape as expireCoreItems.
export default async function sendCoreNudges(): Promise<{
  usersNudged: number;
  messagesSent: number;
  tokensPruned: number;
} | null> {
  const url = process.env.CORE_API_URL;
  const token = process.env.CORE_API_TOKEN;
  if (!url || !token) {
    logger.warn(
      "sendCoreNudges skipped: CORE_API_URL / CORE_API_TOKEN not configured",
    );
    return null;
  }

  const res = await fetch(`${url}/trpc/internal.sendNudges`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-service-token": token,
    },
    body: "{}",
  });
  if (!res.ok) {
    throw new Error(`internal.sendNudges failed: ${res.status}`);
  }
  const json = (await res.json()) as {
    result: {
      data: { usersNudged: number; messagesSent: number; tokensPruned: number };
    };
  };
  return json.result.data;
}
