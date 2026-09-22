# TechX CTF 2026 — Real-Time Pipeline Architecture (Stage 5)

## 1. Architectural Pipeline

```text
                     ┌─────────────────────┐
                     │   Scoring Service   │
                     └──────────┬──────────┘
                                │
                         PostgreSQL TX
                                │
                         ┌──────▼──────┐
                         │    COMMIT   │
                         └──────┬──────┘
                                │
                         Score Event
                                │
                         ┌──────▼──────┐
                         │ Outbox Table │ (score_event_outbox)
                         └──────┬──────┘
                                │
                         Outbox Worker   (FOR UPDATE SKIP LOCKED)
                                │
                         ┌──────▼──────┐
                         │    Redis    │ (Channel: techx:leaderboard:events)
                         │   Pub/Sub   │
                         └──────┬──────┘
                                │
                    ┌───────────▼───────────┐
                    │    SSE Connection     │ (1 Redis subscriber fan-out)
                    │       Manager         │
                    └───────────┬───────────┘
                                │
                  ┌─────────────┼─────────────┐
                  ▼             ▼             ▼
              Browser A     Browser B      Browser N
```

---

## 2. Layer Responsibilities & Guarantees

| Layer | Responsibility | Authoritative? | Failure Guarantee |
| :--- | :--- | :--- | :--- |
| **PostgreSQL** | Scores, Solves, Ledger, Outbox rows | **YES** | ACID durability; crash-proof |
| **Outbox Worker** | Claim pending rows (`SKIP LOCKED`) & publish | NO | Bounded retries + exponential backoff |
| **Redis** | Pub/Sub transport bus | NO | At-least-once transport; duplicate-safe |
| **SSE Manager** | In-memory connection fan-out & heartbeats | NO | Prunes dead client sockets immediately |
| **NGINX** | Reverse proxy with zero buffering | NO | Streams events directly to client sockets |
| **Browser** | Renders server-derived leaderboard | NO | Never calculates scores or ranks |

---

## 3. Transactional Outbox (`score_event_outbox`)

### Why It Exists
In traditional architectures, publishing to a message broker (Redis/RabbitMQ) after database commit creates a crash window: if the Node process terminates between database commit and message publish, the event is permanently lost.

In Stage 5, the score mutation, ledger entry, team score update, and outbox insertion occur within the **exact same PostgreSQL transaction**:

```sql
BEGIN;
-- 1. Insert team solve / checkpoint progress
-- 2. Insert immutable score_events ledger row
-- 3. Insert score_event_outbox row
-- 4. Update teams.score and last_score_at
COMMIT;
```

If the transaction rolls back, **zero** outbox events are created. If the transaction commits, the event is durably stored on disk in PostgreSQL even if the Node process or Redis crashes immediately.

### Schema & Indexing
```sql
CREATE TABLE score_event_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(64) NOT NULL UNIQUE,
    event_type VARCHAR(30) NOT NULL,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    challenge_id UUID REFERENCES challenges(id),
    points INTEGER NOT NULL,
    team_score INTEGER NOT NULL,
    rank INTEGER,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    published_at TIMESTAMPTZ,
    attempt_count INTEGER DEFAULT 0 NOT NULL,
    last_attempt_at TIMESTAMPTZ,
    last_error TEXT
);

CREATE INDEX idx_score_event_outbox_pub_created ON score_event_outbox (published_at, created_at);
CREATE UNIQUE INDEX idx_score_event_outbox_event_id ON score_event_outbox (event_id);
```

---

## 4. Outbox Worker Mechanics

- **Row Claiming**:
  ```sql
  SELECT id, event_id, payload, attempt_count
  FROM score_event_outbox
  WHERE published_at IS NULL
    AND attempt_count < 5
    AND (last_attempt_at IS NULL OR last_attempt_at < NOW() - (POWER(2, attempt_count) * INTERVAL '250 milliseconds'))
  ORDER BY created_at ASC
  LIMIT 50
  FOR UPDATE SKIP LOCKED;
  ```
  `FOR UPDATE SKIP LOCKED` guarantees multiple backend worker instances never block or duplicate claims.
- **Sub-Second Delivery**: When a scoring transaction commits, `outboxWorker.trigger()` immediately wakes the worker cycle, providing near-instant event delivery under normal conditions.
- **Exponential Backoff**: If Redis is unreachable, events remain in `score_event_outbox` with backoff intervals (`500ms`, `1s`, `2s`, `4s`, `8s`) up to a maximum 30s cap.

---

## 5. Single Redis Subscriber Fan-Out

Rather than establishing separate Redis connections per browser stream (which would overwhelm Redis at 400–800 concurrent connections), Fastify maintains **one** dedicated Redis subscriber client for the `techx:leaderboard:events` channel.

Inbound events are received by `RedisSubscriber` and immediately passed to `SSEConnectionManager.broadcast()`.

---

## 6. SSE Connection Manager & Dead Client Protection

### Fastify Hijacking
SSE streams are established via `reply.hijack()`, maintaining persistent TCP streams without Fastify auto-terminating the response.

### Dead Client Isolation
If a browser disconnects abnormally (e.g. WiFi drop, tab closed, crash):
- Writing to a closed or broken socket throws an error (e.g. `EPIPE`, `ECONNRESET`).
- `SSEConnectionManager` catches write errors per client and immediately prunes the dead connection from the client registry.
- A slow or stalled socket **never blocks or delays** broadcasts to remaining healthy clients.

### Heartbeats
Every 25 seconds, `: heartbeat\n\n` comments are sent to all connected streams to prevent proxy/firewall idle timeouts.

---

## 7. NGINX Ingress Configuration

Both `docker/nginx/nginx.lan.conf` and `docker/nginx/nginx.prod.conf` configure the SSE stream with buffering explicitly disabled:

```nginx
location ~ ^/api/v1/(leaderboard/stream|events/stream) {
    proxy_pass http://backend_upstream;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    
    proxy_buffering off;
    proxy_cache off;
    chunked_transfer_encoding off;
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
}
```

---

## 8. Measured Load Testing Benchmarks

Measured on local test hardware using `backend/tests/load/realtime_load.test.ts`:

| Scenario | Concurrency | Total Events | Mean Fan-Out Latency | P95 Latency | P99 Latency | Delivery Rate |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Scenario 1** | 400 SSE Streams | Heartbeat | 0.45ms | < 1ms | < 1ms | **100%** |
| **Scenario 2** | 400 SSE Streams | 20 Bursts (8,000 deliveries) | 0.246ms | 0.791ms | 0.791ms | **100%** |
| **Scenario 3** | 800 SSE Streams | 20 Bursts (16,000 deliveries) | 0.707ms | 11.83ms | 11.83ms | **100%** |

Memory footprint for 800 active streams remains below **3MB** of heap delta.
