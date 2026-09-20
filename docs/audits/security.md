# Security blind spot audit: VeriTrust

Audit 2 of 6. Read-only. No file other than this report and `lock-in.md` was created or changed.
Repo state audited: `main` at `f4f7462` (see the next paragraph for how that differs from where I started).

Paths are relative to the repo root. `file:line` cites are to the code as it is on disk at `f4f7462`.
The UI name is now HiringGuard (commit `773d05a`); code, repo and docs still say VeriTrust.

**The repo moved while I was auditing.** I started at `f3b7b4d`. Partway through, five commits from
other authors landed on `main` (now `f4f7462`): a browser-side camera-analysis producer, WebRTC
signalling, client-side lockdown, a new `local` sandbox provider, a rename, and audits 4 to 6.
I read that delta and updated this report to match. Items that exist only because of the new code
are marked **New since f3b7b4d**. Everything else was re-checked against the new code and cites
were updated where lines shifted.

**Method and limits.** I read the auth service, JWT handling, every middleware, every route file,
the internal producer path, the socket server, the fusion engine, the Docker sandbox, the signer,
the evidence service, the report renderer and the relevant services and controllers. I ran
nothing: no requests, no exploit attempts, no `npm audit`, no database or Redis access. Every
"exploitable today" below means "reachable through the code as written, by reading". I did not
reproduce any of it. What I did not read is listed in section 6.

## Read this first

**Three items I would put in front of you for an immediate decision (not acted on):**

1. **CB-1 (New since f3b7b4d): one malformed socket message from a candidate can crash the whole
   API process.** The new `cv.batch` handler converts a candidate-supplied timestamp with
   `new Date(ts + offset).toISOString()` outside any try/catch
   (`backend/src/sockets/index.ts:213`). A `ts` of 9007199254740991, which the schema allows
   (`backend/src/sockets/events.ts:46`), makes `toISOString()` throw. Socket.IO dispatches
   listeners inside `process.nextTick`, so the throw becomes an uncaught exception, and
   `backend/src/index.ts:53-56` turns that into a shutdown with exit code 1. Every live session on
   that process loses its runtime. Precondition: the candidate's own session must be LIVE. By
   reading; not reproduced. See CB-1.
2. **EV-1: evidence verification does not bind the signed manifest to the data.** Anyone with
   write access to the database can rewrite a session's observations, recompute the hash chain
   (genesis and algorithm are public), update one row in `evidence_manifests`, and
   `GET /sessions/:id/evidence/verify` still returns `valid: true`. No key is needed. The
   signature is checked over bytes in storage whose content is never compared to the recomputed
   chain. This makes the product's central claim, tamper-evident evidence, false against a database
   insider. Fix is small (parse the signed manifest and compare). See EV-1.
3. **CT-7: the candidate token keeps working after the interview ends.** `run` and `submit` do
   not check session status, so a candidate can write code executions and a `SUBMIT` after the
   session is sealed, and a later report recompute will score that submission. See CT-7.

**Direct answers to the four questions you asked:**

- **What stops a candidate forging, suppressing or replaying telemetry? Nothing.** Events are
  unsigned JSON from the candidate's browser over an authenticated socket. The candidate chooses
  the connection id, the sequence numbers, the timestamps and the clock offset. Every integrity
  signal that is live in this build originates in that browser, and since `236c71b` that includes
  the camera analysis (face, gaze, object): MediaPipe runs in the browser and reports over the
  socket, and no frames reach the server. The same holds for the "leaving full screen ends the
  interview" rule. Details CT-1 to CT-9, CV-1.
- **What can the internal service token do if leaked?** Inject observations of any channel and
  type into any LIVE session (frame a candidate or exonerate one), forge transcript segments that
  feed answer grading, and switch off scoring on any channel with a `DEGRADED` heartbeat. It cannot
  read data, touch non-LIVE sessions or alter sealed evidence. IT-1.
- **Docker sandbox isolation boundary?** A shared Linux kernel with default Docker/runc
  containment: no network, read-only root, 256 MiB, 1 CPU, 128 pids. No capability drop, runs as
  root inside the container, no gVisor or microVM. The API process needs Docker daemon access,
  which is root on that host. The default provider is `mock`, which passes every test for any
  non-empty code. **New since f3b7b4d:** a third provider, `local`, runs candidate code directly
  on the API host with no isolation at all and is selectable in production (SB-7). SB-1 to SB-7.
- **What does the evidence signature prove, where is the key, can the chain be rewritten?** It
  proves only that the holder of one Ed25519 key signed one manifest file at some point. The key
  is an environment variable in the API and worker processes, the same trust domain as the
  database. The chain can be rewritten by anyone with database access, and verification will
  not notice. EV-1 to EV-7.

**Stack checked against disk, since you asked me to verify:**

| Stack list said | On disk |
|---|---|
| Node 24 | Node 22 (`backend/Dockerfile` `node:22-bookworm-slim`, `engines: >=22`) |
| nodemailer with a log provider | Both exist; `MAIL_PROVIDER` defaults to `smtp` (`backend/src/config/env.ts:48`) |
| mock-only LLM and media | Confirmed for the LLM and the server-side media provider: env enums allow only `mock` (`env.ts:55-56`). Media between the two browsers is now peer-to-peer WebRTC with no server capture (RTC-1) |
| Docker sandbox | Optional. `SANDBOX_PROVIDER` is `mock \| docker \| local`, default `mock` (`env.ts:57`, `backend/src/providers/index.ts:36-38`) |
| (not in the stack list) | Camera analysis runs in the candidate's browser with MediaPipe (`frontend/lib/candidate/cv.ts`, models under `frontend/public/mediapipe`) |
| rate-limit-redis | Confirmed (`backend/src/middlewares/rate-limit.ts:2,27`) |
| Ed25519 chain | Confirmed (`backend/src/providers/signer/ed25519.signer.ts`) |
| `ml/` not a runtime service | Confirmed: no DB driver, no import from backend |

Also on disk: Express 5.2, TypeScript 7.0.2, Prisma 7.10 with `@prisma/adapter-pg`, socket.io 4.8,
ioredis 6, BullMQ 6, Next.js 16. There is no CI configuration (no `.github`).

Status labels used below:

- **Exploitable today**: reachable through the shipped code with ordinary access.
- **Needs a precondition**: real defect, but requires something outside the code (a leaked secret,
  a misconfiguration, host access).
- **Deployment-dependent**: depends on how it is hosted; nothing in the repo decides it.

---

## 1. Threat model used

| Actor | Trust assumed |
|---|---|
| Anonymous internet | none |
| Candidate | hostile by definition; controls the browser and everything it sends |
| Interviewer, reviewer | semi-trusted; can be compromised or malicious |
| Org owner, admin | trusted within their org, not across orgs |
| CV/ASR producer holding the service token | trusted when honest; treated as compromisable |
| Database, Redis or API host access | insider or compromised infrastructure |

---

## 2. The four focus areas

### 2.1 Client-side trust

The live integrity signals in this build are focus, paste, rhythm, pointer and environment
telemetry, editor deltas, and (new since `f3b7b4d`) camera analysis. All of them come from the
candidate's browser (`frontend/lib/candidate/telemetry.ts`, `frontend/lib/candidate/cv.ts`). ASR and
server-side media are mock, and the browser sends no video frames to the server, so no
server-trusted signal exists to cross-check any of them.

#### CT-1. Telemetry has no integrity, authenticity or freshness protection (Critical, exploitable today)

- The candidate socket authenticates with a candidate JWT and a consent lookup only
  (`backend/src/sockets/index.ts:122-139`). After that, `tel.batch`, `editor.delta` and
  `editor.snapshot` are accepted as raw zod-validated JSON (`:161-181`). Nothing is signed,
  nonced, bound to a device, or checked against any independent source.
- **Forging.** The candidate can send any event of a valid shape: for example `keystroke_stats`
  with hand-picked variance to produce `rhythm_normal` observations, or `device`/`screen`
  events. Every detector input is client-reported (`backend/src/live/session-runtime.ts:266-292`).
- **Suppressing.** The candidate can send nothing, or send only chosen events. Durations are
  computed from the candidate's own timestamps (`backend/src/live/detectors/focus.detector.ts:30-43`),
  so reporting every blur as shorter than 800 ms (`FOCUS_IGNORE_MS`) makes the detector ignore it.
  There is no "telemetry went quiet" detector. Presence is only socket connected or not, with a 120 second
  grace (`session-runtime.ts:414-422`). A modified client, a browser extension, a second device,
  a VM or remote-control software are all invisible to this telemetry.
- **Replaying.** The connection id is chosen by the client (`frontend/lib/candidate/telemetry.ts:50`)
  and the per-connection sequence check is keyed on it
  (`backend/src/live/ingest.ts:22-39`). A new `connId` starts at sequence 1, so old batches can be
  replayed and the gap detector can be avoided entirely by never reusing a `connId`. The only
  server-side consequence of a gap is an unscored window, not a flag
  (`session-runtime.ts:254-261`).
- Message size is bounded only by Socket.IO's default 1 MB (`backend/node_modules/engine.io/build/server.js:51`),
  and there is no per-socket rate limit (`sockets/index.ts:161-181`), so the volume of forged
  events is effectively free.
- Mitigation: this cannot be fixed client-side. The honest position is that telemetry is a
  hint, not evidence. Real mitigations are independent server-observed signals (real media, CV,
  ASR from a server you control), a signed and attested client where feasible, server-side
  plausibility checks, and rate and size caps. The product copy should not claim the client
  telemetry proves anything.

#### CT-2. Timestamps are attacker-controlled and drive the score (High, exploitable today)

- Every event carries `ts: z.number()` with no bounds, and `clock.offset` accepts any number
  (`backend/src/sockets/events.ts:81-84,97-138`). The server computes `ts + offset` and stores it
  (`live/ingest.ts:34`). Server receive time is stored as `receivedAt` but never used for scoring.
- Fusion decay is computed from observation timestamps: `decay(value, tsMs - lastTs, tau)` and it
  does nothing when the elapsed time is not positive
  (`backend/src/live/fusion/fusion.engine.ts:40-43,55`). Corroboration across channels uses the same
  timestamps in a 6 second window (`:62-72`).
- Consequence: a candidate who stamps their misconduct events 20 minutes apart (any spacing large
  against the 180 to 300 second decay constants in `backend/src/config/detection.ts:91-103`) keeps
  every channel accumulator near one event's worth, so no channel ever reaches its threshold of
  2 to 5 (`:109-121`). All the events are still recorded, but no flag is raised and the integrity
  score stays high. Cross-channel corroboration is defeated the same way.
- The offline rescore replays observations by these same timestamps
  (`backend/src/pipeline/steps/integrity-rescore.step.ts:97-152`), so the authoritative recompute
  inherits the manipulation.
- Also note: the calibration boundary is decided by arrival time, not observation time
  (`session-runtime.ts:198,263`), a mismatch already logged in `backend/docs/Memory.md`.
- Mitigation: clamp each event to `[receivedAt - skew, receivedAt + skew]`, bound `clock.offset`,
  reject non-monotonic batches, and compute decay from `receivedAt` for the server-observed part.

#### CT-3. The rhythm baseline and negative evidence are candidate-supplied (High, exploitable today)

- The rhythm detector learns its baseline from the candidate's own `keystroke_stats` during the
  first 60 seconds (`session-runtime.ts:267-270`) and compares later windows against it
  (`backend/src/live/detectors/rhythm.detector.ts:15-43`). The candidate chooses the baseline.
- Negative LLR observations exist (`rhythm_normal` -0.3) and pull an accumulator toward the floor
  of -2 (`fusion.engine.ts:74`, `detection.ts:33-35`). A client can emit as many
  `keystroke_stats` events as fit in a 1 MB message. Because the authorship detector puts
  `typing_burst` and `typed_ratio_low` on the same RHYTHM channel
  (`backend/src/live/detectors/authorship.detector.ts:46-73`), the candidate can offset those
  positives with clean-looking noise.
- Mitigation: server-side rate limit on events per type per interval, fixed windowing, calibrate
  on server-observed data only, and do not let client-reported "clean" events reduce a score.

#### CT-4. Editor deltas, snapshots and submitted code are never reconciled (High, exploitable today)

- `editor.delta` changes, `editor.snapshot` content and the `code` sent to `run` and `submit` are
  three independent client-supplied values. The server never rebuilds the document from deltas to
  compare with the snapshot or the submission (`session-runtime.ts:315-364`,
  `backend/src/services/coding.service.ts:40-136`).
- A candidate can paste a solution and send fabricated `TYPE` deltas with plausible
  `keyIntervalsMs`, which is exactly what the authorship detector reads
  (`authorship.detector.ts:26-79`). The typed ratio then looks human.
- Mitigation: reconstruct the document server-side from deltas and require it to match snapshots
  and the submission within a tolerance; treat a mismatch as an event.

#### CT-5. Preflight and media-ready are self-attested (Medium, exploitable today)

- Preflight pass or fail is computed from a probe object the candidate posts
  (`backend/src/services/join.service.ts:27-56,104-118`): `camera`, `webrtc`, `screenCount`,
  `isExtended`, `downlinkMbps` are all client claims.
- The media-ready gate that lets a session start calls `verifyCandidateTracks`
  (`backend/src/services/media.service.ts:6-14`), which the only media provider answers `true` for
  camera, microphone, screen and "screen is the whole monitor"
  (`backend/src/providers/media/mock.media.ts:13-15`). With the mock, any candidate can call
  `POST /candidate/media-ready` with no camera or screen share at all.
- Mitigation: gate on a real provider verification, and treat probe data as informational only.

#### CT-6. Any holder of the candidate token can end the session, and there is no device binding (Medium, exploitable today)

- The candidate namespace allows any number of concurrent sockets per token
  (`sockets/index.ts:141-145`). On every disconnect the runtime starts a 120 second abandon timer
  and stores only the latest handle (`session-runtime.ts:414-422`); connecting clears only that
  handle (`:406-412`), and nothing checks whether another socket is still connected.
- Sequence: the real candidate is connected; a second socket using the same token connects and
  disconnects; nothing reconnects; after 120 seconds `triggerEnd("candidate_abandon")` seals the
  session while the real candidate is still connected. A candidate opening and closing a second tab
  can do this by accident. A leaked token can do it on purpose.
- The same token also lets an accomplice on another device connect and observe or interact, since
  nothing binds it to one browser.
- Mitigation: count live sockets before starting the timer, clear any previous timer handle,
  allow one candidate socket per session (or bind the token to the first connection).

#### CT-7. The candidate token is accepted outside the LIVE window (High, exploitable today)

- `requireCandidateToken` checks the JWT and that a consent row exists, never the session status
  (`backend/src/middlewares/candidate-token.ts:6-30`). `runTask` and `submitTask` load the task by
  id and session and never check that the session is LIVE
  (`coding.service.ts:29-38,40-136`). Token lifetime is the session duration plus two hours,
  counted from consent (`join.service.ts:208`).
- After the session is sealed, a candidate can `POST /candidate/tasks/:id/submit` on a task they
  had not submitted. That inserts a `SUBMIT` execution and snapshot into evidence tables after the
  signed export was taken. Code evaluation reads the newest `SUBMIT` execution
  (`backend/src/pipeline/steps/code-evaluate.step.ts:66`), so any later
  `POST /sessions/:id/report/recompute` scores it. A candidate can obtain a solution after the
  interview ends and have it graded.
- Before the session goes LIVE, run and submit also work during the waiting room.
- Mitigation: require `status === LIVE` for run and submit, and reject writes to any session past
  LIVE.

#### CB-1. One candidate message can crash the API process (Critical, exploitable today; New since f3b7b4d)

- Where: the `cv.batch` handler at `backend/src/sockets/index.ts:205-220`; its schema at
  `backend/src/sockets/events.ts:41-53` (`ts: z.number().int().min(0)` with no upper bound, `items`
  capped at 20, `payload` unbounded); the process handler at `backend/src/index.ts:53-56`.
- Mechanism: the handler builds `ts: new Date(item.ts + offsetMs).toISOString()` synchronously inside
  the socket listener (`:213`) with no try/catch. A sum above 8.64e15, the limit of a JavaScript
  `Date`, gives an invalid date, and `toISOString()` throws a `RangeError`. `item.ts` can be as large
  as 9007199254740991, and any valid `ts` plus a large `clock.offset` (unbounded,
  `events.ts:81-84`) does the same. Socket.IO calls listeners inside `process.nextTick`
  (`backend/node_modules/socket.io/dist/socket.js:689-700`), so the exception is uncaught.
  `index.ts:53-56` logs it as fatal and calls `shutdown("uncaughtException", 1)`, which closes the
  server and exits within 10 seconds.
- Precondition: a candidate token for a session that is LIVE on that process, because the handler
  returns early otherwise (`:207`). So any candidate in a live interview, or anyone holding their
  token, can take down every session on that process.
- The older handlers avoid this because their timestamp conversions run inside the write queue,
  where failures are caught and logged (`session-runtime.ts:238-242`). The new handler is the only
  synchronously throwing path I found in `sockets/index.ts`.
- Consequence: every runtime on the process is destroyed. Sessions stay LIVE in the database with no
  runtime, no timer and no automatic end (restart behavior is covered by the failure-modes audit).
- Mitigation: bound `ts` and reject invalid dates before converting; wrap every socket listener in
  a try/catch helper; and do not treat one request's `uncaughtException` as a reason to end the
  process for the socket layer.

#### CT-8. Any token holder can end a LIVE session instantly, and the rule is enforced only in the browser (High, exploitable today; New since f3b7b4d)

- `session.violation` with `kind` `left_fullscreen`, `tab_hidden` or `window_blur` is accepted from
  the candidate socket (`sockets/index.ts:197-203`, `events.ts:64-66`) and calls
  `handleCandidateViolation` (`backend/src/services/lifecycle.service.ts:126-133`), which writes an
  audit row and ends the session with reason `candidate_violation`. Nothing verifies the claim.
- Two consequences. First, anyone holding the candidate token can end any LIVE interview with one
  message; this is a faster version of CT-6 (no 120 second timer). Second, the rule is enforced by
  browser code (`frontend/lib/candidate/lockdown.ts`): a candidate who patches or bypasses the page
  never reports leaving full screen, switching tabs or losing focus, and the copy and paste blocking
  is also client-side. `frontend/lib/candidate/test-mode.ts` switches the rules off with `?test=1`,
  but only in non-production builds (it checks `NODE_ENV`), which is sound.
- Mitigation: treat violations as advisory events with server-side limits, do not end a session on a
  client claim alone, and corroborate with server-observed presence.

#### CT-9. The empty-session guard is defeated by one message and hangs on a Redis key (Medium, exploitable today; New since f3b7b4d)

- `endSession` now discards a LIVE session, with no seal and no report, if Redis has no
  `telemetrySeen` flag or the session ran under the 60 second calibration window
  (`lifecycle.service.ts:97-101`; `discardSession` at `:110-124`). The first `tel.batch` sets the flag
  (`sockets/index.ts:164`).
- One harmless `tel.batch` event sets the flag, so a candidate who suppresses everything afterwards
  is not caught by it (CT-1).
- The flag lives only in Redis (`s:{sid}:state`). If that key is lost (crash, failover, flush), a real
  interview with thousands of observations is discarded as "no participation": ABORTED, no signed
  manifest, no report. This is the same family as the chain-head problem in the schema audit (F1).
  The new `roomOpen` gate (`lifecycle.service.ts:74,80`) is also Redis-only but fails safe: the
  candidate waits until the interviewer reopens the room.
- Mitigation: derive "telemetry seen" from the database (an observation row exists), not from a Redis
  flag.

#### CV-1. The camera analysis is computed and reported by the candidate's browser (High, exploitable today; New since f3b7b4d)

- `frontend/lib/candidate/cv.ts` runs MediaPipe's face landmarker and an object detector in the
  candidate's browser and sends `cv.batch` (face_absent, multiple_faces, gaze_away, foreign_object),
  `cv.status` and `cv.heartbeat`. The server maps each type to a channel itself (FACE, GAZE, SCENE,
  `sockets/index.ts:209`), assigns the LLR, and feeds the observations through the same function as
  the internal producer path (`ingestExternalObservations`, `:217`), labelling them `source: CV`
  (`internal.service.ts:20,38-46`).
- The server never sees a frame, so the candidate can send no events (suppress); send `OK` heartbeats
  forever, so FACE and GAZE look healthy; stop heartbeats or send `DEGRADED`, which freezes FACE and
  GAZE as `DETECTOR_DOWN` (`sockets/index.ts:228-234`; visible to the interviewer but unscored); and
  space forged timestamps (CT-2). SCENE, where `foreign_object` lands, is not covered by the
  heartbeat channels at all.
- The allow-list accepts only positive-evidence types, so a candidate cannot inject "clean"
  observations through this path, unlike the internal-token scenario (IT-1).
- `cv.status` is relayed unverified to interviewer sockets (`sockets/index.ts:222-226`), so the
  "camera analysis OK, 1 face" indicator can be made to say anything. Values are schema-bounded and
  escaped in the UI.
- The `source: CV` label now means "reported by the candidate's browser", which matters in the
  evidence log and the report. The producer name `cv` is also shared with any future server-side CV
  service, and the health monitor keys by name (`backend/src/live/producer-health.ts:18-23`), so
  their heartbeats would mask each other.
- Mitigation: this is the same class as CT-1. It can inform the interviewer but it is not evidence.
  Either move the analysis server-side (frames or embeddings sent to a service you control) or label
  the signal as candidate-reported everywhere it appears.

#### RTC-1. Video and screen are peer-to-peer and candidate-controlled (Medium; New since f3b7b4d)

- The interviewer sees the candidate's camera and screen over browser-to-browser WebRTC. The server
  only relays signalling (`sockets/index.ts:89-97,183-195`; `frontend/lib/candidate/rtc.ts`). Nothing
  captures or verifies the media server-side: the media provider is the mock and `stopRecording`
  returns no keys (`backend/src/providers/media/mock.media.ts:21-23`). A virtual camera, a
  pre-recorded loop, or a different screen than the one in use is indistinguishable to the server,
  and the `streams` labels are client-supplied (`events.ts:37`).
- The signalling relay itself is sound: it validates each message with zod (`events.ts:32-38`),
  overwrites `from` with the real socket id, and scopes delivery to the session room
  (`sockets/index.ts:89-97,183-195`).
- ICE defaults to Google's public STUN servers (`frontend/lib/rtc-config.ts:3`), which exposes both
  parties' network addresses to a third party. Any TURN credential is read from
  `NEXT_PUBLIC_TURN_URL`, `NEXT_PUBLIC_TURN_USERNAME` and `NEXT_PUBLIC_TURN_CREDENTIAL`
  (`rtc-config.ts:4-11`), which are compiled into the public JavaScript bundle, so a static TURN
  credential would be world-readable.
- The consent text still says "Recordings and evidence are kept for up to 90 days"
  (`join.service.ts:130`) although nothing is recorded server-side.
- Mitigation: decide whether media is evidence. If it is, it needs a server-side capture path (an SFU
  or recording service). Mint short-lived TURN credentials per session from the API.

### 2.2 The internal service token

`INTERNAL_SERVICE_TOKEN` guards `/api/v1/internal/*` (`backend/src/routes/internal.routes.ts:9-13`).
The comparison is constant time and sound (`backend/src/middlewares/service-token.ts:7-16`).

Properties that raise the chance and the blast radius of a leak:

- One static shared secret for every producer and every session. No scoping by session, org or
  producer, no expiry, no rotation mechanism, no request signing, no replay protection, no source
  IP restriction.
- The producer identity is a self-declared body field (`producer: "cv" | "asr"`,
  `backend/src/validators/internal.schema.ts:10`), so a compromised ASR holder can post as CV.
- Only a minimum length of 32 is enforced (`env.ts:43`), and `npm run keys:generate` does not
  generate it (`backend/scripts/generate-signing-key.ts:6-13` prints the other six secrets).
  Operators may pick a weak value.
- `backend/docker-compose.yml` passes the same `.env` to the `api`, `worker` and `migrate`
  containers, so the token sits in processes that do not need it.
- The path shares the global 300 requests per minute per IP limiter and has no limiter of its own
  (`backend/src/app.ts:46`, `rate-limit.ts:40`).

#### IT-1. What the token can do if leaked (Needs a precondition: the leak)

Everything below is limited to sessions that are LIVE on the API process holding the runtime,
because the service checks the in-memory registry (`backend/src/services/internal.service.ts:22-28`).

**New since f3b7b4d:** the candidate socket now calls the same `ingestExternalObservations` and
`ingestHeartbeat` functions (`sockets/index.ts:217,228-234`). A candidate therefore holds a
restricted version of two of these capabilities for their own session: positive CV types on FACE,
GAZE and SCENE, and heartbeats for FACE and GAZE (CV-1). The negative-evidence, any-channel,
transcript and cross-session capabilities below remain token-only.

| Capability | How | Effect |
|---|---|---|
| Inject positive observations | `POST .../observations` with any `channel`, any known `type`, any `ts` (`internal.schema.ts:13-19`); LLR is assigned server-side from the type (`internal.service.ts:38-46`, `detection.ts:15-36`) | Frame a candidate: flags, integrity drop, and candidate-facing warnings including INTERRUPT tier that lock the candidate's editor (`backend/src/live/warden.ts:14-86`; `frontend/components/candidate/candidate-room.tsx:601` passes `locked={interrupted}`) |
| Inject negative observations | Same call with `focus_resume`, `pointer_return`, `rhythm_normal` on any channel (channel and type are independent fields) | Pull any channel toward the -2 floor and mask real misconduct |
| Forge transcript | `POST .../transcript` with any speaker, text, times, `isFinal` (`internal.service.ts:62-94`) | Write candidate answers that feed Q&A pairing and grading; supersede real segments; appears on the interviewer dashboard as live speech |
| Mute channels | `POST .../heartbeat` with `status: "DEGRADED"` and any `channels` array (`internal.schema.ts:44-51`) | Freezes those channels as `DETECTOR_DOWN` (`backend/src/live/producer-health.ts:21-43`, `session-runtime.ts:379-403`); frozen channels are skipped for scoring (`:201`) and excluded from the offline rescore. The channel list is any enum value, including the client-side FOCUS, PASTE, RHYTHM, POINTER and ENVIRONMENT channels. It shows as a `system.degraded` frame and unscored windows, so it is visible, not silent |
| Flood | Unbounded `items` array, unbounded `payload` | Fills `observations`; each request also blocks on `runtime.flush()` (`internal.service.ts:48-49`) |
| Probe | The error for a session that is not LIVE on this process is the same for any id (`internal.service.ts:22-28`) | Only a weak liveness probe for ids the holder already knows; ids are 26-character ULIDs so not guessable |

It cannot: read any data (no GET endpoints), act on non-LIVE or sealed sessions (the LIVE check
runs first), reach user or org endpoints, or modify the signed evidence.

- Mitigation: per-producer, per-session, short-lived signed tokens (or mTLS between named
  services); make channel and type allow-lists per producer; cap array and payload sizes; give the
  path its own rate limit; do not let a producer send `DEGRADED` for channels it does not own;
  generate the secret in `keys:generate` and inject it only into the services that need it.

#### IT-2. Redis is a second, unauthenticated way to forge dashboard events (Deployment-dependent)

- The API subscribes to `events:*` and forwards any published `{event, payload}` to that session's
  interviewer sockets after wrapping it in a frame (`backend/src/sockets/event-subscriber.ts:12-24`).
  Anyone who can `PUBLISH` to Redis can inject arbitrary `flag.update`, `integrity.tick`,
  `session.state` frames into any session's dashboard.
- Redis also holds the chain head, the fusion lease, seal progress, the media-ready gate and the
  rate-limit counters. `backend/docker-compose.yml` publishes Redis on `6379:6379` with no
  password, and Postgres on `5432` with `postgres:postgres`. That is a dev file, but it is the only
  configuration in the repo.
- Mitigation: Redis AUTH and TLS, private networking only, and stop trusting `events:*` payloads
  as if they were server-authored.

### 2.3 The Docker sandbox

SB-1 to SB-6 apply when `SANDBOX_PROVIDER=docker`; SB-7 covers `local`. The default is `mock`.

#### SB-1. Isolation boundary (Needs a precondition: a container escape)

- One container per run, started through the Docker API
  (`backend/src/providers/sandbox/docker.sandbox.ts:146-162`). The boundary is Linux namespaces,
  cgroups and Docker's default seccomp profile on a kernel shared with the host. There is no
  gVisor, Kata or Firecracker layer.
- The API process must reach the Docker daemon (`new Docker()`, `:87`), which is root-equivalent on
  that host. That host also runs the API, holds the database and Redis credentials, and holds the
  evidence signing key. A container escape or a runtime CVE therefore ends at the keys that sign
  the evidence.
- Mitigation: run untrusted code on a separate, disposable host or microVM service that holds no
  application secrets, reached over a narrow queue, not through a Docker socket on the API host.

#### SB-2. Limits and hardening gaps (Exploitable today when the docker provider is on)

What is enforced (`docker.sandbox.ts:153-161`, `backend/src/providers/sandbox/sandbox.provider.ts:30-36`):

| Control | Value |
|---|---|
| Network | `NetworkMode: none` |
| Root filesystem | read-only; `/sandbox` bind mounted `:ro`; `/tmp` tmpfs 16 MiB |
| Memory | 256 MiB |
| CPU | 1 |
| Processes | 128 |
| Per-test time | `timeLimitMs` (task default 5000 ms) |
| Overall wall clock | `timeLimitMs * 20 + 10 s`, then `kill` |
| Rate | 1 run per 3 s per session and task (`backend/src/routes/candidate.routes.ts:15-25`) |

What is missing:

- No `User`: candidate code runs as root in the container. No `CapDrop`, no `no-new-privileges`, no
  custom seccomp profile, no `MemorySwap` (so swap may extend the memory cap), no ulimits, no disk
  quota beyond the tmpfs.
- No output cap. The run reads the whole log stream into API memory
  (`docker.sandbox.ts:180-187`), and the harness itself buffers all test output inside the
  256 MiB container. A candidate can make each run cost up to a container's worth of API memory,
  then stored uncapped in `code_executions` (see the schema audit).
- No global concurrency limit. The per-task limiter is keyed per session, so N candidates run N
  containers at once, each in an HTTP request handler.
- Images are mutable tags pulled from a public registry at first use
  (`docker.sandbox.ts:53,67,134-144`), not pinned by digest. `node:20-alpine` is used for candidate
  JavaScript; Node 20's scheduled end of life was April 2026.
- Mitigation: drop all capabilities, run as an unprivileged user, set `no-new-privileges`, set
  `MemorySwap` equal to `Memory`, add output and disk caps, add a global semaphore and a queue,
  pin images by digest and rebuild them on a schedule.

#### SB-3. Harness and candidate code share a process context (Low, exploitable today with the docker provider)

- The harness and `solution.py`/`solution.js` run in one container as the same user
  (`docker.sandbox.ts:17-49`). Candidate code can read `/sandbox/tests.json`, which holds the
  inputs of hidden tests during a `submit` (`:102`), and can write to the container's pseudo
  terminal (`Tty: true`, `:151`).
- Forging a pass is hard: expected outputs are kept on the host and never written into the
  container (`:102` writes inputs only, `:109` compares on the host), and the harness result is the
  whole log parsed as one JSON document (`:105`), so extra output turns a run into an error. The
  realistic effects are an error or denial of service, plus the candidate learning hidden inputs.
- Mitigation: run the harness as a separate user, or the tests from a separate process that the
  candidate process cannot see or signal.

#### SB-4. The default provider passes everything (Exploitable today in the default configuration)

- `MockSandboxProvider` returns `PASSED` for every test whenever the code is not empty
  (`backend/src/providers/sandbox/mock.sandbox.ts:9-21`). In the default configuration, submitting
  `x` passes all hidden tests and the technical score follows.
- This is a maturity issue as much as a security one; it is listed here because the score is
  presented as evidence.

#### SB-5. The Docker provider cannot run on managed container hosting as built (Deployment-dependent)

- The harness files are written to a temp directory on the API's filesystem and bind mounted by
  host path (`docker.sandbox.ts:97-102,154`). If the API itself runs in a container, the Docker
  daemon resolves that path on the host, where it does not exist, so the sandbox sees an empty
  directory. Managed container platforms offer no Docker daemon at all.
- The likely workaround, mounting `/var/run/docker.sock` into the API container or running a
  privileged Docker-in-Docker, is the most dangerous option available (SB-1). The provided
  compose file mounts no socket, so `SANDBOX_PROVIDER=docker` does not work in it.
- Mitigation: decide the runner architecture explicitly (separate execution service) before
  deployment.

#### SB-6. Candidate-controlled language key indexes an object literal (Low, exploitable today)

- `LANGUAGE_RUNNERS[request.language]` uses a string of up to 40 characters chosen by the candidate
  (`docker.sandbox.ts:91`, `backend/src/validators/coding.schema.ts:8`). Keys such as `constructor`
  resolve to inherited properties, produce a "runner" with no image, and throw before the `try`
  block (`:96`), returning a 500. It is not an escape. The task's own `languages` list is also
  never enforced against the requested language.
- Mitigation: use a `Map` or `Object.hasOwn`, and check the language against the task.

#### SB-7. The `local` provider runs candidate code on the API host with no isolation (Critical if selected; exploitable today when `SANDBOX_PROVIDER=local`; New since f3b7b4d)

- `backend/src/providers/sandbox/local.sandbox.ts` starts the host's Python or the API's own Node
  binary on the candidate's code, one process per test, as the same operating-system user as the API
  (`:1-100`). Its own comment says it has no isolation and is for local development only.
- `env.ts:57` accepts `local` in any environment, and `providers/index.ts:36-38` builds it on request.
  Nothing refuses it when `NODE_ENV=production`.
- What candidate code can do when it is selected: read any file the API user can read, including the
  working directory, `.env` if one is present and the storage directory (all orgs' evidence and
  reports); on Linux read the API process's environment through `/proc/<parent pid>/environ` (same
  user), which holds the database URL, the signing key and every secret; connect to Postgres and
  Redis on localhost (both unauthenticated or default-credential in the compose file); make outbound
  network calls; and start children that outlive the timeout, because the timeout only kills the
  direct child (`:26-29`). The child's environment is limited to `PATH` and `SYSTEMROOT` (`:22`),
  which stops naive `process.env` reads but not the file and `/proc` reads above. The output cap of
  64 KB (`:7,30-35`) is an improvement over the Docker path.
- The same object-literal language lookup as SB-6 applies (`:58`).
- Mitigation: refuse `local` when `NODE_ENV=production` at startup, and run even development
  execution in a container.

### 2.4 The evidence chain

#### EV-1. Verification does not bind the signature to the data (High, exploitable by anyone with database write access; no key needed)

- Where: `backend/src/services/evidence.service.ts:292-331`.
  - `manifest` is the database row (`:298`).
  - The chain is recomputed from `observations` and compared to `manifest.chainHead` and
    `manifest.lastSeq` from the **database row** (`:303-306`).
  - The signature is checked over the bytes of `manifest.json` in storage
    (`:310-314`). The content of those bytes, including their `chainHead`, `lastSeq` and the
    checksum of the exported log, is never parsed or compared to anything.
  - `artifactChecksums.eventsLog.sha256` is never recomputed at verify time either.
- Attack, database access only:
  1. Rewrite rows in `observations` (for example change `llr`, delete inconvenient rows).
  2. Recompute `prevHash` and `hash` from genesis. The genesis is
     `sha256("veritrust:" + sessionId)` and the algorithm is in the source
     (`evidence.service.ts:27-29,53-64`).
  3. Update `evidence_manifests.chainHead` and `lastSeq` to the new head.
  4. `verifySession` returns `chainValid: true` (recomputed equals the edited DB row) and
     `signatureValid: true` (untouched storage files still verify). `valid: true`.
  The `signature` column in the database is not used for verification at all.
- The pipeline's own SealVerify step calls the same function
  (`backend/src/pipeline/steps/seal-verify.step.ts:14-20`), so it inherits the gap.
- A storage-only attacker can replace `events.ndjson.gz` undetected for the same reason. Replacing
  `manifest.json` requires the key.
- Mitigation (cheap): in `verifySession`, parse the signed `manifest.json`, then require its
  `chainHead`, `lastSeq` and `artifactChecksums` to equal the recomputed chain and the actual
  stored log's SHA-256, and ignore the database copy.

#### EV-2. What the signature actually proves (Design limitation)

- It proves that the holder of one Ed25519 key signed a JSON manifest containing a chain head, a
  last sequence number, an exported-log checksum, version strings and a `sealedAt` the server wrote
  itself (`evidence.service.ts:227-244`).
- It does not prove: that the observations are truthful (they are client-reported), that none were
  dropped before sealing (sequence numbers are assigned by the server, so a dropped batch leaves no
  gap; see the schema audit F1), when the seal happened (no external timestamp), or that the
  session was not re-sealed. Step 8 can be re-run and overwrites an existing manifest row
  (`:246-272`).
- Mitigation: anchor the manifest hash externally (a timestamping service or an append-only log),
  and record dropped-batch counters inside the signed manifest.

#### EV-3. Where the key lives (Design limitation, Needs a precondition: host or env access)

- `EVIDENCE_SIGNING_PRIVATE_KEY` is a base64 PKCS#8 PEM in an environment variable, loaded into the
  API and worker processes (`backend/src/providers/index.ts:40-45`, `env.ts:59`). It is the same
  trust domain as the database, Redis and storage: anyone who can read the environment or process
  memory of either service can sign any manifest.
- `npm run keys:generate` prints the private key to stdout
  (`backend/scripts/generate-signing-key.ts:6-8`).
- Sealing depends on it: with no key, `getSigner()` throws and the seal fails, aborting the session
  (`seal.service.ts:143-155`).
- The `Signer` interface is synchronous (`backend/src/providers/signer/signer.ts:7-11`), so moving
  to a KMS or HSM needs an interface change (see the lock-in audit).
- Mitigation: sign in a KMS or HSM whose key cannot be exported, with the signing service isolated
  from the database credentials.

#### EV-4. One key, no keyring, no public verification (Design limitation)

- Verification requires `manifest.signingKeyId === signer.keyId`
  (`evidence.service.ts:314`) using the single configured key, and the public key is not published
  or exported anywhere. After a rotation every previously sealed session fails verification, and no
  third party can verify anything without asking this server to verify itself.
- Mitigation: a keyring of retired public keys keyed by `signingKeyId`, and an endpoint or bundle
  that lets an outside party verify a manifest offline.

#### EV-5. The chain is not a secret-keyed structure (Design limitation)

- The chain uses plain SHA-256 with a public genesis, not an HMAC or a signature per row. Anyone
  with write access can regenerate a fully consistent chain (EV-1 step 2). The chain only detects
  accidental or naive edits.
- The hashed tuple leaves out `llr`, `clientTs`, `receivedAt` and `id`
  (`evidence.service.ts:53-64`), and `llr` is the score-bearing column
  (`integrity-rescore.step.ts:98-104`), so an `UPDATE` of `llr` is not even a naive-edit break.
  Flags, adjudications, warnings and unscored windows are outside the chain.
- The database does not enforce append-only: no trigger, no `REVOKE`, and the compose file uses
  the superuser (see the schema audit F9).

#### EV-6. Live-time truncation is invisible (Exploitable when Redis loses the chain head)

- The chain head lives in Redis; a lost or stale key makes every later insert collide on
  `(sessionId, seq)` and the batches are dropped and logged
  (`evidence.service.ts:31-38,82-83`, `session-runtime.ts:238-242`). Seal then verifies and signs
  the truncated chain. Full detail in the schema audit, finding F1.

#### EV-7. Answer to "can the chain be rewritten by anyone with database access?"

Yes, undetectably (EV-1), and no signing key is required. With the signing key, an attacker on the
API host can also rewrite storage and re-sign, and there is no external timestamp to contradict
them. As built, tamper-evidence holds against accidental corruption and casual edits, not against
an insider.

---

## 3. Other findings

### 3.1 Authentication bypass

#### AU-1. Access-token claims are not validated (Needs a precondition: shared or leaked secret)

- `verifyAccessToken` returns `payload.sub`, `orgId` and `role` without checking they exist or are
  valid (`backend/src/utils/jwt.ts:26-33`). A token that verifies but lacks `orgId` produces
  `orgId: undefined`, and Prisma treats `undefined` in a `where` as no filter. The report list
  (`report.service.ts:92-106`) and other org-scoped list queries would then return rows from every
  org. `requireSessionAccess` would also match any org's session at
  `backend/src/middlewares/session-access.ts:18`, though the binding lookup that follows would
  fail for an undefined user, so that particular route is protected by accident.
- Triggers: anyone who can sign with `JWT_ACCESS_SECRET`, or an operator who reuses one secret for
  the access, join and candidate tokens. A join token is handed to the candidate by email and has
  no expiry or audience (`jwt.ts:45-51`), so under a shared secret it would verify as an access
  token. `keys:generate` produces distinct values, but nothing enforces distinctness.
- Mitigation: validate claims with a schema, assert the three secrets differ at boot, add `aud`,
  `iss` and a token type claim, and pin `algorithms`.

#### AU-2. Open registration without email verification enables account pre-hijack (Exploitable today)

- `POST /auth/register` creates a user and an org for any email with no verification
  (`backend/src/services/auth.service.ts:52-81`). `addMember` attaches an existing user by email
  (`backend/src/services/org.service.ts:37-50`).
- An attacker registers a colleague's address first; when an admin later invites that address, the
  attacker's account receives the role. The real colleague's own registration fails with a conflict.
- Mitigation: verify email ownership before an account can be attached to an org, or invite by
  signed link instead of by address.

#### AU-3. User enumeration (Low, exploitable today)

- `register` returns a distinct conflict for an existing email
  (`backend/src/middlewares/error-handler.ts:44-48`). `login` returns before the password hash for
  an unknown email, so it is measurably faster (`auth.service.ts:88-96`). `addMember` says
  "No user with this email exists" (`org.service.ts:39-42`).
- Mitigation: uniform responses, and always run one hash verification on login.

#### AU-4. Revoked access keeps working (Exploitable today)

- The role and org come from the JWT and are trusted for its 15 minute life
  (`backend/src/middlewares/org-role.ts:5-18`, `jwt.ts:5`). Removing a member deletes their
  membership but revokes nothing (`org.service.ts:75-79`).
- Interviewer sockets authenticate once at the handshake
  (`sockets/index.ts:48-60`); access to a session is checked only at `session.join`
  (`:63-87`). Removing a user from an org or unbinding an interviewer from a session
  (`session.service.ts:212-225`) does not remove their socket from the session room, so they keep
  receiving live flags, integrity ticks and transcript until the socket drops.
- Mitigation: on membership or binding change, disconnect the user's sockets and revoke their
  refresh tokens; re-check access on a timer.

#### AU-5. The join token is a non-expiring bearer secret and is logged (Low, exploitable today)

- The join JWT has no expiry and is validated against the database on every call
  (`jwt.ts:41-51`, `middlewares/join-token.ts:12-43`), which is sound for revocation. But the
  access log records `req.url` (`backend/src/app.ts:29-32`), and the token is in the path
  (`/api/v1/join/<token>`). Anyone with log access can use an unconsumed reusable link. The
  logger's `redact` list covers headers and body fields, not the URL (`logger.ts:7-17`).
- Mitigation: log route templates instead of raw paths, or redact the token segment.

### 3.2 Role enforcement

#### RE-1. Read-level roles can trigger write actions (Medium, exploitable today)

- `POST /sessions/:id/report/recompute` uses read access (`session.routes.ts:103-108`), so a
  REVIEWER, described in the same file as "read-only across the product" (`:55`), or any bound
  interviewer can enqueue a full pipeline run. It has no limiter, and every call creates a new run
  and eight jobs (`backend/src/pipeline/flow.ts:150-185`).
- `GET .../evidence/verify` writes `verifiedAt` (`evidence.service.ts:320`), a state change on a
  GET.
- Mitigation: require write access, rate limit per session, and make recompute idempotent.

#### RE-2. Session-binding is bypassed by org-wide lists (Medium, exploitable today)

- The per-session rule (interviewers only see sessions they are bound to) is enforced on
  sub-resources, but `GET /sessions` lists every session in the org with candidate name and email
  to any role (`backend/src/services/session.service.ts:122-141`). `GET /candidates` and
  `GET /candidates/:id` return every candidate in the org, with phone, location, bio, notes, and
  each session's composite and integrity scores, to any role
  (`backend/src/routes/candidate-directory.routes.ts:26-30`,
  `backend/src/services/candidate-directory.service.ts:244-294`). The stricter check in
  `assertReportAccess` (`report.service.ts:50-60`) is therefore side-stepped.
- Mitigation: decide the intended visibility and apply one rule everywhere, or filter these
  endpoints by binding for non-privileged roles.

### 3.3 Rate abuse and resource exhaustion

- **RA-1 (Exploitable today).** Limiters are per IP only, and `passOnStoreError: true` makes them
  fail open when Redis is down (`rate-limit.ts:21`). Login has no per-account throttle, so
  credential stuffing spread across addresses is unlimited, and each attempt costs an Argon2 hash
  on the shared libuv threadpool. `trust proxy` is fixed at 1 (`app.ts:18`): behind two proxies all
  clients share one bucket, behind none `X-Forwarded-For` is spoofable. Mitigation: per-account
  and per-IP limits, fail closed for auth routes, configure proxy trust from the real topology.
- **RA-2 (Exploitable today).** Recompute is unlimited (RE-1).
- **RA-3 (Exploitable today with the docker provider).** No global sandbox concurrency or queue
  (SB-2).
- **RA-4 (Exploitable today).** A job description upload is capped at 10 MB compressed
  (`backend/src/middlewares/upload.ts:5`) but parsed by `pdf-parse` and `mammoth`
  (`backend/src/workers/jd-parse.worker.ts:12-30`) in the same worker process that runs the
  evidence pipeline, retention and link expiry (`backend/src/worker.ts:24-34`). A crafted PDF or a
  DOCX zip bomb can exhaust that process's memory, and its `unhandledRejection` handler exits
  (`worker.ts:71-74`). Mitigation: parse in a separate, memory-limited worker with a size limit on
  the decompressed output.
- **RA-5 (Exploitable today).** Sockets and the internal path have no size or count caps beyond
  1 MB per message (CT-1, IT-1).
- **RA-6 (Low).** Registration creates orgs without limit apart from 10 per minute per IP
  (`routes/auth.routes.ts:13`).

### 3.4 Injection

I found none exploitable. What I checked:

- SQL: Prisma parameterizes; the two raw queries are a constant `SELECT 1` and a tagged template
  with the LIKE wildcards escaped (`candidate-directory.service.ts:115-123`).
- OS commands: none outside the Docker API. The harness scripts interpolate only a numeric
  time limit that comes from the database (`docker.sandbox.ts:25,38`); test inputs go through
  `tests.json`, not string interpolation.
- HTML: the report template engine has `autoEscape: true` and the template has no raw-output tags
  (`backend/src/pipeline/steps/render-report.step.ts:15`, `backend/templates/report.eta`). The
  API serves the HTML from its own origin with Helmet's default CSP (`app.ts:36`).
- Paths: storage keys are built from ids and constants, and `LocalStorageProvider.resolveKey`
  rejects escapes (`backend/src/providers/storage/local.storage.ts:16-22`); the JD upload key is
  constant (`jd.service.ts:66`).
- Residual: producer-supplied payload fields reach flag narratives
  (`backend/src/live/fusion/flag-builder.ts:10-24`). They are escaped where rendered today. If
  `REPORT_PDF_ENABLED` is ever on and the template ever gains raw output, Puppeteer would render
  attacker-influenced markup server-side (`render-report.step.ts:126-138`).

### 3.5 Data exposure

- **DE-1 (Exploitable today).** Candidate names, or emails when no name is set, are sent to a third
  party. Avatars are `https://api.dicebear.com/.../svg?seed=<name or email>`
  (`frontend/lib/api/candidates.ts:84-90`, also `frontend/lib/api/org.ts:38`,
  `frontend/lib/api/auth.ts:35`, `frontend/components/interviews/table-view.tsx:211`). Every
  interviewer browser that renders a candidate list sends those identifiers to dicebear.com.
  Mitigation: render initials locally.
- **DE-2 (Needs a precondition: CDN compromise).** The candidate's code editor loads Monaco at
  runtime from `cdn.jsdelivr.net` (library default,
  `frontend/node_modules/@monaco-editor/loader/lib/es/config/index.js:3`; no loader config in
  `frontend`). That third-party script runs in the same origin that holds the candidate token and
  the telemetry reporter, with no integrity attribute and no CSP configured
  (`frontend/next.config.mjs`). Mitigation: self-host Monaco and add a CSP.
- **DE-3.** The join token in logs (AU-5).
- **DE-4 (Deployment-dependent).** Unauthenticated Redis and default database credentials in the
  only compose file (IT-2).
- **DE-5 (Low, by design).** `GET /join/:token` returns session title, org name and interviewer
  names to any holder of a valid link (`join.service.ts:87-102`).
- `/health` and `/ready` are unauthenticated and return only up or down for the database and Redis
  (`backend/src/services/health.service.ts:28-33`).

### 3.6 Supply chain and hygiene

- No CI, so no automated dependency or secret scanning. `npm audit` reports three findings that the
  docs record as left unfixed because the fixes need `--force`
  (`backend/docs/Memory.md:372`, `backend/docs/REMAINING_WORK.md:60`); the docs say they are in the
  Prisma CLI's unused MySQL path and in `uuid` under `dockerode`. I did not re-run the audit.
- Secrets: only `.env.example` and `.env.test.example` are tracked, with empty values;
  `.env` is ignored (`backend/.gitignore`). No committed key material.
- The production image runs as a non-root user (`backend/Dockerfile`).
- `frontend` has two Next config files (`next.config.mjs` and `next.config.ts`), which is
  ambiguous about which one applies.

---

## 4. Findings register

| ID | Finding | Category | Severity | Status | Mitigation (one line) |
|---|---|---|---|---|---|
| CB-1 | One `cv.batch` message crashes the API process (new) | Availability | Critical | Exploitable today (needs a LIVE session) | Bound `ts`; try/catch every socket listener |
| EV-1 | Verify does not bind signature to data | Evidence | High | Exploitable with DB write | Compare parsed signed manifest to recomputed chain and log hash |
| CT-7 | Candidate token works after seal | Client trust | High | Exploitable today | Require LIVE for run and submit |
| CT-1 | Telemetry forge, suppress, replay | Client trust | Critical (design) | Exploitable today | Independent signals; treat telemetry as a hint; caps |
| CT-2 | Client timestamps drive decay | Client trust | High | Exploitable today | Clamp to receivedAt; bound clock offset |
| CT-3 | Client-supplied baseline and negatives | Client trust | High | Exploitable today | Server-side rate limits; no client "clean" credit |
| CT-4 | Deltas, snapshots, code not reconciled | Client trust | High | Exploitable today | Rebuild document server-side and compare |
| CT-5 | Preflight and media-ready self-attested | Client trust | Medium | Exploitable today | Gate on real provider verification |
| CT-6 | Second socket ends the session | Client trust | Medium | Exploitable today | Count sockets; clear old timer; one socket per token |
| CT-8 | `session.violation` ends any LIVE session; lockdown is client-side (new) | Client trust | High | Exploitable today | Treat as advisory; corroborate server-side |
| CT-9 | Empty-session guard defeated by one message; hangs on a Redis key (new) | Client trust | Medium | Exploitable today | Derive from the database |
| CV-1 | Camera analysis reported by the candidate's browser (new) | Client trust | High | Exploitable today | Server-side analysis or label as candidate-reported |
| RTC-1 | P2P media is candidate-controlled; TURN credential in bundle (new) | Client trust | Medium | Exploitable today | Server capture path; short-lived TURN credentials |
| IT-1 | Leaked service token capabilities | Internal token | High if leaked | Needs a precondition | Scoped short-lived producer tokens; allow-lists |
| IT-2 | Unauthenticated Redis pub/sub bridge | Data/infra | Medium | Deployment-dependent | Redis AUTH, private network, validate payloads |
| SB-1 | Shared-kernel boundary, daemon is root | Sandbox | High | Needs a precondition | Separate disposable host or microVM |
| SB-2 | Missing hardening, no output or concurrency cap | Sandbox | Medium | Exploitable today (docker provider) | Drop caps, non-root, caps, pin images |
| SB-3 | Harness shares context with candidate code | Sandbox | Low | Exploitable today (docker provider) | Separate user or process for tests |
| SB-4 | Default sandbox passes everything | Sandbox | High for scoring | Exploitable today (default) | Real runner before scores mean anything |
| SB-5 | Docker provider cannot run on managed hosting | Sandbox | Medium | Deployment-dependent | Separate execution service |
| SB-6 | Language key on object literal | Sandbox | Low | Exploitable today | `Map`; check against task |
| SB-7 | `local` provider: no isolation, allowed in production (new) | Sandbox | Critical if selected | Exploitable when selected | Refuse `local` in production |
| EV-2 | Signature proves little | Evidence | Medium | Design limitation | External timestamp; drop counters in manifest |
| EV-3 | Key in env, same trust domain | Evidence | High | Needs a precondition | KMS or HSM, isolated signer |
| EV-4 | Single key, no keyring, no public verify | Evidence | Medium | Design limitation | Keyring and offline verification |
| EV-5 | Unkeyed chain; `llr` unhashed; not append-only in DB | Evidence | Medium | Exploitable with DB write | Hash all score fields; revoke UPDATE/DELETE |
| EV-6 | Truncation invisible | Evidence | High | Needs a Redis event | See schema audit F1 |
| AU-1 | Unvalidated access-token claims | Auth | Medium | Needs a precondition | Validate claims; distinct secrets; aud/iss |
| AU-2 | Registration pre-hijack | Auth | Medium | Exploitable today | Verify email; invite by signed link |
| AU-3 | User enumeration | Auth | Low | Exploitable today | Uniform responses and timing |
| AU-4 | Revoked access persists (JWT and sockets) | Auth | Medium | Exploitable today | Disconnect sockets; revoke refresh tokens |
| AU-5 | Join token in logs | Auth/Data | Low | Exploitable today | Redact path token |
| RE-1 | Read roles trigger recompute; GET writes | Roles | Medium | Exploitable today | Require write; rate limit |
| RE-2 | Org-wide lists bypass session binding | Roles | Medium | Exploitable today | One visibility rule |
| RA-1 | Per-IP fail-open limits; no account throttle | Rate | Medium | Exploitable today | Per-account limits; fail closed |
| RA-4 | JD parser can take down the shared worker | Rate | Medium | Exploitable today | Isolate and cap parsing |
| DE-1 | Names and emails sent to dicebear.com | Data | Medium | Exploitable today | Local initials |
| DE-2 | Monaco from a public CDN, no CSP | Data/supply | Medium | Needs a precondition | Self-host; add CSP |

---

## 5. What holds up

Checked and found sound, so you know where I looked:

- Refresh tokens are opaque, stored hashed, rotated on use, with family revocation on reuse
  (`auth.service.ts:117-145`); the cookie is `httpOnly`, `sameSite: strict`, path-scoped, `secure`
  in production (`backend/src/controllers/auth.controller.ts:12-20`); the access token lives only
  in memory in the browser (`frontend/lib/api/client.ts:29`).
- Join tokens are re-checked against the database on every call for revocation, consumption and
  expiry (`middlewares/join-token.ts:12-43`). Candidate tokens carry an audience and require a
  matching consent row.
- Cross-org access to sessions returns 404, not 403, and the services I read scope by
  `{ id, orgId }`.
- Candidates are never sent scores, flags or hidden tests: the candidate event allow-list is
  explicit (`sockets/events.ts:22-29`) and the task endpoint strips `hiddenTests`
  (`coding.service.ts:11-27`). Hidden-test expected outputs stay on the host (SB-3).
- The service token comparison is constant time (`service-token.ts:11`).
- The new `assignLiveTask` checks org, task ownership and LIVE status
  (`backend/src/services/coding.service.ts:168-188`), and the new `open-room` and `tasks` routes
  require write access (`session.routes.ts:62,93`). The WebRTC signalling relay validates input,
  overwrites `from` and scopes delivery by room (RTC-1), and `cv.status` values are schema-bounded
  (`events.ts:56-62`).
- The error handler does not leak stacks (`error-handler.ts:73-74`). Request ids are validated
  before reuse (`middlewares/request-id.ts:5-10`).
- Only `.env.example` files are committed, with empty values.

## 6. What I did not check

- **Nothing was executed.** No traffic, no exploit attempts, no fuzzing. Every finding is from
  reading.
- **Not read in full:** `session.controller.ts` beyond the routes, `coding-task.service.ts`,
  `question-bank.service.ts`, `suggestion.service.ts`, `calibration.ts`, `link.controller.ts`,
  `flag.controller.ts`, `org.controller.ts`, `composite-score.step.ts`, `answer-grading.step.ts`,
  `media-index.step.ts`, `MockLlmProvider`, `SmtpMailProvider`, and the rest of the frontend beyond
  `lib/candidate/*`, `lib/api/client.ts`, `candidate-room.tsx`, `candidate-editor.tsx` and
  `candidate-panel.tsx`.
- **Depth of the delta review.** For code added since `f3b7b4d` I read the backend diff in full and,
  on the frontend, `cv.ts` (first 80 lines), `rtc.ts` (first 70 lines), `lockdown.ts`,
  `test-mode.ts` and the `candidate-room.tsx` diff. I did not read the rest of `cv.ts`,
  `lib/live/rtc.ts`, `use-live-video.ts` or the changed interviewer-side components, and I did not
  inspect the MediaPipe model files.
- **No production configuration exists in the repo.** TLS termination, proxy topology, Redis and
  Postgres exposure, secrets management and container runtime settings are unknown, so the
  deployment-dependent items are judged against the dev compose file only.
- **Dependencies:** I did not run `npm audit` or review lockfiles; I relied on the documented
  results.
- **Socket.IO limits:** the 1 MB message default was read from `node_modules`; I did not confirm
  that no reverse proxy changes it.
- **LiveKit webhooks:** `Architecture.md:526` lists a webhook signature check, but no webhook route
  exists in the code, so there is nothing to audit there.

I have not acted on any of this and have opened no follow-up.
