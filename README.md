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

Remote interviews are easy to game: a second person off camera, a phone held below the frame, an answer pasted from another window. Hiring Guard watches for those signals during a live interview and reports what it saw. It produces an integrity score and a list of flags, and each flag lists the observations behind it. It does not decide anything. A flag is a reason for a reviewer to look, and the score is built from the same evidence.

The system has three parts. A Next.js frontend serves the interviewer, the reviewer and the candidate. An Express and Prisma backend runs the live session, the evidence pipeline and the reports. A Python package, `vtml`, is the lab where the fusion model is specified, tested and calibrated. The lab and the live backend implement the same model twice, and they differ in ways this README states plainly.

Every result below comes from synthetic data, and no number here is an accuracy figure (see [Key results](#key-results)).

The product name is Hiring Guard. Some identifiers keep the earlier name `veritrust`: the Docker containers, the databases, the seed emails, the package names and the repository URL.

## Design

The interface uses no red. The palette is six tokens defined in [frontend/tailwind.config.ts](frontend/tailwind.config.ts): sand, clay, sage, amber, terra and slate. The integrity gauge reads sage at 85 and above, amber from 70 to 84, terra below 70, and sand while a session is still calibrating. Those thresholds are hard-coded in [the gauge component](frontend/components/ui/integrity-gauge.tsx), so the band is a display choice and is not read from the engine.

A period with no usable signal is drawn as sand with a hatch, never as a low score. Severity is double-encoded, so colour is never the only way to tell a high flag from a low one.

## Features

- **Live sessions.** Candidates join over Socket.IO. Browser-side MediaPipe produces face and gaze batches, and the page reports focus, paste, pointer and network events.
- **Explainable flags.** Every flag lists the observations behind it.
- **Reviewer dismissal.** In the lab, dismissing a flag removes only that flag's evidence and the score recomputes from the rest.
- **Neutral candidate warnings.** Candidates see templated, non-accusatory warnings. They never see a score or the detail of a flag.
- **Interview kit.** Coding tasks and a question bank, with a sandbox for running candidate code.
- **Reports.** A signed evidence report per interview, with PDF output as an option.
- **Calibration lab.** Golden fixtures, a prior-sensitivity sweep and a fitted weights artifact that the backend can adopt.

## Evidence fusion

Each observation carries a log-likelihood ratio (LLR). LLRs accumulate per channel, and a signal that a second channel confirms inside a short window counts for more. The score falls as accumulated evidence rises.

The model exists twice. The lab in `ml/src/vtml` is the specification: it has the clamping, duration scaling and damping, and it computes exact leave-one-out flag deltas. The live scorer in `backend/src/live` is the running system and is simpler in several places.

### What the lab does in specific situations

These rows come from the golden fixtures and the demo replay (`python -m vtml.replay --speed 0`), not from the design documents.

| Situation | Lab behaviour | Result |
| --- | --- | --- |
| First 60 seconds | Observe-only window. Background noise feeds the baseline and nothing is scored. | Score reads 97.13, clear, when calibration ends |
| A single gaze glance | Accumulates, raises no flag. | 96.52, clear, no flag |
| Gaze and scene agree within 6 s | The boost fires and a flag is emitted. | `scene.multiple_faces`, medium, "corroborated by gaze", 34.40, delta -56.43 |
| Repeats on one channel | Same-channel damping of 0.6. | Repeats add less than the first hit |
| Reviewer dismisses the flag | Only that flag's evidence is removed. | 90.83 exactly, not back to 96.52 |
| A channel goes dark | An unscored window opens. Absence is never evidence. | 93.25 before and after the gap |
| A dropped connection | A telemetry gap 2 s before a 4 s `face_absent` gives no corroboration. | 93.5889 with and without the gap, cost 0.0 points, no flag |

The dropped-connection row is pinned by `test_dropped_connection_costs_the_honest_session_nothing` in [ml/tests/test_replay_golden.py](ml/tests/test_replay_golden.py). It is a lab result. The live scorer does not have this rule (see [Limitations](#limitations)).

### Lab and live compared

| | Lab (`ml/src/vtml`) | Live (`backend/src/live`) |
| --- | --- | --- |
| Channels | 6 | 11 |
| Score | `100 / (1 + exp(1.6 (S - m)))`, m = 3.2 / 2.2 / 1.5 | `min(100, 200 / (1 + exp(S / sigma)))`, sigma = 6 / 4 / 3 |
| Sensitivity tiers | LOW / STANDARD / HIGH | LOW / STANDARD / HIGH |
| LLR handling | Clamped to [-1, 4], log-saturating duration scaling, same-channel damping 0.6 | No clamp, no scaling, no damping |
| Clean-behaviour evidence | None | 3 of 18 LLR rows (focus resume -0.4, pointer return -0.2, rhythm normal -0.3), accumulator floor -2 |
| Baselines | Gaze and rhythm | Rhythm only (KS test) |
| Flag trigger | One boosted LLR of 0.8 or more | A channel accumulator crosses its threshold upward (3 for STANDARD; 2.5 for paste and identity; 4 for pointer and environment) |
| Flag delta | Exact leave-one-out | Single-observation before and after; merged flags sum |
| Calibration window | Observe-only, nothing accumulates | Evidence accumulates; only flags and warnings are held back |

Both share a 6 s corroboration window, a boost of 0.45 per extra channel, a cap of 2.35 and a 15 s flag merge window.

The calibration-window row is a known divergence. On the `honest_seed7` fixture the lab measured the leak at 1.17 points. The live size is unmeasured.

### Ethics are tests

Seven tests in [ml/tests/test_ethics.py](ml/tests/test_ethics.py) hold the model to its promises:

1. No output field is a verdict.
2. Absence of a signal is never evidence.
3. Every flag can be reconstructed from its observations.
4. Narratives are neutral and avoid a list of banned words.
5. The engine handles no free text.
6. Every output carries its caveats.
7. Dismissing a flag can only raise the score.

The backend schema has no verdict-like field either. Below a score of 70, the composite step in `composite-score.step.ts` sets the composite to null and marks the interview as needing review. From 85 up it awards full marks, and from 70 to 85 it scales proportionally.

### The artifact seam

The lab can fit LLR magnitudes and write them to [ml/weights/weights.json](ml/weights/weights.json). The backend reads that file in `backend/src/config/calibrated-weights.ts` and uses it in place of the hand-set table where it can.

The current artifact is `phase3-synthetic-1`: 1,025 rows from 30 synthetic sessions (10 honest, 20 staged), 80 positives. Four detector types are fitted and twelve stay on priors, each with a recorded reason ("not present in the calibration set" or "only 0 positives, needs 15").

At STANDARD sensitivity, the backend adopts four values:

| Backend detector | Hand-set | Adopted | Lab prior for the fitted type |
| --- | --- | --- | --- |
| `focus_loss` | 1.20 | 1.042 | 1.10 |
| `gaze_away` | 1.10 | 1.295 | 1.40 |
| `multiple_faces` | 1.70 | 1.207 | 2.00 |
| `paste_large` | 1.60 | 1.509 | 1.80 |

Three rules govern the seam:

- Only per-detector magnitudes are adopted. The artifact's channel weights are stripped by the schema and ignored.
- A backend type is adopted only if exactly one fitted lab type maps to it. Three lab gaze types map to `gaze_away`, so it is adopted through the mapping in [contracts/detector-registry.json](contracts/detector-registry.json).
- A missing, invalid or newer-schema artifact falls back to the hand-set table and logs an error. The calibration report is built lazily on the first LLR lookup, once per process, so the "synthetic" log appears then and not at startup. Nothing surfaces the calibration provenance in `/ready` or in reports yet.

LOW and HIGH keep their hand-set ratios. The `gaze_away` value moves up while its lab counterpart was fitted lower than its prior, because the backend value comes from the fit line and not from the lab prior. That is the reconciliation gap listed in the [Roadmap](#roadmap).

## Architecture

```mermaid
flowchart LR
    C[Candidate browser<br/>MediaPipe, focus, paste, pointer, network] -- Socket.IO --> L
    subgraph B[Backend]
        L[Live layer<br/>ingest, detectors, fusion, warden]
        P[Pipeline and workers<br/>BullMQ, reports, evidence signing]
        L --> P
    end
    L -- neutral warnings --> C
    R[Interviewer and reviewer UI] -- REST and Socket.IO --> B
    B --- D[(Postgres 17)]
    B --- Q[(Redis 7)]
    ML[vtml lab<br/>goldens, sweep, calibration] -- weights.json --> L
    K[[contracts/detector-registry.json]] -.-> L
    K -.-> ML
```

```
veritrust/
├── frontend/     Next.js app: interviewer, reviewer and candidate views, in-browser CV
├── backend/      Express API, live session runtime, pipeline, workers, Prisma schema
│   └── src/live/   ingest, detectors, fusion, warden, session runtime
├── ml/           vtml: fusion model, fixtures, sweep, calibration, ethics tests
│   └── weights/    fitted artifact read by the backend
├── contracts/    detector-registry.json shared by both sides
└── docs/         cross-component architecture and audits
```

## Tech stack

| Layer | Tools |
| --- | --- |
| Frontend | Next.js ^16.3, React ^18.3, Tailwind ^3.4, Zod ^3.23, TypeScript ^5.6, Monaco editor, `@mediapipe/tasks-vision` |
| Backend | Express ^5.2, Prisma ^7.10 with the pg adapter, Zod ^4.6, Socket.IO ^4.8, BullMQ ^6.3, ioredis ^6, argon2, jose, Eta ^4.6, dockerode, Puppeteer (optional), TypeScript ^7.0, Vitest ^5 |
| Evidence | Ed25519 signing of evidence reports |
| Data | Postgres 17, Redis 7, Mailpit for local email |
| Lab | Python 3.11 or newer with pydantic 2.5 or newer and numpy 1.26 or newer at runtime. Development adds pytest, pytest-benchmark, scikit-learn, pandas, matplotlib, mediapipe, opencv-headless and mypy. |

## Getting started

You need Node 22 or newer, Python 3.11 or newer (developed on 3.12), and Docker with Compose.

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

The response is `{"data":{"db":"ok","redis":"ok"}}`. The seed creates an organisation named "HiringGuard" with the owner login `owner@demo.veritrust.local` and password `demo-password-1234`, three coding tasks and 20 question-bank items.

Compose starts Postgres, Redis and Mailpit (SMTP on 1025, web UI on 8025). The `api`, `worker` and `migrate` services only start under `--profile app`.

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

### Checks

```bash
cd backend && npm run typecheck
cd frontend && npm run typecheck && npm run lint
```

The backend tests need a migrated test database. Nothing in the scripts creates one, so point Prisma at it first:

```bash
cd backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/veritrust_test" npm run db:deploy
npm test
```

## Key results

All counts below were measured on 2026-09-20. All lab data is synthetic.

### Checks

| Check | Result |
| --- | --- |
| `ml`: pytest | 164 passed |
| `ml`: mypy (strict) | No issues in 34 source files |
| `backend`: typecheck | Clean |
| `backend`: vitest | 241 passed in 28 files |
| `frontend`: typecheck | Clean |
| `frontend`: ESLint | 9 errors, 12 warnings (see [Limitations](#limitations)) |

### Golden fixtures

| Fixture | Score | Band | Flags |
| --- | --- | --- | --- |
| `honest_clean` | 94.61 | clear | 0 |
| `honest_noisy_camera` | 89.29 | clear | 0 |
| `staged_phone_and_glance` | 11.99 | suppressed | 3, all medium |

These are scored on the hand-set priors. On the fitted artifact the honest sessions do not change and the staged session moves to 17.01, still suppressed with 3 flags. The fit moved the staged score toward less suspicion.

### Prior sensitivity

`python -m vtml.evaluate.priors_sweep` scales each channel's priors from 0.25x to 4x in nine steps of square root of two, which gives 45 points across five channels. At every one of them the honest fixture raises no flags and the staged fixture stays suppressed.

- Gaze, scene and input hold both verdicts over the full range.
- Focus holds from 0.25x to 2.83x. At 2.83x the honest session scores 87.60 and is still clear.
- Focus breaks at 4x. The honest score falls from 94.28 to 80.40, the band changes from clear to review, and there are still 0 flags. The narrowest stable channel is focus.
- Audio is left out of the headline. No fixture emits audio observations, so the sweep cannot exercise it.

### What the numbers do not say

Every fixture is synthetic and generated for this project. Agreement between them proves the model is internally consistent and that its promises hold. It does not measure how often it flags a real cheater or a real honest candidate. No false-positive rate, no detection rate and no accuracy figure exists for this system, and none should be inferred from the tables above.

## Design decisions

**Why a score and flags instead of a pass or fail verdict?** A behavioural signal is evidence, not proof. Glances, dropped connections and noisy cameras happen to honest people. A verdict would hide that uncertainty, and a score with traceable flags exposes it.

**Why require corroboration across channels?** One weak signal is common in honest sessions. Two channels agreeing inside a 6 s window is stronger evidence, so the boost goes to agreement and not to volume.

**Why is absence never evidence?** A dropped camera says nothing about the candidate. The lab opens an unscored window and holds the score, and a test enforces it.

**Why exact leave-one-out deltas in the lab?** A reviewer reading "this flag cost 56.43 points" needs that to be true. Dismissing the flag reproduces the number exactly. The deltas belong to individual flags and do not sum to the total loss.

**Why keep a lab beside the backend?** The model is easier to test, sweep and fit in a small pure-Python package than inside a live system with sockets and queues. The cost is two implementations, which the [Roadmap](#roadmap) is meant to close.

**Why ship a fitted artifact from synthetic data?** It tests the seam end to end and gives the backend a place to read real numbers once recorded sessions exist. One integration test drives a real session over the candidate socket and the internal producer API, and asserts that the stored LLR is the calibrated one and that four `focus_loss` events give one flag with a positive score delta.

## Limitations

- **The data is synthetic.** The calibration set is 30 generated sessions. Phase 3 of the plan (calibration on recorded sessions) is only partly built: the capture harness, the 20 recorded sessions and the human label scripts do not exist yet, and they need people. Phase 5 was cut.
- **The calibrated path has never run on recorded behaviour.** It is exercised in one integration test on synthetic curves. There is no before and after comparison of live scores.
- **Only 4 of 16 detector types are fitted.** The other 12 stay on priors.
- **The live scorer lacks the dropped-connection fix.** In the lab, a network gap 2 s before a 4 s `face_absent` used to cost 2.674 points and add a "corroborated by network" flag, and now costs nothing. The live scorer in `backend/src/live/fusion` has no such rule. In a check run against it, `face_absent` alone scored 82.68. With a `network_anomaly` 2 s earlier it scored 71.02 (-11.66) with the environment channel counted as a corroborator. The frontend emits a network event on the browser's offline event, which the environment detector turns into `network_anomaly`. That a real socket drop takes this path is inferred from the code and untested. A telemetry sequence gap is different: it opens an unscored window and adds no evidence.
- **The noisy-camera golden is fragile in one place.** It scores 89.29 and holds until about seven sub-second dropouts in five minutes. The fix belongs in the scene channel.
- **The calibration window diverges** between lab and live, as described above.
- **Nine frontend lint errors are open.** All are `react-hooks` rules: seven `set-state-in-effect` and two `refs`, across seven files: `candidate-editor`, `candidate-room`, `join-flow`, `policy-step`, `schedule-modal`, `use-live-room` and `use-live-video`. TypeScript is clean.
- **Providers default to mocks.** The LLM, media and sandbox providers are mocks. The mock sandbox runs no code and passes every test unless the submission is empty. The Docker sandbox supports Python and JavaScript only. There is no S3 provider, and PDF reports are off unless `REPORT_PDF_ENABLED` is set.
- **Flag deltas do not sum.** Each is measured with that flag removed, so they overlap.
- **Documentation has drifted.** The backend README still calls the frontend mock-data driven, and the frontend README is an unrelated leftover. Several documents quote older test counts. The frontend is wired to the backend.

## Roadmap

1. Reconcile backend evidence strength with lab confidence. This is the largest gap: the backend's per-detector strengths and the lab's fitted values disagree in direction for `gaze_away`.
2. Port the zero-weight network corroboration rule to the live scorer.
3. Guard the calibration window in `session-runtime.ts` and `integrity-rescore.step.ts`, and fix the batch-arrival boundary bug.
4. Record 20 real sessions and refit with `--dataset-kind recorded`.
5. Point `evaluate/` at the goldens and the artifact. Its report is still titled for the phase 1 priors.
6. Settle the asymmetric [-1, 4] LLR clamp.
7. Replace the mock CV, speech, LLM and storage providers with real ones, including S3.
8. Port the lab's clamp, duration scaling and baselines to the live scorer, with approval.
9. Render unscored windows generically in the interface.

## License

No license file is included in this repository yet.

---

<p align="center">[NAME AND GITHUB LINK]</p>
