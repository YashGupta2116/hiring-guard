# Design.md — VeriTrust Backend (API Design)

> For the backend, "design" means the **contract**: URL conventions, response envelopes, error codes,
> endpoint catalogue, and realtime events. The visual design system (colours, fonts, theme) will be
> added to this file when frontend work starts.

---

## 1. Conventions

| Topic | Rule |
|---|---|
| Base path | `/api/v1` (all REST). Internal: `/api/v1/internal`. Webhooks: `/api/v1/webhooks` |
| Resource names | plural, kebab-case: `/sessions`, `/coding-tasks`, `/question-bank` |
| Actions that are not CRUD | `POST /resource/:id/<verb>`: `/sessions/:id/start`, `/flags/:id/adjudicate` |
| JSON field names | `camelCase` (same as Prisma model fields) |
| Enums | `UPPER_SNAKE` strings exactly as in `schema.prisma` |
| IDs | strings. Sessions `ses_<ulid>`. `BigInt` IDs are serialised as strings |
| Timestamps | ISO 8601 UTC strings with milliseconds: `2026-09-17T11:43:10.123Z` |
| Media offsets | integer milliseconds from recording start: `mediaOffsetMs` |
| Durations | explicit unit suffix: `durationMinutes`, `timeLimitMs`, `retentionDays` |
| Nullable | send `null`, never omit a documented field |
| Auth header | `Authorization: Bearer <token>` |
| Refresh token | httpOnly, `Secure`, `SameSite=Strict` cookie `vt_rt`, path `/api/v1/auth` |
| Request ID | server returns `X-Request-Id`; client may send one |
| Idempotency | `POST /sessions`, `/links`, `/start`, `/end` accept optional `Idempotency-Key` header |

### 1.1 HTTP status usage

| Status | When |
|---|---|
| 200 | read, update, action with a result |
| 201 | resource created |
| 202 | accepted for background work (JD upload, reparse, recompute) |
| 204 | delete / logout with no body |
| 400 | validation failed |
| 401 | missing/invalid/expired credentials |
| 403 | authenticated but not allowed |
| 404 | not found **or** not in your org (never reveal existence across orgs) |
| 409 | conflict / invalid state transition |
| 410 | join link expired, consumed or revoked |
| 413 / 415 | file too large / wrong type |
| 429 | rate limited (`Retry-After` header) |
| 500 / 503 | internal / dependency unavailable |

---

## 2. Response envelopes

### 2.1 Success

```json
{ "data": { "id": "ses_01J8Z6...", "status": "DRAFT" } }
```

List:

```json
{
  "data": [ { "id": "ses_01J8Z6..." } ],
  "meta": { "nextCursor": "ses_01J8Z5...", "limit": 20 }
}
```

Pagination is cursor-based: `?limit=20&cursor=<id>`. Default 20, max 100.

### 2.2 Error

```json
{
  "error": {
    "code": "INVALID_STATE_TRANSITION",
    "message": "Session must be ADMITTED to start.",
    "details": { "currentStatus": "ARMED" },
    "requestId": "01J8Z7..."
  }
}
```

Validation errors:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed.",
    "details": { "fields": [ { "path": "body.durationMinutes", "message": "Must be between 15 and 240" } ] },
    "requestId": "01J8Z7..."
  }
}
```

---

## 3. Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 400 | body/query/params invalid |
| `UNAUTHENTICATED` | 401 | no/invalid/expired token |
| `INVALID_CREDENTIALS` | 401 | wrong email/password |
| `REFRESH_TOKEN_REUSED` | 401 | rotated refresh token reused; family revoked |
| `FORBIDDEN` | 403 | role or binding insufficient |
| `NOT_FOUND` | 404 | resource missing or other org |
| `CONFLICT` | 409 | unique constraint (e.g. email exists) |
| `INVALID_STATE_TRANSITION` | 409 | session not in a status that allows this |
| `RECONSENT_REQUIRED` | 409 | channels added after consent |
| `MEDIA_NOT_READY` | 409 | start before tracks verified |
| `PREFLIGHT_REQUIRED` | 409 | consent before a passing preflight |
| `POLICY_CHANGED` | 409 | consent `policyHash` no longer matches config |
| `TASK_FROZEN` | 409 | edit/run after submit |
| `LAST_OWNER` | 409 | cannot remove/demote last org owner |
| `LINK_EXPIRED` | 410 | join link outside window |
| `LINK_CONSUMED` | 410 | one-time link already used |
| `LINK_REVOKED` | 410 | join link revoked |
| `INTERVIEW_NOT_OPEN` | 403 | join window not open yet (preflight/policy/consent, or starting the live room); `details.opensAt` |
| `PAYLOAD_TOO_LARGE` | 413 | file over 10 MB |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | not PDF/DOCX/text |
| `RATE_LIMITED` | 429 | too many requests |
| `DEPENDENCY_UNAVAILABLE` | 503 | db/redis/media/sandbox down |
| `INTERNAL` | 500 | anything else |

---

## 4. REST endpoint catalogue

Auth column: **P** public · **U** user access token · **J** join token · **C** candidate token · **S** service token · **W** webhook signature.
Roles: `O` owner, `A` admin, `I` interviewer (bound to session), `R` reviewer.

### 4.1 System
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | P | `{ status: "ok" }` |
| GET | `/ready` | P | `{ db: "ok", redis: "ok" }`, 503 if any fails |

### 4.2 Auth
| Method | Path | Auth | Body → Response |
|---|---|---|---|
| POST | `/auth/register` | P | `{ name, email, password, orgName }` → 201 `{ user, org, accessToken }` + cookie |
| POST | `/auth/login` | P | `{ email, password }` → `{ user, activeOrgId, accessToken }` + cookie |
| POST | `/auth/refresh` | cookie | → `{ accessToken }` + rotated cookie |
| POST | `/auth/logout` | cookie | → 204 |
| GET | `/auth/me` | U | → `{ user, memberships: [{ orgId, orgName, role }], activeOrgId }` |
| POST | `/auth/switch-org` | U | `{ orgId }` → `{ accessToken }` |

Password: 10–128 chars.

### 4.3 Organisation
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/org` | U | active org |
| PATCH | `/org` | U (O,A) | `{ name }` |
| GET | `/org/members` | U | list |
| POST | `/org/members` | U (O,A) | `{ email, role }` (existing user) |
| PATCH | `/org/members/:memberId` | U (O,A) | `{ role }` |
| DELETE | `/org/members/:memberId` | U (O,A) | 204 |
| GET | `/candidates` | U | `?q=` search by email/name |
| POST | `/candidates` | U | `{ email, name? }` |
| GET | `/candidates/:id` | U | with session history |

### 4.4 Sessions
| Method | Path | Auth | Body → Response |
|---|---|---|---|
| POST | `/sessions` | U | `{ mode, title?, candidateEmail?, candidateName?, scheduledAt?, durationMinutes }` → 201 session |
| GET | `/sessions` | U | `?status=&from=&to=&limit=&cursor=` |
| GET | `/sessions/:id` | U (I,O,A,R) | full session incl. config, interviewers, jd status, links summary |
| PATCH | `/sessions/:id` | U (I,O,A) | basic fields; DRAFT/CONFIGURED/ARMED |
| POST | `/sessions/:id/cancel` | U (I,O,A) | → ABORTED; pre-LIVE only |
| POST | `/sessions/:id/interviewers` | U (I,O,A) | `{ userId }` |
| DELETE | `/sessions/:id/interviewers/:userId` | U (I,O,A) | cannot remove primary |

Session object:
```json
{
  "id": "ses_01J8Z6...", "orgId": "...", "mode": "SCHEDULED", "status": "CONFIGURED",
  "title": "Backend Engineer - Round 1",
  "candidate": { "id": "...", "email": "a@b.com", "name": "Asha" },
  "scheduledAt": "2026-09-20T09:00:00.000Z", "durationMinutes": 60,
  "config": {
    "interviewType": "CODING", "difficulty": "MEDIUM",
    "recordVideo": false, "recordAudio": false, "recordScreen": false,
    "recordingAvailable": false,
    "channels": ["FOCUS", "PASTE", "RHYTHM", "POINTER", "ENVIRONMENT"],
    "sensitivity": "STANDARD", "topicBudgets": { "APIs": 900 },
    "configVersion": 3, "needsReconsent": false
  },
  "interviewers": [ { "userId": "...", "name": "Yash", "isPrimary": true } ],
  "jdStatus": "PARSED",
  "tasks": [ { "sessionTaskId": "...", "taskId": "...", "title": "LRU cache", "position": 0 } ],
  "startedAt": null, "endedAt": null, "createdAt": "..."
}
```

### 4.5 Job description
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/sessions/:id/jd` | U (I,O,A) | `multipart/form-data` field `file` **or** JSON `{ text }` → 202 `{ jdId, parseStatus: "PENDING" }` |
| GET | `/sessions/:id/jd` | U | `{ sourceType, fileName, parseStatus, parseError, parsed, edited, parsedAt }` |
| PATCH | `/sessions/:id/jd` | U (I,O,A) | `{ parsed }` → sets `edited: true` |
| POST | `/sessions/:id/jd/reparse` | U (I,O,A) | → 202 |

`ParsedJD`:
```json
{
  "role": "Backend Engineer",
  "seniority": "MID",
  "skills": [ { "name": "Node.js", "weight": 0.3 }, { "name": "PostgreSQL", "weight": 0.2 } ],
  "topics": [ { "name": "API design", "skills": ["Node.js"], "budgetSeconds": 900 } ],
  "summary": "..."
}
```

### 4.6 Configuration, tasks, question bank
| Method | Path | Auth | Notes |
|---|---|---|---|
| PATCH | `/sessions/:id/config` | U (I,O,A) | any subset of `config` fields + `taskIds[]`; DRAFT→CONFIGURED |
| GET | `/coding-tasks` | U | list (no `hiddenTests`) |
| POST | `/coding-tasks` | U (O,A) | `{ title, statement, difficulty, languages, starterCode, visibleTests, hiddenTests, timeLimitMs }` |
| GET/PATCH/DELETE | `/coding-tasks/:id` | U (O,A for write) | |
| GET | `/question-bank` | U | `?topic=&difficulty=` |
| POST | `/question-bank` | U (O,A) | `{ text, topic, skills, difficulty }` |
| PATCH/DELETE | `/question-bank/:id` | U (O,A) | |

Test case shape: `{ "input": "...", "expectedOutput": "..." }`.

### 4.7 Links
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/sessions/:id/links` | U (I,O,A) | `{ kind, validFrom?, expiresAt, sendInvite?: boolean }` → 201 `{ linkId, url, kind, expiresAt }`; CONFIGURED→ARMED (also allowed from ARMED to replace a revoked link) |
| GET | `/sessions/:id/links` | U | list (no token strings after creation, only ids/state) |
| POST | `/sessions/:id/links/:linkId/revoke` | U (I,O,A) | |

`url` = `${APP_URL}/join/<joinJwt>`. The raw JWT is returned **only** in the create response.

### 4.8 Candidate join (public, join token in path)
| Method | Path | Auth | Body → Response |
|---|---|---|---|
| GET | `/join/:token` | J | `{ sessionTitle, orgName, interviewerNames, scheduledAt, durationMinutes, status: "READY" \| "NOT_YET_OPEN", opensAt: ISO \| null }`. `opensAt` = start minus 15 min (or link `notBefore` if later) |
| POST | `/join/:token/preflight` | J | probe (below) → `{ preflightId, passed, failures: [{code, message}], warnings: [{code, message}] }` |
| GET | `/join/:token/policy` | J | `{ bullets: string[], retentionDays, viewers: string, policyHash }` |
| POST | `/join/:token/consent` | J | `{ preflightId, policyHash, accepted, scrolledToEnd: true }` → accepted: `{ candidateToken, media: { url, token } }` · declined: `{ ended: true }` |

Preflight probe:
```json
{
  "webrtc": true, "getDisplayMedia": true,
  "camera": "granted | prompt | denied | unavailable",
  "microphone": "granted | prompt | denied | unavailable",
  "screenCount": 1, "isExtended": false,
  "downlinkMbps": 12.5, "hardwareConcurrency": 8,
  "userAgent": "..."
}
```
Blocking failure codes: `NO_WEBRTC`, `NO_SCREEN_CAPTURE`, `NO_CAMERA`, `LOW_DOWNLINK`. Warning codes: `EXTENDED_DISPLAY`, `LOW_CPU`.
Policy bullets are **plain-language sentences**, not channel enum names (no machine-readable channel list).

### 4.9 Candidate (candidate token)
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/candidate/session` | C | `{ status, title, startedAt, durationMinutes, hasCodingRound }` |
| POST | `/candidate/media-ready` | C | `{ tracks: { camera, microphone, screen } }` (claimed) → server verifies → `{ ready: true }` or 409 `MEDIA_NOT_READY` |
| GET | `/candidate/tasks` | C | `[{ taskId, title, statement, languages, starterCode, visibleTests, frozen }]` |
| POST | `/candidate/tasks/:taskId/run` | C | `{ language, code }` → `{ executionId, status, results: [{ index, passed, actualOutput, expectedOutput }], stdout, stderr, durationMs }` |
| POST | `/candidate/tasks/:taskId/submit` | C | `{ language, code }` → `{ submitted: true, visibleResults }` (no hidden data) |

### 4.10 Lifecycle and live (interviewer)
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/sessions/:id/start` | U (I) | ADMITTED→LIVE → `{ status, startedAt, calibrationEndsAt }` |
| POST | `/sessions/:id/end` | U (I) | LIVE→SEALING → `{ status }` |
| GET | `/sessions/:id/live` | U (I,O,A) | hydrate: `{ status, timer, integrity, flags[], transcriptTail[], suggestions[], notes[], degraded[], lastFrameSeq }` |
| GET | `/sessions/:id/flags` | U | `?status=&severity=` |
| POST | `/flags/:flagId/adjudicate` | U (I,O,A,R) | `{ action: "CONFIRM"\|"DISMISS"\|"DOWNGRADE", toSeverity?, reason }` |
| GET | `/sessions/:id/notes` | U | |
| POST | `/sessions/:id/notes` | U (I) | `{ body }` → note with `ts`, `mediaOffsetMs` |
| POST | `/sessions/:id/suggestions/refresh` | U (I) | → 202, result via `qs.suggestions` |
| POST | `/sessions/:id/suggestions/:suggestionId/accept` | U (I) | |
| GET | `/sessions/:id/transcript` | U | `?final=true` |
| GET | `/sessions/:id/code` | U | tasks with snapshots, executions (incl. hidden results) |

Flag object (interviewer only):
```json
{
  "id": "...", "type": "SECOND_VOICE", "channel": "AUDIO",
  "corroboratingChannels": ["GAZE"], "severity": "MEDIUM", "status": "OPEN",
  "origin": "LIVE", "narrative": "A second voice was detected for 14 s while the candidate was answering.",
  "startTs": "...", "endTs": "...", "mediaOffsetMs": 734000, "scoreDelta": 6.4,
  "mergedCount": 2, "supersededByReview": false,
  "warning": { "tier": "WARNING", "shownAt": "...", "acknowledgedAt": "...", "ackLatencyMs": 2300 },
  "adjudications": []
}
```

### 4.11 Evidence and reports
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/sessions/:id/evidence/verify` | U (O,A,R,I) | `{ valid, chainValid, signatureValid, lastSeq, chainHead, firstBrokenSeq, verifiedAt }` |
| GET | `/sessions/:id/report` | U | report JSON (scores, sections, methodology, `degraded`, `lostSteps`) |
| GET | `/reports/:reportId/html` | U | `text/html` |
| GET | `/reports/:reportId/pdf` | U | `application/pdf`, 404 if disabled |
| POST | `/sessions/:id/report/recompute` | U (O,A,R,I) | → 202 |
| GET | `/sessions/:id/audit` | U (O,A) | paginated |
| GET | `/sessions/:id/pipeline` | U | run + step statuses |

Report score block:
```json
{
  "technical": 78.5, "communication": 71.0, "integrity": 88.2,
  "composite": 77.1, "reviewRequired": false,
  "flagCounts": { "LOW": 2, "MEDIUM": 1, "HIGH": 0 }
}
```
When integrity < 70: `"composite": null, "reviewRequired": true`.

### 4.12 Internal (producers) and webhooks
| Method | Path | Auth | Body |
|---|---|---|---|
| POST | `/internal/sessions/:id/observations` | S | `{ producer: "cv"\|"asr", items: [{ channel, type, ts, strength, payload }] }` |
| POST | `/internal/sessions/:id/transcript` | S | `{ segments: [{ speaker, speakerLabel, text, startMs, endMs, isFinal, words? }] }` |
| POST | `/internal/sessions/:id/heartbeat` | S | `{ producer, channels: [], status: "OK"\|"DEGRADED" }` |
| POST | `/webhooks/livekit` | W | LiveKit events (track published/unpublished, egress ended) |

Producers send `strength` only. The backend assigns LLR.

---

## 5. Realtime (Socket.IO)

### 5.1 Connection

| Namespace | Auth (`socket.handshake.auth`) | Join |
|---|---|---|
| `/interviewer` | `{ token: <accessJwt> }` | client emits `session.join { sessionId, lastFrameSeq? }` → server checks access, joins room `session:{sid}`, replays buffer after `lastFrameSeq` |
| `/candidate` | `{ token: <candidateJwt> }` | auto-joined to its session room on connect |

Every **server → interviewer** frame is wrapped:
```json
{ "frameSeq": 1042, "sessionId": "ses_...", "ts": "2026-09-17T11:43:10.123Z", "data": { } }
```

Client → server events use Socket.IO acknowledgements: `ack({ ok: true })` or `ack({ ok: false, error: { code, message } })`.

### 5.2 Server → interviewer

| Event | Payload `data` | Frequency |
|---|---|---|
| `session.state` | `{ status, startedAt, endedAt, endReason }` | on transition |
| `jd.parsed` | `{ parseStatus, parsed, parseError }` | once per parse |
| `candidate.presence` | `{ connected, since, graceEndsAt }` | on change |
| `media.state` | `{ camera, microphone, screen }` each `"LIVE"\|"LOST"\|"GRACE"` | on change |
| `timer.tick` | `{ elapsedMs, remainingMs, frozen, currentTopic, topics: [{ name, budgetSeconds, usedSeconds }] }` | 1 s |
| `integrity.tick` | `{ score, calibrating, channels: [{ channel, contribution, scored }] }` | 2 s |
| `flag.new` | flag object (§4.10) | on emit |
| `flag.update` | flag object | on merge / ack / adjudication / supersede |
| `warn.issued` | `{ warningId, flagId, type, tier, message, shownAt }` | on warning |
| `transcript.partial` | `{ segmentId, speaker, text, startMs }` | ≈300 ms |
| `transcript.final` | `{ segmentId, speaker, text, startMs, endMs }` | turn end |
| `qs.suggestions` | `{ batchId, source, coverage: [{ topic, covered }], items: [{ id, rank, text, rationale, topic }] }` | on trigger |
| `note.added` | note object | on add (for co-interviewers) |
| `system.degraded` | `{ producer, channels, since }` / `{ producer, recoveredAt }` | on change |
| `report.ready` | `{ reportId, degraded }` | once |

### 5.3 Interviewer → server

| Event | Payload | Ack |
|---|---|---|
| `session.join` | `{ sessionId, lastFrameSeq? }` | `{ ok, replayed }` |
| `note.add` | `{ body }` | `{ ok, note }` |
| `qs.accept` | `{ suggestionId }` | `{ ok }` |
| `qs.refresh` | `{}` | `{ ok }` |
| `topic.set` | `{ topic }` | `{ ok }` |

(Adjudication stays REST so it is audited through one path.)

### 5.4 Candidate → server

| Event | Payload | Notes |
|---|---|---|
| `clock.sync` | `{ clientSentAt }` | ack `{ serverReceivedAt, serverSentAt }`; client does 3 rounds and sends `clock.offset` |
| `clock.offset` | `{ offsetMs, rttMs }` | stored per connection |
| `tel.batch` | `{ connId, seq, sentAt, events: TelemetryEvent[] }` | every 250 ms; critical events sent immediately as their own batch |
| `editor.delta` | `{ taskId, seq, changes: [{ changeType, rangeOffset, insertedChars, deletedChars, text, ts, keyIntervalsMs? }] }` | every 500 ms |
| `editor.snapshot` | `{ taskId, language, content, reason: "INTERVAL" }` | every 30 s |
| `warn.ack` | `{ warningId, ackedAt }` | |

`TelemetryEvent` (discriminated by `kind`):
```ts
type TelemetryEvent =
  | { kind: "visibility"; state: "visible" | "hidden"; ts: number }
  | { kind: "focus"; state: "focus" | "blur"; ts: number }
  | { kind: "pointer"; state: "leave" | "enter" | "idle"; durationMs?: number; ts: number }
  | { kind: "clipboard"; action: "paste" | "copy"; length: number; target: "editor" | "other"; ts: number }
  | { kind: "screen"; screenCount: number; isExtended: boolean; ts: number }
  | { kind: "device"; change: "added" | "removed"; deviceKind: "audioinput" | "videoinput"; ts: number }
  | { kind: "network"; online: boolean; effectiveType?: string; downlinkMbps?: number; ts: number }
  | { kind: "raf_gap"; gapMs: number; ts: number }
  | { kind: "keystroke_stats"; windowMs: number; histogram: number[]; variance: number;
      digraphVariance: number; backspaceRatio: number; bursts: number; ts: number };
```
Never actual key identities.

### 5.5 Server → candidate (allow-list only)

| Event | Payload |
|---|---|
| `session.state` | `{ status: "WAITING" \| "LIVE" \| "ENDED" }` (mapped, not raw status) |
| `time.remaining` | `{ remainingMs }` every 5 s |
| `warn.show` | `{ warningId, tier: "NOTICE" \| "WARNING" \| "INTERRUPT", message, displayMs? }` |
| `task.frozen` | `{ taskId }` |
| `media.required` | `{ track: "camera" \| "screen", message }` (e.g. screen share stopped) |
| `session.ended` | `{ message: "Thank you for completing your interview." }` — identical for everyone |

Nothing else is ever emitted on `/candidate`.

---

## 6. Warning templates (candidate-facing)

| Type | Tier 1 / 2 message |
|---|---|
| `FOCUS_LOSS` | "The interview window lost focus. Please keep this window active for the rest of the interview." |
| `PASTE_LARGE` | "A large paste into the editor was detected. Please type your solution during the interview." |
| `SECOND_VOICE` | "Multiple voices detected. Please ensure you are alone for the rest of the interview." |
| `FACE_ABSENT` | "Your face is not visible to the camera. Please stay in view." |
| `MULTIPLE_FACES` | "More than one person is visible. Please ensure you are alone." |
| `GAZE_AWAY` | "You appear to be looking away from the screen frequently. Please keep your attention on the interview." |
| `SCREEN_SHARE_STOPPED` | "Screen sharing has stopped. Please share your entire screen to continue." |
| `DEVICE_CHANGE` | "A new audio or video device was connected. Please use only the devices you started with." |
| `TYPING_BURST` | "Very fast text entry was detected in the editor. Please type your solution yourself." |

Tier 3 (`INTERRUPT`) uses the same sentence plus: "Please confirm to continue."
