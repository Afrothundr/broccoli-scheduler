import logger from "../utils/logger";

// Phase 3 (core PRD §7): ask broccoli-api to flip ACTIVE items past their
// expiration date to EXPIRED. The api owns the schema and is the single DB
// writer, so this goes over its token-gated internal tRPC surface rather
// than touching Postgres directly (PRD §4). Idempotent — a missed run is
// caught by the next one.
export default async function expireCoreItems(): Promise<number> {
  const url = process.env.CORE_API_URL;
  const token = process.env.CORE_API_TOKEN;
  if (!url || !token) {
    logger.warn(
      "expireCoreItems skipped: CORE_API_URL / CORE_API_TOKEN not configured",
    );
    return 0;
  }

  const res = await fetch(`${url}/trpc/internal.expireItems`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-service-token": token,
    },
    body: "{}",
  });
  if (!res.ok) {
    throw new Error(`internal.expireItems failed: ${res.status}`);
  }
  const json = (await res.json()) as {
    result: { data: { expired: number } };
  };
  return json.result.data.expired;
}
