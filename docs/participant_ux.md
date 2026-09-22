# TechX CTF 2026 — Participant Frontend & UX Architecture

## 1. Overview
The TechX CTF 2026 participant frontend is a production-grade single-page web application (SPA) built using **React 18**, **Vite**, and **TypeScript**, styled via a custom **Vanilla CSS tokenized design system**.

Designed to support 200–400 concurrent participants across College LAN, local event servers, and cloud VPS environments, the frontend operates under the strict **Server Authority Rule** and requires **zero external internet CDNs** (all fonts, SVGs, and assets are self-contained).

---

## 2. Core Principles & Server Authority
- **Zero Client Trust**: The browser is never authoritative for scoring, challenge release schedules, flag correctness, hint unlock eligibility, checkpoint validation, or leaderboard rankings. The frontend acts solely as an accessible presentation layer reflecting server state.
- **Single SSE Stream**: Exactly one Server-Sent Events connection is established per browser application to `GET /api/v1/leaderboard/stream`, eliminating connection fanout storms.
- **Monotonic Leaderboard Versioning & Gap Recovery**:
  - Incremental score updates (`leaderboard_update`) are verified against the local `leaderboardVersion`.
  - Stale or duplicate events ($V \le V_{\text{local}}$) are safely dropped.
  - Monotonic contiguous events ($V = V_{\text{local}} + 1$) update standings deterministically.
  - Out-of-order or missed events ($V > V_{\text{local}} + 1$) immediately trigger snapshot recovery via `GET /api/v1/leaderboard`.
- **Session-Bound CSRF Integration**: State-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`) automatically attach the HMAC-SHA256 user-bound `X-CSRF-Token` retrieved from `GET /api/v1/auth/csrf` or the double-submit cookie.
- **Defense Against Double Submissions**: Mutation forms (flag submit, hint unlock, checkpoint validation) disable input controls and single-flight buttons while network requests are pending.

---

## 3. Design System & Tokens
- **Brand Colors**:
  - Primary Brand: `#6A1B9A` (TechX Purple)
  - Hover / Light: `#8E24AA`
  - Glow / Accent: `#BA68C8`
  - Background: Deep Dark `#0D0F17`
  - Surface Tiers: `#161926` (Default), `#1F2438` (Elevated), `#090B10` (Sunken)
  - Border: `#262B3F`
- **Semantic Statuses**:
  - Success: `#10B981` (Solved / Live)
  - Warning: `#F59E0B` (Paused / Penalty)
  - Danger: `#EF4444` (Ended / Disqualified / Error)
  - Info: `#6366F1` (Registration Open / System Notices)
- **Typography & Accessibility**:
  - High-tech sans-serif stack (`Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`).
  - Monospace font stack (`'JetBrains Mono', 'SF Mono', Consolas, monospace`) for flags, hashes, tokens, and numerical scores.
  - Visible focus indicators (`:focus-visible`) and WCAG 2.1 AA compliant color contrast.

---

## 4. Participant Route Map
| Path | Access | Description |
| :--- | :--- | :--- |
| `/` | Public | Event overview, informational countdown, schedule, and rules. |
| `/login` | Public | Participant authentication using HttpOnly credentials. |
| `/register` | Public | Account registration for contestants. |
| `/leaderboard` | Public | Live scoreboard with podium view and real-time SSE updates. |
| `/dashboard` | Authenticated | Participant control center with team overview and contest state. |
| `/challenges` | Authenticated | Filterable challenge arena with category tabs and difficulty chips. |
| `/team` | Authenticated | Team management, captain invite code sharing, and solve roster. |

---

## 5. Reconnection & Network Resilience
- **Exponential Backoff with Jitter**:
  When SSE connections drop due to Wi-Fi interruptions or laptop sleep, reconnection attempts follow a bounded backoff curve (1s, 2s, 4s, 8s, 16s, max 30s) + random jitter.
- **Offline / Degraded Mode**:
  If the backend becomes temporarily unreachable, the frontend preserves the latest known state, displays an unobtrusive warning banner, and resumes synchronization upon reconnection.

---

## 6. Stage 7 Hardening Enhancements
- **Precise CSRF Retry Matrix**:
  - 403 responses trigger CSRF refresh and a single retry **only** when the error explicitly identifies a CSRF failure (`CSRF_REQUIRED`, `CSRF_INVALID`).
  - Business-level 403 responses (`TEAM_DISQUALIFIED`, `COMPETITION_PAUSED`, `COMPETITION_ENDED`, `FORBIDDEN`, `ADMIN_PARTICIPATION_FORBIDDEN`) **never** trigger CSRF retry.
- **Zero Mutation Retries on Failure/Timeout**:
  - Mutations (`POST`, `PUT`, `PATCH`, `DELETE`) are never blindly retried on timeouts or 5xx errors.
  - Timeouts communicate uncertainty with safe recovery guidance: `"The request timed out. Please check your connection and verify your challenge status before trying again."`
- **Native EventSource Lifecycle**:
  - Preserves browser native reconnection (`readyState === EventSource.CONNECTING`) ensuring automatic transmission of `Last-Event-ID` request headers.
  - Reinstantiates connections with bounded backoff only on fatal closures (`readyState === EventSource.CLOSED`).
  - Fully tears down connections and cancels pending reconnect timers on logout.
- **Accessibility & Mobile Touch Targets**:
  - All interactive controls (buttons, inputs, modal dismissals) enforce $\ge 44\text{px}$ touch targets.
  - Form validation errors dynamically link to inputs via `aria-describedby` and set `aria-invalid`.
  - Code blocks and connection strings enforce `word-break: break-all` to prevent viewport overflow on 360px devices.
- **Session Cleanup**:
  - Global 401 interception scrubs user profile, team data, cached CSRF tokens, and terminates SSE streams immediately.
