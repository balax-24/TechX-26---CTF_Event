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

Checkpoints support multiple validation strategies:

| `validation_type` | Description | Verification Logic |
|---|---|---|
| `token_proof` | Intermediate JWT or hex token generated during challenge execution | Evaluated via timing-safe string comparison or salted SHA-256 |
| `sub_flag` | Standard sub-flag in `TECHX{...}` format | Evaluated by hashing the input with `FLAG_SALT` and comparing to `secret_proof_hash` |
| `server_callback` | Automated trigger from challenge container | Secret proof matched via internal API callback |

All proof evaluations use `timingSafeMatch` (crypto `timingSafeEqual`) to eliminate side-channel timing attacks.

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

## 5. Checkpoint Concurrency & Idempotency

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

---

## 6. Rate Limiting

- Checkpoint validation requests are rate-limited to **10 attempts per minute per team**.
- Uses Redis sliding-window with in-memory fallback.
- Exceeding the threshold returns `429 Too Many Requests`.
