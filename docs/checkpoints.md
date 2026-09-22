# TechX CTF 2026 — Checkpoints Subsystem Specification (Stage 4)

## 1. Purpose & Overview

Checkpoints enable multi-stage challenges (such as realistic cyber kill-chain or reverse-engineering challenges) where teams unlock partial points and intermediate progress without solving the entire challenge at once.

---

## 2. Anti-Tampering Design

Clients are **never** authoritative:
- The backend rejects requests containing `{ "completed": true }` or client-supplied scores.
- Checkpoints require cryptographic proof submitted to:
  ```http
  POST /api/v1/checkpoints/:checkpointId/validate
  Content-Type: application/json

  {
    "proof": "TECHX{sub_flag_step_one}"
  }
  ```

---

## 3. Validation Mechanisms (`validation_type`)

Checkpoints categorize validation strategies into **Production-Safe Implemented** and **Reserved Scaffolding**:

| `validation_type` | Status | Verification Logic | Security Profile |
|---|---|---|---|
| `token_proof` | **Production-Safe & Implemented** | Constant-time comparison or salted SHA-256 hash match against `secret_proof_hash` | Participant submits proof token; verified in constant time (`timingSafeMatch`) |
| `sub_flag` | **Production-Safe & Implemented** | Input trimmed, hashed with `FLAG_SALT` and matched against `secret_proof_hash` | Standard flag format `TECHX{...}` for multi-stage flags |
| `server_callback` | **Reserved / Scaffolded** | Reserved for future container orchestration infrastructure (e.g. Stage 6/7) | Blocked from direct participant validation endpoint (`SERVER_CALLBACK_ONLY`). Challenge containers must use internal mutual authentication |

> [!IMPORTANT]
> `server_callback` is reserved scaffolding. The public participant API explicitly rejects attempts to submit proofs to `server_callback` checkpoints with `HTTP 400 Bad Request`. Participants can never self-award a server callback checkpoint.

All active proof evaluations use `timingSafeMatch` (`crypto.timingSafeEqual`) to eliminate side-channel timing attacks.

---

## 4. Strict Prerequisite Enforcement

Checkpoints enforce sequential progression within a challenge:
- Step 1 can be completed directly.
- Step $N$ strictly requires that Step $N - 1$ is already recorded in `checkpoint_progress` for the team.
- Attempting to skip ahead to Step 3 before completing Step 2 results in:
  ```http
  HTTP/1.1 400 Bad Request
  {
    "statusCode": 400,
    "error": "Bad Request",
    "message": "You must complete preceding checkpoints before attempting this one"
  }
  ```

---

## 5. Checkpoint Concurrency, Idempotency & Point Capping

- `checkpoint_progress` enforces a database constraint:
  ```sql
  UNIQUE(team_id, checkpoint_id)
  ```
- When multiple teammates submit the same checkpoint simultaneously:
  - Exactly **1** transaction completes the insert, awards partial points, and appends a `checkpoint_solve` event to `score_events`.
  - The other **49** concurrent requests receive:
    ```json
    {
      "status": "already_completed",
      "pointsAwarded": 0
    }
    ```
- If the challenge has already been final-solved by the team:
  ```json
  {
    "status": "already_solved",
    "pointsAwarded": 0
  }
  ```
- **Point Cap Defense**: Checkpoint points are defensively capped at `max(0, challenge.points - alreadyAwardedCheckpoints)` so that total checkpoint rewards can never exceed the challenge's configured point value.

---

## 6. Rate Limiting

- Checkpoint validation requests are rate-limited to **10 attempts per minute per team**.
- Uses Redis sliding-window with in-memory fallback.
- Exceeding the threshold returns `429 Too Many Requests`.
