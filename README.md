<h1 align="center">Hiring Guard</h1>

<p align="center">
  An interview-integrity platform that turns behavioural telemetry into an explainable score and a list of flags, never a verdict.<br/>
  Show the evidence. Leave the decision to a person.
</p>
<p align="center">
  <a href="#getting-started"><b>Get started</b></a> ·
  <a href="#evidence-fusion"><b>Evidence fusion</b></a> ·
  <a href="#architecture"><b>Architecture</b></a> ·
  <a href="#key-results"><b>Key results</b></a> ·
  <a href="#limitations"><b>Limitations</b></a> ·
  <a href="#roadmap"><b>Roadmap</b></a>
</p>
<div align="center">

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](frontend/package.json)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](backend/package.json)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)](backend/package.json)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](ml/pyproject.toml)
[![mypy](https://img.shields.io/badge/mypy-strict-2A6DB2)](ml/pyproject.toml)

</div>

---

## Overview

Remote interviews are easy to game: a phone held below the frame, a second face leaning into view, a tab switch, an answer pasted from another window. Hiring Guard watches for those signals in the candidate's browser during a live interview and reports what it saw. It produces an integrity score and a list of flags. It does not decide anything. A flag is a reason for a reviewer to look, and the score is built from the same evidence.

The system has three parts. A Next.js frontend serves the interviewer, the reviewer and the candidate. An Express and Prisma backend runs the live session, the evidence pipeline and the reports. A Python package, `vtml`, is the lab where the fusion model is specified, tested and calibrated. The lab and the live backend implement the same model twice, and this README lists where they differ.

Every fusion result below comes from synthetic data, and no number here is an accuracy figure (see [Key results](#key-results)). Three things the system has slots for do not exist: audio analysis, identity matching and recording. [Limitations](#limitations) covers them first.

## Design

The interface has no red token. The palette is six colours defined in [frontend/tailwind.config.ts](frontend/tailwind.config.ts): sand, clay, sage, amber, terra and slate. The danger colour is terra, a burnt clay. The integrity gauge reads sage at 85 and above, amber from 70 to 84, terra below 70, and sand while a session is still calibrating. Those thresholds are hard-coded in [the gauge component](frontend/components/ui/integrity-gauge.tsx), so the band is a display choice and does not come from the engine.

The interface draws a period with no usable signal as sand with a hatch, never as a low score. Flag severity uses a dot shape (solid, centred or hollow) plus a text label, so colour is never the only way to tell a high flag from a low one.

## Features

- **Live sessions.** Candidates join over Socket.IO. In the candidate's browser, MediaPipe runs a face landmarker (face count, absence, gaze) and an object detector (phone, book, laptop or remote in view). A monitor checks that the shared screen stays a whole monitor. The page also reports focus, paste, pointer, typing-rhythm, display and network events. The camera and screen analysis runs in the browser, and only its results reach the server.
- **Interview call.** Interviewer and candidate talk over WebRTC. Signalling runs over Socket.IO, and the media flows between the two browsers, through a TURN relay when one is configured. The API server does not receive it.
- **Speech-to-text.** Each browser transcribes its own microphone with the Web Speech API (Chrome and Edge, English only). In those browsers the vendor's cloud recogniser receives the audio. The server stores the text, labels the speaker by the socket it arrived on, and pairs interviewer questions with candidate answers for grading.
- **Explainable flags.** Every flag lists the observations behind it.
- **Reviewer adjudication.** Reviewers can dismiss or downgrade a flag. In the lab, dismissing a flag removes only that flag's evidence and the score recomputes from the rest. In the backend, the rescore step at report time drops a dismissed flag's evidence and halves a downgraded flag's.
- **Neutral candidate warnings.** Candidates see templated, non-accusatory warnings. They never see a score or the detail of a flag.
- **Interview kit.** Coding tasks and a question bank. Candidate code runs in a per-run Docker container with no network, a read-only root filesystem, 256 MB of memory, one CPU and 128 processes (Python and JavaScript only). That sandbox is opt-in: the default provider is `mock`, which runs no code and passes every test on a non-empty submission.
- **LLM assist.** Job-description parsing, question suggestions and answer grading go through an LLM provider. The default is `mock`, a keyword and length heuristic. The `groq` provider is real and needs `GROQ_API_KEY`, and the deploy example sets `LLM_PROVIDER=groq`.
- **Reports.** A signed evidence report per interview (Ed25519). HTML is always produced and PDF is an option.
- **Calibration lab.** Golden fixtures, a prior-sensitivity sweep and a fitted weights artifact that the backend can adopt.

## Evidence fusion

Each observation carries a log-likelihood ratio (LLR). LLRs accumulate per channel, and a signal that a second channel confirms inside a short window counts for more. The score falls as accumulated evidence rises.

The model exists twice. The lab in `ml/src/vtml` is the specification: it has the clamping, duration scaling and damping, and it computes exact leave-one-out flag deltas. The live scorer in `backend/src/live` is the running system and is simpler in several places.

### What the lab does in specific situations

These rows come from the demo replay (`python -m vtml.replay --speed 0`), the engine config and a minimal two-observation session. They do not come from the design documents.

| Situation | Lab behaviour | Result |
| --- | --- | --- |
| First 60 seconds | Observe-only window. Background noise feeds the baseline and nothing is scored. | Score reads 97.13, clear, when calibration ends |
| A single gaze glance | Accumulates, raises no flag. | 96.52, clear, no flag |
| Gaze and scene agree within 6 s | The boost fires and a flag is emitted. | `scene.multiple_faces`, medium, "corroborated by gaze", 34.40, delta -56.43 |
| Repeats on one channel | Same-channel damping of 0.6. | Repeats add less than the first hit |
| Reviewer dismisses the flag | Only that flag's evidence is removed. | 90.83, not back to 96.52 |
| A channel goes dark | An unscored window opens. Absence is never evidence. | 93.25 before and after the gap |
| A dropped connection | A `network.telemetry_gap` 2 s before a 4 s `scene.face_absent` cannot corroborate it. | 93.5889 with and without the gap, cost 0.0 points, no flag |

Before the corroboration fix, the same two observations scored 90.9148 and raised a flag narrated "corroborated by network". An honest candidate's dropped connection cost 2.674 points and manufactured a flag. A channel with zero weight, which `network` has by design, can no longer corroborate another channel. `test_zero_weight_channel_cannot_corroborate` in [ml/tests/test_corroboration.py](ml/tests/test_corroboration.py) pins the rule, and `test_dropped_connection_costs_the_honest_session_nothing` in [ml/tests/test_replay_golden.py](ml/tests/test_replay_golden.py) checks that removing the noisy fixture's real telemetry gaps leaves its score unchanged. This is a lab result. The live scorer does not have the rule (see [Limitations](#limitations)).

### Lab and live compared

| | Lab (`ml/src/vtml`) | Live (`backend/src/live`) |
| --- | --- | --- |
| Channels | 6: gaze, audio, scene, focus, input, network | 11, of which audio and identity never receive an observation |
| Score | `100 / (1 + exp(1.6 (S - m)))`, m = 3.2 / 2.2 / 1.5 | `min(100, 200 / (1 + exp(S / sigma)))`, sigma = 6 / 4 / 3 |
| Sensitivity tiers | LENIENT / STANDARD / STRICT | LOW / STANDARD / HIGH |
| LLR handling | Clamped to [-1, 4], log-saturating duration scaling, same-channel damping 0.6 | No clamp, no scaling, no damping |
| Clean-behaviour evidence | None | 3 of 19 LLR rows (focus resume -0.4, pointer return -0.2, rhythm normal -0.3), accumulator floor -2 |
| Baselines | Gaze and rhythm | Rhythm only (KS test) |
| Corroboration | A zero-weight channel cannot corroborate | Any channel with a positive observation inside the window corroborates, including a network anomaly |
| Flag trigger | One boosted LLR of 0.8 or more | A channel accumulator crosses its threshold upward (3 for STANDARD; 2.5 for paste and identity; 4 for pointer and environment) |
| Flag delta | Exact leave-one-out | Single-observation before and after; merged flags sum |
| Calibration window | Observe-only, nothing accumulates | Evidence accumulates; only flags and warnings are held back |

Both share a 6 s corroboration window, a boost of 0.45 per extra channel, a cap of 2.35 and a 15 s flag merge window.

The calibration-window row is a known divergence. On the `honest_seed7` fixture the lab scores 94.28 with the window observe-only and 93.11 when its evidence accumulates, so the leak costs 1.17 points there. The live size is unmeasured.

### Ethics are tests

Seven tests in [ml/tests/test_ethics.py](ml/tests/test_ethics.py) hold the model to its promises:

1. No boolean field on a result or a flag has a verdict-style name (cheat, verdict, guilty, pass, fail).
2. Absence is never evidence: suppressing a channel for a stretch never lowers the score, and the gap appears as an unscored window.
3. A flag's score delta can be rebuilt to within 1e-9 by replaying the observations up to that flag and removing its contribution.
4. Narrative templates contain no banned word.
5. No text enters the engine: an observation with a string feature, such as a transcript, fails validation.
6. Every result carries its `weights_version`, its `calibration` status and its `unscored` windows.
7. Dismissing any subset of flags can only raise the score.

The backend schema has no verdict-like field either. In the composite step (`composite-score.step.ts`), an integrity score below 70 sets the composite to null and marks the interview as needing review. From 85 up the integrity modifier is full marks, and from 70 to 85 it rises in proportion to the distance above 70. The step also returns null with a review flag when an input is missing (see [Limitations](#limitations)).

### The artifact seam

`ml/` is the offline lab and `backend/src/live/` is the only live scorer. There is no network integration between them. One JSON file crosses at startup: the lab fits LLR magnitudes and writes [ml/weights/weights.json](ml/weights/weights.json), and `backend/src/config/calibrated-weights.ts` reads it. The switch is `CALIBRATED_WEIGHTS_ENABLED`, which defaults to false, and the deploy Compose file pins it to false.

The current artifact is `phase3-synthetic-1`, with `dataset.kind` set to `synthetic`: 1,025 rows from 30 synthetic sessions (10 honest, 20 staged), 80 positives. Four detector types are fitted and twelve stay on priors, each with a recorded reason ("not present in the calibration set" for ten, "only 0 positives, needs 15" for two).

At STANDARD sensitivity, the backend adopts four values:

| Backend detector | Hand-set | Adopted | Lab prior for the fitted type |
| --- | --- | --- | --- |
| `focus_loss` | 1.20 | 1.042 | 1.10 |
| `gaze_away` | 1.10 | 1.295 | 1.40 |
| `multiple_faces` | 1.70 | 1.207 | 2.00 |
| `paste_large` | 1.60 | 1.509 | 1.80 |

Three rules govern the seam:

- Only per-detector LLR magnitudes cross. The backend takes each fitted curve's value at its operating point, and the artifact's `channel_weights` are parsed away by the backend's zod schema and never used.
- A backend type is adopted only when exactly one fitted lab type maps to it in [contracts/detector-registry.json](contracts/detector-registry.json). Three lab gaze types map to `gaze_away` and one of them is fitted, so `gaze_away` is adopted.
- With the flag on, a missing, invalid or newer-schema artifact stops the API at startup with a message that names the resolved path. The API never falls back to the hand-set table in that state. The report builds at boot, so the log line that says the weights are "fitted on SYNTHETIC fixtures" appears then. Nothing surfaces the calibration provenance in `/ready` or in reports.

LOW and HIGH keep their hand-set ratios. Adopting the fit raises `gaze_away` from 1.10 to 1.295, while in the lab the same fit lowered it from a prior of 1.40. The two implementations disagree on direction there, which is the reconciliation gap listed in the [Roadmap](#roadmap).

## Architecture

```mermaid
flowchart LR
    C[Candidate browser<br/>MediaPipe, screen monitor, focus, paste, pointer, network, speech-to-text] -- Socket.IO --> L
    subgraph B[Backend]
        L[Live layer<br/>ingest, detectors, fusion, warden]
        P[Pipeline and workers<br/>BullMQ, grading, reports, evidence signing]
        L --> P
    end
    L -- neutral warnings --> C
    R[Interviewer and reviewer UI<br/>speech-to-text] -- REST and Socket.IO --> B
    C -. WebRTC video call .- R
    B --- D[(Postgres 17)]
    B --- Q[(Redis 7)]
    B -. Docker socket .-> S[Sandbox containers<br/>per run, no network]
    B -. optional .-> G[Groq LLM API]
    ML[vtml lab<br/>goldens, sweep, calibration] -- weights.json --> L
    K[[contracts/detector-registry.json]] -.-> L
    K -.-> ML
```

```
hiring-guard/
├── frontend/     Next.js app: interviewer, reviewer and candidate views, in-browser CV, speech-to-text
├── backend/      Express API, live session runtime, pipeline, workers, Prisma schema
│   └── src/live/   ingest, detectors, fusion, warden, session runtime
├── ml/           vtml: fusion model, fixtures, sweep, calibration, ethics tests
│   └── weights/    fitted artifact read by the backend
├── contracts/    detector-registry.json shared by both sides
├── deploy/       production Compose file: Caddy, coturn, frontend, API, worker, Postgres, Redis
└── docs/         deployment guide, cross-component architecture and audits
```

## Tech stack

| Layer | Tools |
| --- | --- |
| Frontend | Next.js ^16.3, React ^18.3, Tailwind ^3.4, Zod ^3.23, TypeScript ^5.6, Monaco editor, `@mediapipe/tasks-vision` |
| Backend | Express ^5.2, Prisma ^7.10 with the pg adapter, Zod ^4.6, Socket.IO ^4.8, BullMQ ^6.3, ioredis ^6, argon2, jose, Eta ^4.6, dockerode, Puppeteer (optional), TypeScript ^7.0, Vitest ^5 |
| Browser APIs | WebRTC, Web Speech API (Chrome and Edge), MediaPipe face landmarker and object detector |
| Evidence | Ed25519 signing of evidence reports |
| Data | Postgres 17, Redis 7, Mailpit for local email |
| Optional services | Groq API for the LLM provider, Docker for the code sandbox |
| Deploy | Docker Compose with Caddy 2.10 and coturn 4.6 |
| Lab | Python 3.11 or newer with pydantic 2.5 or newer and numpy 1.26 or newer at runtime. Development adds pytest, pytest-benchmark, scikit-learn, pandas, matplotlib, mediapipe, opencv-headless and mypy. |

## Getting started

You need Node 22 or newer, Python 3.11 or newer (developed on 3.12), and Docker with Compose.

```bash
git clone https://github.com/YashGupta2116/hiring-guard.git
cd hiring-guard
```

### Backend

```bash
cd backend
docker compose up -d
npm install
cp .env.example .env
npm run keys:generate
```

`keys:generate` prints six lines: `EVIDENCE_SIGNING_PRIVATE_KEY`, `EVIDENCE_SIGNING_KEY_ID`, `HASH_PEPPER`, `JWT_ACCESS_SECRET`, `JOIN_TOKEN_SECRET` and `CANDIDATE_TOKEN_SECRET`. Paste them into `.env`. It does not print `INTERNAL_SERVICE_TOKEN`, and `.env.example` leaves it empty. The API exits with "Invalid environment variables" until you set it to a value of at least 32 characters:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then generate the client, apply the migrations and seed the database:

```bash
npm run db:generate
npm run db:deploy
npm run db:seed
```

Start the API on port 9000 and, in a second terminal, the worker:

```bash
npm run dev
```

```bash
npm run worker
```

Check that it is up:

```bash
curl http://localhost:9000/api/v1/ready
```

The response is `{"data":{"db":"ok","redis":"ok"}}`. The seed creates a demo organisation with two logins, `owner@demo.veritrust.local` and `interviewer@demo.veritrust.local`, both with the password `demo-password-1234`. It also creates three coding tasks and 20 question-bank items. The coding tasks carry placeholder tests and the questions are numbered demo text.

Compose starts Postgres, Redis and Mailpit (SMTP on 1025, web UI on 8025). The `api`, `worker` and `migrate` services only start under `--profile app`.

The LLM provider, the sandbox provider and the calibrated weights are off by default. To switch them on, set these in `backend/.env`:

- `LLM_PROVIDER=groq` with a `GROQ_API_KEY`.
- `SANDBOX_PROVIDER=docker`. The API host needs a Docker daemon, and the first run pulls `python:3.12-alpine` and `node:20-alpine`.
- `CALIBRATED_WEIGHTS_ENABLED=true` to adopt the fitted artifact (see [The artifact seam](#the-artifact-seam)).

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The app runs on port 3000 and calls `http://localhost:9000/api/v1` by default. Set `NEXT_PUBLIC_API_URL` to change that.

### Lab

```bash
cd ml
python -m venv .venv
source .venv/bin/activate        # Windows Git Bash: source .venv/Scripts/activate
pip install -e ".[dev]"
pytest
mypy
python -m vtml.replay --speed 0
```

The last command replays the demo session shown in [Evidence fusion](#what-the-lab-does-in-specific-situations).

scikit-learn's `_pairwise_fast` DLL is blocked by Windows Application Control on some machines, which makes `test_calibrate.py` uncollectable there.

### Checks

```bash
cd backend && npm run typecheck
cd frontend && npm run typecheck && npm run build && npm run lint
```

`npm run lint` exits 1 today because of nine open errors (see [Limitations](#limitations)).

The backend tests need Postgres and Redis running and a migrated test database. Compose creates an empty `veritrust_test` database when it first initialises the Postgres volume, and nothing migrates it, so point Prisma at it first:

```bash
cd backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/veritrust_test" npm run db:deploy
npm test
```

### Deploy

[deploy/docker-compose.yml](deploy/docker-compose.yml) runs Caddy, the frontend, coturn, the API, the worker, Postgres and Redis on one host, and [docs/AWS_LIGHTSAIL_DEPLOYMENT.md](docs/AWS_LIGHTSAIL_DEPLOYMENT.md) walks through a Lightsail server. Copy `deploy/.env.production.example` to `deploy/.env.production` and fill it in. Three host prerequisites are easy to miss:

- **Sandbox temp directory.** The API container runs as uid 1001 and hands this directory to the host Docker daemon as a bind-mount source, so it must exist at the same path on the host and be writable by that uid. Compose mounts it whether or not `SANDBOX_PROVIDER` is `docker`.

  ```bash
  sudo mkdir -p /var/lib/veritrust-sandbox-tmp
  sudo chown 1001:1001 /var/lib/veritrust-sandbox-tmp
  ```

- **Firewall.** coturn needs UDP 3478 and UDP 49160 to 49200 in addition to TCP 80 and 443. The Lightsail guide opens only TCP 80 and 443.
- **Docker group.** Compose requires `DOCKER_GID` (`getent group docker | cut -d: -f3`) so the API container can reach the host Docker socket.

## Key results

All counts below were measured on 2026-09-20 at commit `8103746`, by running the commands in [Getting started](#getting-started). All lab data is synthetic.

### Checks

| Check | Result |
| --- | --- |
| `ml`: pytest | 167 passed |
| `ml`: mypy (strict) | No issues in 34 source files |
| `backend`: typecheck | Clean |
| `frontend`: typecheck | Clean |
| `frontend`: production build | Succeeds |
| `frontend`: ESLint | 9 errors, 12 warnings (see [Limitations](#limitations)) |

The backend test suite needs Postgres and Redis and has no count here.

### Golden fixtures

| Fixture | Score | Band | Flags |
| --- | --- | --- | --- |
| `honest_clean` | 94.61 | clear | 0 |
| `honest_noisy_camera` | 89.29 | clear | 0 |
| `staged_phone_and_glance` | 11.99 | suppressed | 3, all medium |

These are scored on the hand-set priors. On the fitted artifact the honest sessions do not change and the staged session moves to 17.01, still suppressed with 3 flags. The fit moved the staged score toward less suspicion.

### Prior sensitivity

`python -m vtml.evaluate.priors_sweep` scales each channel's priors from 0.25x to 4x in nine steps of square root of two, which gives 45 points across five channels. The nine audio points exercise nothing, because no fixture emits an audio observation. Of the other 36 points, 35 keep both verdicts: the honest fixture raises no flags and scores clear, and the staged fixture stays suppressed.

- Gaze, scene and input hold both verdicts over the full range.
- Focus holds from 0.25x to 2.83x. At 2.83x the honest session scores 87.60 and is still clear.
- Focus breaks at 4x. The honest score falls from 94.28 to 80.40, the band changes from clear to review, and no flag fires. Focus is the narrowest stable channel.

### What the numbers do not say

Every fixture is synthetic and generated for this project. Agreement between them shows that the model is consistent with itself and that its promises hold. It does not measure how often it flags a real cheater or a real honest candidate. No false-positive rate, no detection rate, no precision, no recall and no accuracy figure exists for this system, and none should be inferred from the tables above.

We declined to manufacture an accuracy number without real recorded sessions. We tested prior robustness instead: within the ranges above, the fixture verdicts do not depend on the hand-set priors, and the one exception is named.

## Design decisions

**Why a score and flags instead of a pass or fail verdict?** A behavioural signal is evidence, not proof. Glances, dropped connections and noisy cameras happen to honest people. A verdict would hide that uncertainty, and a score with traceable flags exposes it.

**Why require corroboration across channels?** One weak signal is common in honest sessions. Two channels agreeing inside a 6 s window is stronger evidence, so the boost goes to agreement and not to volume.

**Why is absence never evidence?** A dropped camera says nothing about the candidate. When a channel goes dark, both scorers open an unscored window and add no evidence from that channel while it lasts, and a lab test enforces the rule.

**Why exact leave-one-out deltas in the lab?** A reviewer reading "this flag cost 56.43 points" needs that to be true. Dismissing the flag changes the score by that amount. The deltas belong to individual flags and do not sum to the total loss.

**Why keep a lab beside the backend?** The model is easier to test, sweep and fit in a small pure-Python package than inside a live system with sockets and queues. The cost is two implementations, which the [Roadmap](#roadmap) is meant to close.

**Why ship a fitted artifact from synthetic data?** It tests the seam end to end and gives the backend a place to read real numbers once recorded sessions exist. An integration test in [backend/tests/integration/calibrated-weights.test.ts](backend/tests/integration/calibrated-weights.test.ts) drives a real session over the candidate socket and the internal producer API. It asserts that the stored LLRs are the calibrated ones and that four `focus_loss` events give one flag with a positive score delta.

## Limitations

Each item was checked against the code at commit `8103746`.

### Evidence sources that do not exist

- **Audio.** No component emits an audio observation. The engine still carries the slot. The lab weights the audio channel at 1.25, the highest in its table. The backend gives `AUDIO` a weight of 1.0, a 300 s decay and a `second_voice` LLR row, and the fitted artifact lists `audio.second_voice` on a prior of 2.2. None of that has ever changed a score. Speech-to-text produces transcript text, which is not an audio observation. The system does not detect a second voice, a whispered prompt or an off-camera helper.
- **Identity verification.** Nothing matches the candidate's face to a reference ID. The backend has an `IDENTITY` channel (weight 1.2, flag threshold 2.5) with no detector type and no LLR row behind it, so it cannot score anything.
- **Recording.** The media provider is a mock (`MEDIA_PROVIDER` accepts only `mock`). It cannot record, and its track check returns true for camera, microphone, screen and whole-monitor without looking. No video or audio is stored. When the provider cannot record, no `Recording` row is created and the session pages show "Not available". The seal marks a recording `READY` only when the provider returns an artifact, and a provider that returns none ends `FAILED`.
- **What the consent screen says.** Candidates see a bullet for each channel that has a detector. The screen also says that the interviewer can see and hear them live, that no video or audio is stored, that camera and screen checks run in their browser, that speech becomes text (with audio sent to Google or Microsoft in Chrome and Edge) and the transcript is saved instead of the audio, that code runs in a sandbox, and that evidence is kept for up to 90 days. It no longer mentions identity matching, extra-voice detection or recording.

### Known correctness gaps

- **A restarted API process stops monitoring without saying so.** The live runtime is an in-memory object, created only when the interviewer starts a session, and nothing recreates it at boot. After a restart, which includes a normal redeploy, the socket layer accepts telemetry, camera, editor and heartbeat events and discards them. Transcript batches fail with a logged error. The 1 s tick, the duration limit, the candidate-abandon timer, the producer-health check and the score snapshots are gone, so the duration limit no longer ends the session. The session stays `LIVE` in Postgres, and nothing writes an unscored window for the gap.
- **The composite score needs a graded question and answer pair.** A composite exists only with at least one graded pair, integrity of at least 70 and a successful rescore. A pair needs a final interviewer segment followed by a final candidate segment. Since `37c8279` the browsers post these through the Web Speech API, which means Chrome or Edge on both ends, English only, with segment times estimated as a fixed 3 s window. Without a pair the composite is null and the interview is marked for review. With the default `mock` LLM, grades come from a word-count and phrase heuristic, so the composite then measures answer length.
- **Two composite sub-formulas were invented during development.** `technical` averages correctness, depth and hands-on per answer and blends that 50/50 with the code pass rate. `communication` averages structure and specificity. The architecture document names the grade dimensions only for communication and gives no blend weight. Nothing confirms either formula against a spec, and the decision log in `backend/docs/Memory.md` records them as inventions.
- **`llr` sits outside the evidence hash.** Each observation's hash covers its session, sequence number, source, channel, type, timestamp and payload. It does not cover `llr` or `clientTs`. The rescore reads `llr`, so editing it in Postgres changes the score and chain verification still passes.
- **The chain head lives only in Redis.** The last sequence number and hash sit in `s:<sessionId>:chain`. If that key is lost mid-session, the next write restarts at sequence 1, the unique index on `(sessionId, seq)` rejects it, and every later observation in the session is dropped with a log line. The seal then verifies the rows Postgres still holds and signs that shorter chain as valid.
- **On the live scorer, a dropped connection still costs an honest candidate about 11.7 points.** A `face_absent` alone scores 82.68. With a `network_anomaly` 2 s earlier it scores 71.02 (-11.66), because the environment channel counts as a corroborator. The frontend reports a network event on the browser's `online` and `offline` events, and the environment detector turns an offline event into `network_anomaly`. That a real socket drop takes this path is inferred from the code and untested. A telemetry sequence gap is different: it opens an unscored window and adds no evidence.
- **Lockdown ends the interview.** Leaving full screen or hiding the tab ends it at once, and losing window focus for 1.5 s ends it too, with no warning first. A notification or another app that takes focus can end an honest candidate's session.
- **SCENE and SCREEN have no health heartbeat.** The browser heartbeat covers FACE and GAZE only, and its status follows the face landmarker. The object detector loads inside a try block that swallows failure, so a silent load failure still shows SCENE as monitored. SCREEN has no heartbeat at all, so nothing reports if its monitor stops running.
- **The calibration window diverges** between lab and live (see [Lab and live compared](#lab-and-live-compared)).
- **The noisy-camera golden is fragile.** It has 6 sub-second face dropouts in 5 minutes and scores 89.29. On the same seed, 7 dropouts score 86.18 and 8 score 84.18, which moves the session to review with no flags. If a real webcam is noisier than that, the fix belongs in the scene channel.
- **The consent screen understates retention.** It says evidence is kept for up to 90 days. The defaults keep media for 90 days, observations for 180 and reports for 1,095. The schema also still defaults `recordVideo`, `recordAudio` and `recordScreen` to true. The scheduler now sends false, and nothing records either way.

### Deployment and security

- **The API container mounts the host Docker socket.** `deploy/docker-compose.yml` mounts `/var/run/docker.sock` into the API container and adds the host's Docker group, which is root-equivalent on the host if the API is compromised. The sandbox containers set no network, a read-only root filesystem and memory, CPU and process caps. They set no capability drop, no `no-new-privileges` and no non-root user.
- **TURN credentials are in the public JavaScript bundle.** The frontend image is built with `NEXT_PUBLIC_TURN_USERNAME` and `NEXT_PUBLIC_TURN_CREDENTIAL`, so anyone who loads the app can read the long-term coturn credential and relay traffic through the server.
- **The deployment guide opens the wrong ports for coturn.** It allows TCP 80 and 443, and coturn needs UDP (see [Deploy](#deploy)).
- **`SANDBOX_PROVIDER=local` has no isolation.** It runs candidate code on the API host. The API refuses to start with it when `NODE_ENV=production`.

### Not evidence

- **All calibration data is synthetic.** The artifact says so in `dataset.kind`. It holds 30 generated sessions and no recorded one.
- **Only 4 of 16 detector types are fitted.** The other 12 stay on priors.
- **The calibrated path has never run on recorded behaviour.** It is off by default, and one integration test exercises it on synthetic curves.
- **No accuracy, precision, recall or false-positive figure exists for this system.** See [What the numbers do not say](#what-the-numbers-do-not-say).

### Code health and documentation

- **Nine frontend lint errors are open.** All are `react-hooks` rules, seven `set-state-in-effect` and two `refs`, across seven files. TypeScript is clean.
- **Other documents have drifted.** `backend/README.md` and `backend/docs/REMAINING_WORK.md` still call the frontend mock-data driven, which is wrong: the frontend calls the API and the sockets. `frontend/README.md` is an unrelated leftover. `docs/AWS_LIGHTSAIL_DEPLOYMENT.md` says TURN is not included, and the Compose file now runs coturn.

## Roadmap

1. Checkpoint the live runtime so a restart resumes monitoring, or at least writes an unscored window for the gap.
2. Cover `llr` and `clientTs` with the evidence hash, and rebuild the chain head from Postgres so a lost Redis key cannot truncate a chain.
3. Port the zero-weight network corroboration rule to the live scorer. It removes the 11.66-point penalty.
4. Add SCENE and SCREEN heartbeats, and warn candidates before lockdown ends an interview.
5. Build audio, identity and recording, or remove them from the engine, the weights and the schema.
6. Harden the sandbox with dropped capabilities, `no-new-privileges` and a non-root user, and stop giving the API container the host Docker socket. Replace the baked-in TURN credential with short-lived credentials.
7. Reconcile backend evidence strength with lab confidence. This is the largest scoring gap: the backend's per-detector strengths and the lab's fitted values disagree in direction for `gaze_away`.
8. Guard the calibration window in `session-runtime.ts` and `integrity-rescore.step.ts`.
9. Confirm the two composite sub-formulas against a written spec, or replace them.
10. Record 20 real sessions and refit with `--dataset-kind recorded`.
11. Point `evaluate/` at the goldens and the artifact. Its report is still titled for the phase 1 priors.
12. Settle the asymmetric [-1, 4] LLR clamp.
13. Port the lab's clamp, duration scaling and baselines to the live scorer, with approval.
14. Add a real media provider that records, and an S3 storage provider.

## License

No license file is included in this repository yet.

---

<p align="center">Yash Gupta</p>
