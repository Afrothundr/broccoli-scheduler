# broccoli-scheduler

The clock for [broccoli-api](https://github.com/Afrothundr/broccoli). It runs two
hourly crons and does nothing else.

| Cron | Calls | What it does |
|------|-------|--------------|
| `15 * * * *` | `internal.expireItems` | Flips `ACTIVE` items past their `expiresAt` to `EXPIRED` |
| `20 * * * *` | `internal.sendNudges` | Sends the day's grouped push nudges to whoever is eligible right now |

## Why it's this small

broccoli-api **owns the Prisma schema and is the single writer of record**
(PRD §4). So this service holds no database connection, no queue, and no
business logic — each tick is one idempotent HTTP POST to broccoli-api's
token-gated `internal.*` tRPC surface. Eligibility rules (quiet hours, one
nudge per user per local day) live in the api, next to the data they read.

That means a missed tick needs no retry: the next hour catches it. Which is why
there is no Redis and no BullMQ here anymore.

## Configuration

| Variable | Purpose |
|----------|---------|
| `CORE_API_URL` | Base URL of broccoli-api |
| `CORE_API_TOKEN` | Shared service token, sent as `x-service-token` |
| `PORT` | Port for the `/health` endpoint (Railway's healthcheck target) |
| `ENVIRONMENT` | Set to `local` for pretty-printed logs |

If `CORE_API_URL` or `CORE_API_TOKEN` is missing, each tick logs a warning and
no-ops rather than crashing the service.

## Run locally

```bash
npm install
npm run scheduler     # nodemon; GET /health to check it's up
```

## History

Through v1 this service also ran the legacy PWA's BullMQ queues (image
processing, item status transitions) and sent Resend/MJML digest emails against
the old `railway` database. All of that retired with the move to the mobile app
— mobile push replaced email as the notification channel (PRD §"Cut"). See git
history before `v2.0.0` if you need it back.
