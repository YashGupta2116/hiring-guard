# PRD.md — VeriTrust Backend

> Scope of this document: **backend only** (Express + TypeScript + Prisma/PostgreSQL).
> Frontend (Next.js) and ML services (computer vision, speech) are out of scope here.
> Source material: the three VeriTrust workflow/data-flow diagram packs (spec sections 5 to 11).

---

## 1. Product summary

VeriTrust is an **interview integrity platform**. An interviewer sets up a technical interview from a job
description, invites a candidate, runs the interview on a live dashboard, and afterwards receives a
**defensible report**. The report covers technical performance, communication, and interview integrity,
and every claim in it links to evidence.

Two things make VeriTrust different from "proctoring software":

1. **Fairness contract.** The candidate is told, in neutral language, every time a signal crosses a
   threshold. They are never accused, never shown a score, and never penalised for connection drops.
2. **Evidence you can defend.** Every observation is hash-chained and the chain head is signed when the
   session ends. Every flag jumps to its exact moment in the recording. Nothing is silently deleted.

The backend is the **single source of truth** for session state, evidence, scoring and reports.

---

## 2. Users

| User | Has an account? | What they do in the backend |
|---|---|---|
| **Org owner / admin** | Yes | Manages the organisation, members, coding task bank, question bank |
| **Interviewer** | Yes | Creates sessions, uploads JDs, configures monitoring, sends links, runs the live dashboard, writes notes, adjudicates flags |
| **Reviewer** | Yes | Reads reports, confirms/dismisses/downgrades flags after the session |
| **Candidate** | **No** | Joins with a signed link, passes device checks, gives consent, is monitored, solves coding tasks |
| **External producers** | Service token | Future CV and ASR services that push observations and transcript segments into the backend |

---

## 3. Goals

- G1. An interviewer can go from "new session" to "link sent" in under 3 minutes.
- G2. The live dashboard receives flags, integrity ticks and transcript updates in near real time
  (target under 1 s from event to dashboard).
- G3. Every flag in a report is backed by stored observations, a media offset, and an audit trail.
- G4. A report is always delivered, even if part of post-processing fails (degraded, clearly labelled).
- G5. The candidate never receives scores, flag details, thresholds or hidden test output.

## 4. Non-goals (for this phase)

- Building computer vision or speech models. The backend exposes **ingest endpoints** so these can be
  plugged in later; until then those channels are simply unscored.
- Using AWS-specific services (Step Functions, SQS, EventBridge, KMS). Equivalents are built with
  Node libraries behind interfaces so AWS can be swapped in later.
- Go. The spec's Go gateway is implemented in Express.
- Billing, SSO, multi-region.

---

## 5. Functional requirements

IDs are referenced in `Phases.md` and `Memory.md`.

### 5.1 Accounts and organisations
- **FR-AUTH-1** Register with email + password; creates a user and a new organisation with the user as OWNER.
- **FR-AUTH-2** Log in, refresh, log out. Short-lived access token, rotating refresh token stored hashed.
- **FR-AUTH-3** Every authenticated request is scoped to one active organisation. Users can switch org.
- **FR-ORG-1** Owners/admins add existing users to the org with a role and change or remove roles.

### 5.2 Session setup (Workflow 01, steps 1 to 5)
- **FR-SES-1** Create a session in one of two modes: `SCHEDULED` (date, candidate email, duration) or
  `DIRECT_LINK` (instant, one-time or reusable). New sessions start in `DRAFT`. ID format `ses_<ulid>`.
- **FR-SES-2** Bind one or more interviewers to a session. The creator is the primary interviewer.
- **FR-JD-1** Provide a job description as pasted text, PDF or DOCX (10 MB cap). Upload returns `202`
  immediately and parsing runs in the background.
- **FR-JD-2** Parsing extracts text and produces a `ParsedJD` (role, seniority, weighted skills, topics,
  topic time budgets). When parsing finishes, the dashboard receives `jd.parsed`.
- **FR-JD-3** The interviewer can edit the parsed JD. Any edit sets `edited = true`, which the report shows.
- **FR-JD-4** A JD parse failure **never blocks** the interview. The interviewer falls back to manual skills.
- **FR-CFG-1** Configure interview type, difficulty, recording toggles, monitoring channels, sensitivity,
  and coding tasks. The server validates task IDs and org entitlement. A valid config moves `DRAFT → CONFIGURED`.
- **FR-CFG-2** Enabling a monitoring channel **after** the candidate consented sets `needsReconsent`. The
  session cannot go live until the candidate consents again.
- **FR-LINK-1** Arm the session by minting a signed join link (JWT with tracked `jti`). One-time or
  reusable, with a validity window. Moves `CONFIGURED → ARMED`.
- **FR-LINK-2** Scheduled mode sends an email invite with an `.ics` attachment. A scheduler handles the
  T-15 minute pre-start step and expires links that are never used.
- **FR-LINK-3** Links can be revoked.

### 5.3 Candidate join (Workflow 03, steps 1 to 5)
- **FR-JOIN-1** Token check on every join call: `jti` exists, not revoked, not consumed (one-time), inside window.
- **FR-JOIN-2** Preflight: the client submits a capability probe. The server returns pass, blocking
  failures (no WebRTC, no screen capture, no camera, downlink under 0.7 Mbps) and warnings. An extended
  display is a **warning with zero weight**, never a penalty.
- **FR-JOIN-3** Policy document is assembled from the **effective config**, so the consent text always
  matches what is actually enabled: one bullet per active channel, retention period, who can view.
- **FR-JOIN-4** Consent stores hashed IP, hashed user agent, the exact scope displayed, policy hash and config
  version. Accepting marks a one-time link consumed, issues a media token and a candidate realtime token,
  and moves the session to `ADMITTED`. Declining ends the session; no media or telemetry is ever stored.
- **FR-JOIN-5** `media.ready` is verified server-side against the media server (camera, mic and
  full-monitor screen tracks published). A client claiming ready without tracks is rejected.

### 5.4 Live session (Workflow 01 step 8, Data flows 01 and 03)
- **FR-LIVE-1** The interviewer presses Start: `ADMITTED → LIVE`. Requires media ready and no pending re-consent.
- **FR-LIVE-2** First 60 s after start is **calibration**: baselines are captured, no flags, no warnings.
- **FR-TEL-1** Candidate telemetry arrives in 250 ms batches with per-connection sequence numbers and clock
  offset. The server applies clock correction, sequence checks and deduplication.
- **FR-TEL-2** Offline-queued telemetry replayed with original timestamps is accepted. A gap that cannot be
  replayed becomes an **unscored window**, never evidence of evasion.
- **FR-DET-1** Rule-based detectors run in the backend: Focus (focus loss under 800 ms ignored),
  Paste, Rhythm (keystroke-interval distribution vs calibration baseline), Pointer, Environment
  (display count, device change, network).
- **FR-DET-2** Authorship detectors for the coding round: large paste into the editor, `typed_ratio`
  below 0.35 on a long solution, typing bursts sustained above 8 chars/s.
- **FR-DET-3** External producers (CV, ASR) push observations and transcript segments through an internal API.
  A missing producer heartbeat raises `system.degraded` and opens unscored windows for its channels.
- **FR-EVD-1** Every observation is persisted with a per-session `seq`, `prevHash` and `hash` (hash chain).
- **FR-FUS-1** A single-writer fusion engine per session converts observations to calibrated LLR, applies
  per-channel exponential decay, boosts corroborated evidence (independent channels within 6 s, up to
  2.35×), computes the integrity score, emits flags with an exact `scoreDelta`, merges repeats within 15 s,
  and opens unscored windows on signal loss.
- **FR-FUS-2** Negative evidence (clean behaviour) pushes the score back up. No disconnection ever lowers it.
- **FR-WARN-1** The warden chooses a warning tier (notice, warning, interrupt) from severity and occurrence
  count, with a 45 s cooldown per type and a hard cap of 6 warnings above tier 1. Wording is templated and
  neutral and states the observation and requirement, never the inference.
- **FR-WARN-2** Warning acknowledgement and acknowledgement latency are stored on the warning and linked flag.
- **FR-GRACE-1** Grace periods on signal loss: camera 15 s, screen 10 s, socket 120 s. Inside grace, the
  clock freezes and the channel is unscored.
- **FR-DASH-1** Dashboard realtime stream: `flag.new`, `flag.update`, `integrity.tick` (every 2 s, per-channel
  split), `timer.tick` (per-topic budget burn), `transcript.partial` / `transcript.final`, `qs.suggestions`,
  `system.degraded`. Integrity snapshots are persisted every 10 s.
- **FR-DASH-2** Reconnecting dashboards resume from the last received frame (buffer of last 2000 frames).
- **FR-ADJ-1** Interviewers confirm, dismiss or downgrade any flag with a free-text reason. Adjudications
  are stored, never overwrite the original flag, and dismissals are kept as future calibration data.
- **FR-NOTE-1** Timestamped private notes with media offset.
- **FR-QS-1** Question suggestions: 3 ranked questions with rationale, based on parsed JD, topic coverage
  and the last 3000 chars of transcript, 2.5 s cap, falling back to the org question bank. Accepted
  suggestions are recorded.

### 5.5 Coding round (Workflow 03 step 7)
- **FR-CODE-1** Candidate receives task statements and visible tests only.
- **FR-CODE-2** Editor deltas every 500 ms classified as type/paste/autocomplete/undo, with keystroke timing
  joined to insert position. Snapshots every 30 s, on run and on submit.
- **FR-CODE-3** Run executes in a sandbox: one container per run, never reused, no network, read-only root
  filesystem, 256 MB memory, 1 CPU, 128 PIDs, wall-clock kill, rate limit 1 run per 3 s. Returns visible
  test results only.
- **FR-CODE-4** Submit runs visible and hidden tests. Hidden results go only to the interviewer. The task
  freezes for the candidate after submit.

### 5.6 Ending and sealing (Workflow 02 step 1)
- **FR-SEAL-1** Session ends by interviewer, duration limit or candidate abandon: `LIVE → SEALING` using an
  atomic compare-and-set.
- **FR-SEAL-2** Seal sequence is ordered, idempotent and resumable: 5 s drain → notify candidate
  (thank-you screen only) → stop recording and wait for finalise → detach producers → fusion final tick
  and close open windows → write event log and verify the hash chain → sign the manifest (chain head).
- **FR-SEAL-3** `GET /evidence/verify` recomputes the chain and checks the signature at any later time.

### 5.7 Post-processing and report (Workflow 02 steps 2 to 7)
- **FR-PIPE-1** A pipeline run starts after sealing. Steps: SealVerify, then in parallel TranscriptFinalize,
  IntegrityRescore, CodeEvaluate, MediaIndex; then AnswerGrading; then CompositeScore; then RenderReport.
- **FR-PIPE-2** Every step retries 3 times. Any step may fail without killing the run: the run takes the
  **degraded** path and a partial report is still delivered, labelled with exactly which step was lost.
- **FR-PIPE-3** IntegrityRescore re-runs fusion over all observations, applies adjudications, and marks live
  flags the offline pass does not support as `supersededByReview` — never deletes them.
- **FR-GRADE-1** Answer grading per Q&A pair: correctness, depth, specificity, structure, hands-on evidence,
  with timestamped positive signals. The rubric **forbids** scoring accent, fluency, grammar, pace or silence.
- **FR-SCORE-1** Composite: technical 0.55, communication 0.20, integrity modifier 0.25.
  Integrity ≥ 85: no material effect. 70 to 85: proportional deduction. Below 70: overall number
  suppressed, report reads "Review required before scoring". Sub-scores are always shown.
- **FR-REP-1** Report contains header, integrity section, strengths, per-question evaluation, code section,
  merged note timeline, and a **mandatory methodology appendix** (detector versions, weights version,
  sensitivity, calibration status, every unscored window, superseded flags, chain hash). HTML plus PDF.
- **FR-REP-2** Delivery: summary email (sub-scores, flag counts by severity, one-line summary, deep link only
  — no transcript, recording or flag narratives) and `report.ready` over the socket if connected.
- **FR-REP-3** Report access requires authentication and org membership.
- **FR-REP-4** Adjudications after delivery recompute the score and update the report.

### 5.8 Audit and retention
- **FR-AUD-1** Every session state transition and every sensitive action writes to `audit_logs`.
- **FR-RET-1** Retention: recordings and evidence frames 90 days; reports and transcripts 3 years; raw
  observations 180 days; evidence log floor 30 days. A nightly job hard-deletes and writes a deletion
  receipt to the audit log.

---

## 6. What the candidate never receives (hard requirement)

The backend must make these **impossible to leak** through any candidate-facing API or socket event:

- Any score (integrity, sub-score, composite), live or at the end.
- Any flag detail: list, severity, count, narrative, evidence frame.
- Any threshold, weight, sensitivity value or machine-readable channel list.
- Any hidden test output.
- The report.

The thank-you screen payload is identical for every candidate.

---

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| Latency | Telemetry ingest to flag emission under 1 s (p95). Fusion tick every 200 ms. |
| Reliability | A failed post-processing step never blocks report delivery. Seal is resumable after a crash. |
| Integrity | Observations are append-only and hash-chained. Flags are never deleted. |
| Security | Signed join tokens, hashed refresh tokens, org scoping on every query, rate limits on auth, join and run. |
| Privacy | IP and UA stored hashed. No keystroke identities outside the code editor. No screen OCR. |
| Tamper resistance | Thresholds never leave the server. Impossible client state produces a data-integrity note, not a conduct flag. |
| Observability | Structured JSON logs with request ID and session ID. Health and readiness endpoints. |
| Portability | AWS-only capabilities sit behind interfaces with local implementations. |

---

## 8. Success criteria for the backend MVP

1. End-to-end scripted test: create session → upload JD → configure → link → preflight → consent →
   start → send telemetry → receive a flag and warning → end → sealed manifest verifies → report generated.
2. Candidate socket and candidate REST responses contain none of the forbidden fields (automated test).
3. Killing one pipeline step still produces a report marked degraded.
4. Tampering with one observation row makes `/evidence/verify` fail.
