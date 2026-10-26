# TechX CTF 2026 — Browser E2E Debug & Comprehensive Resolution Report

## 1. Original Symptoms

- **Participant Authentication**: Participant created via `REGISTER_TEAM.bat` was able to log in at `http://10.232.217.252/login`.
- **Blank Page on Core Routes**:
  - Immediately following login or upon direct navigation, `/dashboard` and `/challenges` rendered for approximately 100–300ms during loading, and then became **completely blank**.
  - The DOM `#root` container unmounted, leaving `innerHTML === ""`.
  - `/leaderboard` continued to render successfully.
  - Prior CORS preflight failures on LAN origins (`http://10.x.x.x`) had occurred during previous login attempts.

---

## 2. Browser Reproduction

Browser automation using Playwright connected to installed Google Chrome (`C:\Program Files\Google\Chrome\Application\chrome.exe`) was executed against the running live LAN deployment (`http://10.232.217.252`).

1. **Navigation to `/login`**: Rendered login form. Entered participant credentials (`participant@example.com` / `TestPass123!#`).
2. **Form Submission**: Clicked `SIGN IN TO ARENA`. Redirected to `/dashboard`.
3. **Observation during Loading**: Skeleton screen rendered briefly.
4. **Immediate Crash Captured in Chrome DevTools Protocol**:
   - **Console Exception on `/dashboard`**:
     ```
     [BROWSER CONSOLE ERROR]: Error: Minified React error #31; visit https://reactjs.org/docs/error-decoder.html?invariant=31&args[]=object%20with%20keys%20%7Bname%2C%20slug%7D
     [BROWSER UNCAUGHT EXCEPTION]: Error: Minified React error #31;
     ```
     React Error #31: *"Objects are not valid as a React child (found: object with keys {name, slug}). If you meant to render a collection of children, use an array instead."*
   - **Console Exception on `/challenges`**:
     ```
     [BROWSER CONSOLE ERROR]: TypeError: w.category.toUpperCase is not a function
     [BROWSER UNCAUGHT EXCEPTION]: TypeError: w.category.toUpperCase is not a function
     ```
     Occurred at `ChallengesPage.tsx` line 38 (`c.category.toUpperCase()`).
   - **Inspection of `/leaderboard`**:
     Loaded 10,219 bytes of HTML, zero runtime errors.

---

## 3. Root Cause(s)

### Root Cause 1: Category Contract Mismatch (Object vs String)
The backend API (`GET /api/v1/challenges`) in `backend/src/modules/challenges/challenges.service.ts` constructs the challenge payload with `category` serialized as an object:
```typescript
category: {
  name: r.categoryName,
  slug: r.categorySlug,
}
```
However, the frontend TypeScript interface in `frontend/src/types/api.ts` specified:
```typescript
export interface Challenge {
  category: string; // CONTRACT MISMATCH
  ...
}
```
Consequently, multiple frontend React components made invalid assumptions:
1. `DashboardPage.tsx`: Directly rendered `{chal.category}` in JSX table cells. Because `chal.category` is `{ name: "Web Exploitation", slug: "web" }`, React threw fatal Error #31 and unmounted the entire DOM tree.
2. `ChallengesPage.tsx`: Invoked `c.category.toUpperCase()`, `chal.category.toLowerCase()`, and equality comparison directly on `chal.category`. Because `.toUpperCase` is undefined on objects, JavaScript threw an uncaught `TypeError: c.category.toUpperCase is not a function`.
3. `ChallengeCard.tsx`: Rendered `<span>{challenge.category}</span>`, which would crash with Error #31.
4. `ChallengeModal.tsx`: Rendered `<Badge variant="neutral">{challenge.category}</Badge>`, crashing on modal open with Error #31.
5. `TeamPage.tsx`: Rendered `[{s.category || 'GENERAL'}]`, which crashed whenever solves were listed.

### Root Cause 2: Eager CSRF Fetch for Unauthenticated Sessions
In `frontend/src/contexts/AuthContext.tsx` and `frontend/src/api/client.ts`, an eager `GET /api/v1/auth/csrf` request was made prior to login. Because `/auth/csrf` is protected by `authenticate` middleware, it returned `401 Unauthorized` in the console on initial page visits.

---

## 4. CORS Issue Found / Fixed

- **Issue**: LAN requests from browser origin `http://10.232.217.252` failed CORS checks when CORS origin was strictly hardcoded to `http://localhost`.
- **Resolution**: Implemented RFC 1918 private network parsing in `backend/src/utils/origin.ts`:
  - When `DEPLOYMENT_MODE === 'lan'`, origins matching `10.0.0.0/8`, `172.16.0.0/12`, or `192.168.0.0/16` are dynamically and authoritatively validated.
  - Applied consistently across CORS (`backend/src/app.ts`) and CSRF origin verification (`backend/src/middleware/csrf.middleware.ts`).
  - Wildcard (`*`) with credentials was strictly avoided to preserve OWASP compliance.

---

## 5. Blank Page Root Cause

1. React runtime uncaught exception (Minified Error #31) on `/dashboard` caused by embedding raw JavaScript object `{ name, slug }` into JSX child.
2. Uncaught TypeError (`.toUpperCase is not a function`) on `/challenges` caused by calling string methods on category object.
3. React's default error behavior unmounted `#root`, presenting a completely blank white screen.

---

## 6. Other Errors Found & Resolved

1. **Category Filtering Aliases**: Standard CTF categories (`WEB`, `CRYPTO`, `REVERSE`, `PWN`, `FORENSICS`, `OSINT`) were not mapped against database slugs (`rev`, `pwn`, `crypto`). Built canonical alias resolver `matchesCategory()` in `frontend/src/utils/category.ts`.
2. **Unauthenticated CSRF Network 401 Noise**: `client.ts` now skips automatic CSRF prefetching for unauthenticated mutation endpoints (`/auth/login`), eliminating spurious 401s on initial visit.
3. **Test Account Safety Verification**: Validated that `DELETE_TEST_TEAM.bat` requires accounts to use sanctioned test naming patterns (`test_`, `test-`, `techx_test_`) before allowing administrative deletion.

---

## 7. Files Changed

1. `frontend/src/utils/category.ts` (NEW)
2. `frontend/src/types/api.ts`
3. `frontend/src/pages/DashboardPage.tsx`
4. `frontend/src/pages/ChallengesPage.tsx`
5. `frontend/src/components/challenges/ChallengeCard.tsx`
6. `frontend/src/components/challenges/ChallengeModal.tsx`
7. `frontend/src/pages/TeamPage.tsx`
8. `frontend/src/api/client.ts`
9. `frontend/src/contexts/AuthContext.tsx`
10. `frontend/tests/unit/category_helpers.test.ts` (NEW)
11. `scripts/full_e2e_suite.cjs` (NEW)
12. `backend/src/utils/origin.ts` (NEW)
13. `backend/src/app.ts`
14. `backend/src/middleware/csrf.middleware.ts`

---

## 8. What Was Changed

- **`frontend/src/utils/category.ts`**:
  - `getCategoryName(category)`: Safely extracts display name from strings or `{ name, slug }` objects.
  - `getCategorySlug(category)`: Safely extracts slug for filtering and comparisons.
  - `matchesCategory(category, selected)`: Performs case-insensitive matching with support for standard CTF abbreviations (`REVERSE` <-> `rev`, `PWN` <-> `binary`, etc.).
- **`frontend/src/types/api.ts`**:
  - Extended `Challenge`, `ChallengeDetail`, and `TeamSolve` interfaces to accept `category: string | { name: string; slug: string }`.
- **`DashboardPage.tsx`, `ChallengesPage.tsx`, `ChallengeCard.tsx`, `ChallengeModal.tsx`, `TeamPage.tsx`**:
  - Replaced direct object renders and unchecked `.toUpperCase()` calls with `getCategoryName()`, `getCategorySlug()`, and `matchesCategory()`.
- **`frontend/src/api/client.ts` & `AuthContext.tsx`**:
  - Skipped CSRF pre-fetch on `/auth/login` to prevent redundant 401 console errors.

---

## 9. Before / After Behavior

| Route / Workflow | Before Fix | After Fix |
|---|---|---|
| `/dashboard` | Skeleton appears, then page turns completely blank (#root empty) | Full operational console renders (24,595 bytes); stats, countdown, challenges table active |
| `/challenges` | Blank screen due to `TypeError: c.category.toUpperCase is not a function` | Arena grid renders (21,085 bytes); category filter strip works for ALL, WEB, CRYPTO, etc. |
| Challenge Detail Modal | Crashed with React Error #31 upon clicking a card | Modal opens cleanly with challenge description, badges, hints, and flag submission form |
| Flag Submission | Blocked by UI crash | Submits flag, verifies incorrect flag rejection, accepts correct flag, updates score, rejects duplicate |
| `/leaderboard` | Rendered statically | Authoritative snapshot + live SSE telemetry verified connected |
| `/team` | Rendered without solve badges or crashed when solves existed | Displays squad roster, members, and solve breakdown with formatted category tags |
| Page Refresh (F5) | Resulted in blank screen | Session and UI state cleanly persist across hard refreshes |

---

## 10. Browser Workflow Results (Test Matrix)

Executed automatically in Google Chrome against live LAN URL `http://10.232.217.252`:

| # | Workflow | Result | Console Errors | Network Errors | Notes |
|---|---|:---:|---|---|---|
| 1 | Login -> Dashboard | **PASSED** | None | None | Rendered 24,595 bytes; operator, score & console intact |
| 2 | Challenges List Load | **PASSED** | None | None | Rendered 21,085 bytes; category tabs & cards active |
| 3 | Challenge Detail Modal | **PASSED** | None | None | Modal rendered with title, badges, points & description |
| 4 | Flag Submission & Scoring | **PASSED** | None (Bad flag 400 expected) | None | Accepted solve for `Portal of Secrets`, rejected duplicate |
| 5 | Leaderboard Initial Snapshot | **PASSED** | None | None | Team `Internzz` verified at rank 1 with 100 PTS |
| 6 | Leaderboard Realtime SSE | **PASSED** | None | None | SSE telemetry connected; live indicators verified |
| 7 | Team Profile & Solves Roster | **PASSED** | None | None | Rendered 9,614 bytes; solves list with category badge |
| 8 | Hard Refresh `/dashboard` | **PASSED** | None | None | Full dashboard persisted cleanly |
| 9 | Hard Refresh `/challenges` | **PASSED** | None | None | Challenge arena persisted cleanly |
| 10 | Hard Refresh `/leaderboard` | **PASSED** | None | None | Leaderboard persisted cleanly |
| 11 | Participant -> `/admin` Blocked | **PASSED** | 403 Forbidden (expected) | 403 `/admin/teams` | Browser redirected to `/`, direct API returned 403 |
| 12 | Logout -> Relogin | **PASSED** | None | None | Cookies cleared on logout, successfully reauthenticated |
| 13 | Admin Login & Control Plane | **PASSED** | None | None | `techx_admin` logged in, administrative APIs verified |
| 14 | REGISTER_TEAM Provisioning | **PASSED** | None | None | Provisioned `test_e2e_team` / `test_e2e_user@techx.org` |
| 15 | New Participant Browser Login | **PASSED** | None | None | New participant logged in directly into Dashboard |
| 16 | DELETE_TEST_TEAM Cleanup | **PASSED** | None (401 on login expected) | None | DB committed, Redis verified, login blocked after delete |

---

## 11. Console Errors Before vs After

### Before Fix:
```
[ERROR]: Error: Minified React error #31; visit https://reactjs.org/docs/error-decoder.html?invariant=31&args[]=object%20with%20keys%20%7Bname%2C%20slug%7D
[ERROR]: TypeError: w.category.toUpperCase is not a function
[ERROR]: Failed to load resource: the server responded with a status of 401 (Unauthorized) /api/v1/auth/csrf
```

### After Fix:
```
Zero uncaught React errors.
Zero TypeError exceptions.
Spurious unauthenticated /csrf 401 eliminated.
Expected 400/409 codes cleanly captured and handled by user-facing toasts for invalid flags and duplicate solves.
```

---

## 12. Network Errors Before vs After

### Before Fix:
- `/api/v1/auth/csrf` returned 401 on every unauthenticated page load.
- CORS preflight errors occurred on LAN origins (`10.x.x.x`).

### After Fix:
- Zero unexpected 4xx/5xx network errors.
- CORS preflight OPTIONS requests return `204 No Content` with authorized LAN origin headers.

---

## 13. Backend Log Findings

During the entire E2E browser run, backend container logs (`techx_ctf_backend`) showed:
- `✓ GET /api/v1/auth/me 200 OK`
- `✓ GET /api/v1/challenges 200 OK`
- `✓ POST /api/v1/submissions/flag 200 OK` (correct flag: `Portal of Secrets` solved)
- `✓ POST /api/v1/submissions/flag 409 Conflict` (authoritative duplicate submission rejection)
- `✓ GET /api/v1/leaderboard 200 OK`
- `✓ GET /api/v1/leaderboard/stream 200 OK` (SSE connection open and streaming)
- `✓ GET /api/v1/admin/teams 403 Forbidden` for participant actor; `200 OK` for admin actor
- Zero unhandled database or Redis exceptions.

---

## 14. Automated Test Results

- **Backend Test Suite**:
  - `58` test files passed (`448 / 448` tests passed).
- **Frontend Test Suite**:
  - `11` test files passed (`47 / 47` tests passed).
  - Includes newly added `category_helpers.test.ts`.
- **Browser E2E Automated Suite**:
  - `16 / 16` workflows passed (`100%`).

---

## 15. Build Results

- Frontend production build completed cleanly with Vite & TypeScript:
  ```
  > techx-ctf-frontend@1.0.0 build
  > tsc && vite build
  ✓ 69 modules transformed.
  dist/index.html                   0.64 kB │ gzip:  0.40 kB
  dist/assets/index-DCKL_hbz.css    4.41 kB │ gzip:  1.56 kB
  dist/assets/index-DkQvNcrX.js   258.46 kB │ gzip: 73.42 kB
  ✓ built in 951ms
  ```
- NGINX production Docker image rebuilt and deployed via:
  ```cmd
  docker compose -f docker-compose.yml -f docker-compose.lan.yml up -d --build nginx
  ```
  Status: `techx_ctf_nginx` Healthy, serving on port 80.

---

## 16. Security Verification

- **Authentication**: Strict HttpOnly, SameSite=Lax JWT cookies preserved.
- **RBAC**: Backend authorization checks remain strictly authoritative; participants are blocked from `/api/v1/admin/*` with 403 Forbidden.
- **CSRF**: Double-submit cookie with cryptographic validation preserved for all state-mutating requests.
- **CORS**: Origin validation restricted to loopback and private RFC 1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) in LAN mode; wildcard with credentials remains strictly disallowed.
- **Test Account Safety**: Only accounts matching designated test prefixes can be deleted via test cleanup tools.

---

## 17. Remaining Issues

- None. All reported and discovered issues have been resolved, verified in a real browser, and committed.

---

## 18. Final Status

- **VERIFIED & OPERATIONAL**.
- All acceptance criteria satisfied.

---

## 19. Final Commit Hash

`962b8215b6581728a44a452bdd06129eb028d1b4`
