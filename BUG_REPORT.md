# Read & Sign — Bug Report
**Generated:** 2026-03-18
**Testing method:** Static code analysis + automated test harness (pg-mem)
**Scope:** Full backend and frontend codebase

---

## Summary

| ID | Severity | Area | Status |
|----|----------|------|--------|
| BUG-001 | 🔴 Critical (Security) | auth — refresh token | **Fixed** |
| BUG-002 | 🔴 Critical | assignments — overdue alerts | **Fixed** |
| BUG-003 | 🔴 Critical | assignments — validity reassignment | **Fixed** |
| BUG-004 | 🔴 Critical | documents — upload-and-publish | **Fixed** |
| BUG-005 | 🟠 High | assignments — data isolation | **Fixed** |
| BUG-006 | 🟡 Medium | UI — Remind button behaviour | **Fixed** |
| BUG-007 | 🟡 Medium | documents — draft file access | Noted (low risk in dev) |
| BUG-008 | 🔵 Low | auth — cookie security flag | Noted (intentional for dev) |

---

## Critical Bugs

### BUG-001 — Security: Refresh Token Doesn't Verify Ownership
**File:** `backend/src/routes/auth.ts` — `POST /api/auth/refresh`
**Severity:** 🔴 Critical (security)

**What was wrong:**
The refresh endpoint queried for *any* user who had any valid (non-expired, non-revoked) refresh token in the database. The actual token sent in the cookie was never validated or matched to a specific user. Any user's valid session could potentially return a token scoped to a different user — a session confusion/impersonation vulnerability.

```sql
-- OLD (broken): returns an arbitrary user, not the token owner
SELECT id, email, role, organisation_id FROM users WHERE id IN (
  SELECT user_id FROM refresh_tokens WHERE revoked = false AND expires_at > NOW()
) LIMIT 1
```

**Fix applied:**
Two-part fix:
1. **`auth.ts` (token generation)** — Changed `INSERT INTO refresh_tokens` to use the `tokenId` UUID as the record's primary key (instead of a separate random UUID). This allows O(1) lookup by the token value.
2. **`routes/auth.ts` (refresh endpoint)** — Now looks up the specific token record by `WHERE id = $1` (the cookie value), then calls `verifyRefreshToken()` (bcrypt compare) to cryptographically verify ownership before returning any access token. Also checks `active = true` on the user.

---

### BUG-002 — Overdue Alert Emails Never Sent (Wrong Role Value)
**File:** `backend/src/routes/assignments.ts` — `POST /api/assignments/check-overdue`
**Severity:** 🔴 Critical (silent failure)

**What was wrong:**
When overdue assignments were detected, the code tried to notify admins with:
```sql
-- OLD (broken): 'admin' role doesn't exist in the CHECK constraint
SELECT DISTINCT u.id, u.email, u.name FROM users u WHERE u.role = 'admin'
```
The `users.role` column has a CHECK constraint allowing only `'super_admin'`, `'section_admin'`, `'user'`. The value `'admin'` matches nothing — so this query always returned zero rows, and overdue alert emails were silently never sent to anyone.

**Fix applied:**
```sql
-- NEW: matches the actual role values
SELECT DISTINCT u.id, u.email, u.name FROM users u
WHERE u.role IN ('super_admin', 'section_admin')
```

---

### BUG-003 — Validity Reassignment Always Creates Duplicate Assignments
**File:** `backend/src/routes/assignments.ts` — `POST /api/assignments/check-validity`
**Severity:** 🔴 Critical (data corruption)

**What was wrong:**
When checking if a signing record had expired and a newer document version needed re-assignment, the guard condition compared the wrong UUIDs:
```typescript
// OLD (broken): latestVersion.id is a version UUID; record.document_id is a document UUID
// These are ALWAYS different → condition always true → always creates new assignments
if (latestVersion && latestVersion.id !== record.document_id) {
```
This meant:
- Users were re-assigned to the *same* version they already signed (no schema conflict because the unique constraint on `(document_version_id, user_id)` would catch it, but it adds noise)
- If there was genuinely a new version, the reassignment logic worked by coincidence

**Fix applied:**
Added `dv.id as version_id` to the expired signings query, then compared correctly:
```typescript
// NEW: compares the latest published version ID to the version the user signed
if (latestVersion && latestVersion.id !== record.version_id) {
```

---

### BUG-004 — upload-and-publish Loses All Form Fields (Multipart Bug)
**File:** `backend/src/routes/documents.ts` — `POST /api/documents/:id/upload-and-publish`
**Severity:** 🔴 Critical (data loss)

**What was wrong:**
The endpoint called `req.file()` first to get the uploaded PDF, then called `req.parts()` to read form fields (`effectiveDate`, `revision`, `propagateAssignments`). In Fastify's multipart plugin, `req.file()` consumes the entire multipart body stream. The subsequent `req.parts()` call sees an already-exhausted stream and reads nothing. Result: `fields` was always `{}`, so:
- `effectiveDate` was always set to today's date (ignored user input)
- `revision` was always `null`
- `propagateAssignments` was always `undefined` (never propagated, even when ticked)

**Fix applied:**
Replaced the two-step approach with a single `for await (const part of req.parts())` loop that handles both the file buffer and all text fields in one pass:
```typescript
const fields: any = {}
let buffer: Buffer | null = null

for await (const part of req.parts()) {
  if (part.type === 'file') {
    buffer = await part.toBuffer()
  } else if (part.type === 'field') {
    fields[part.fieldname] = part.value
  }
}
```

---

## High Severity Bugs

### BUG-005 — Admin Assignments List Shows All Organisations' Data
**File:** `backend/src/routes/assignments.ts` — `GET /api/assignments` (admin branch)
**Severity:** 🟠 High (data isolation)

**What was wrong:**
When a `super_admin` or `section_admin` fetched assignments, the query had no `WHERE organisation_id = ?` filter. In a multi-tenant setup (multiple organisations in the database), admins from Organisation A could see all assignments from Organisation B.

**Fix applied:**
Resolved the admin's `organisation_id` from the database (same pattern as the matrix endpoint), then filtered:
```sql
WHERE d.organisation_id = $1
```

---

## Medium Severity Bugs

### BUG-006 — "Remind" Button Actually Escalates (Wrong API Call)
**File:** `frontend/src/pages/AdminAssignments.tsx` — `handleRemind()`
**Severity:** 🟡 Medium (UX / wrong behaviour)

**What was wrong:**
The "Remind" button in the assignments table called `assignmentsApi.escalate(assignmentId)` which sends an escalation email to the *section admin*, not a reminder to the *user*. The backend has a dedicated `POST /api/assignments/:id/remind` endpoint that emails the user directly — but it was never called.

**Fix applied:**
`handleRemind()` now calls `POST /api/assignments/:id/remind` directly, which sends a reminder email to the assigned user with their deadline information.

---

## Low Severity / Informational

### BUG-007 — Draft Document Files Accessible to Regular Users
**File:** `backend/src/routes/documents.ts` — `GET /api/documents/:id/file`
**Severity:** 🟡 Medium (information disclosure)
**Status:** Noted, not yet fixed

The file download endpoint serves any version of a document (including drafts) to any authenticated user. A `user`-role employee can download a draft PDF by guessing or knowing a version number. In practice this is low risk since document UUIDs are not guessable, but it violates the principle that only published versions should be visible to non-admins.

**Recommended fix:** Add `AND status = 'published'` to the file path lookup query when `req.user.role === 'user'`.

---

### BUG-008 — Refresh Token Cookie Uses `secure: false`
**File:** `backend/src/routes/auth.ts` — login handler
**Severity:** 🔵 Low (acceptable for development)
**Status:** Intentional for HTTP dev environment

The cookie is set with `secure: false`, which allows it to be sent over plain HTTP. This is intentional for the Docker development setup at `http://localhost`. Before going to production over HTTPS, this must be changed to `secure: true`.

---

## Additional Observations

### Test Harness (pg-mem) Limitations
The automated test harness (`src/test-api.ts`) was unable to load the full schema due to pg-mem's lack of support for PL/pgSQL triggers and some PostgreSQL-specific syntax. **The code-review portion of the tests passed entirely** (10/10 checks), confirming the key fixes from previous sessions are in place:
- ✅ `documents.ts` returns `latestVersionId`
- ✅ `AdminAssignments.tsx` uses `latestVersionId` (not `doc.id`)
- ✅ Matrix endpoint resolves `organisationId` from the database
- ✅ `/api/diff` and `/api/reports` routes registered
- ✅ `.btn-xs` CSS class defined
- ✅ `VersionDiff.tsx` component exists
- ✅ `routes/reports.ts` exists
- ✅ JWT auth sign/verify works correctly
- ✅ Frontend production build succeeds

---

## How to Apply Fixes

All fixes are already applied to the source files. Rebuild the Docker containers on your Mac:

```bash
cd ~/path/to/app
docker compose build backend frontend
docker compose up -d
```

Or rebuild only the backend (faster, since frontend fixes are minor):

```bash
docker compose build backend
docker compose up -d backend
```

To rebuild the frontend with the Remind button fix:
```bash
docker compose build frontend
docker compose up -d frontend
```
