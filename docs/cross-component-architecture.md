# Cross-component architecture: backend ↔ ml

> Scope: this file only. `backend/docs/Architecture.md` and `ml/docs/Architecture.md` each own their
> own component's internals and are unchanged in substance by this file — it exists because neither
> of them, on their own, can describe the seam between the two.

## The situation this documents

`backend/` and `ml/` each contain a **complete, independent implementation of the same
integrity-fusion engine** — detectors, LLR conversion, decay, corroboration, scoring, flags — built
from the same product requirements, in different languages, with no shared code and (until this
file) no shared documentation. They were not built as two views of one system; they are two systems
that happen to solve the same problem differently:

| | `backend/src/live/` (TypeScript) | `ml/src/vtml/` (Python) |
|---|---|---|
| Runs in production today | Yes — wired into `session-runtime.ts`, sockets, the evidence hash chain, 9 integrated phases | No — reachable only via `python -m vtml.replay` / `python -m vtml.evaluate` on a laptop |
| Channels | 11 (`MonitoringChannel`, `prisma/schema.prisma`) | 6 (`Channel`, `vtml/types.py`) |
| Detector vocabulary | 12 type strings, `snake_case` (`config/detection.ts`) | 16 type strings, `dotted.case` (`detectors/schema.py`) |
| Flag trigger | channel accumulator crosses a threshold | a single observation's boosted LLR crosses 0.8 |
| Calibration window (first 60 s) | Evidence accumulates; only flags and warnings are gated (`session-runtime.ts:205-208`) | Observe-only: in-window observations feed the baseline and add no LLR (`fusion/engine.py:150-169`) |
| Score function | `200 / (1 + exp(S/σ))`, no LLR clamp | `100 / (1 + exp(1.6·(S−2.2)))`, LLR clamped to `[-1.0, 4.0]` |
| Duration scaling, personalised baselines, KS-test rhythm anomaly | Not implemented | Implemented (`baseline.py`, `config.py`) |

Neither side imports the other. `ml/src/vtml/wire.py` documents a mapping into the backend's
`MonitoringChannel` enum, but says outright that `backend/` "is out of scope for this component and
is not read or imported here" — it was written against a copy of the enum pasted into a handoff, not
against the schema itself.

## The decision

**`backend/src/live/` remains the canonical live scorer.** `ml/src/vtml/` is not a second runtime to
migrate to or reconcile scores against — it is the offline calibration and evaluation lab that is
meant to *produce and validate* the constants a live scorer consumes (priors, a detector registry,
personalised-baseline statistics), not to run one itself.

This was chosen over making the Python engine canonical, or leaving both as independent engines,
for four reasons:

1. **Only one side is connected to anything.** `ml/`'s own docs (`ml/docs/Phases.md`, "What remains
   undone overall") state the engine "has never scored a real recording and has never run anywhere
   but a laptop." Its designed runtime entry point (`handler.py`, a Lambda handler), its shipped
   artifact (`weights/weights.json`), and its fitting pipeline (`calibrate/`) were all cut and do not
   exist. The backend's engine, by contrast, is exercised by 157 integration and unit tests across
   telemetry ingest, fusion, flags, warden, seal and evidence.

2. **The cost is asymmetric.** Backend's live engine and detectors are ~1,336 lines; the surrounding
   integration that assumes synchronous in-process scoring (`session-runtime.ts`, sockets, the
   evidence hash chain's single serialized writer) is another ~1,158 lines. Making Python canonical
   means rebuilding that integration around a network hop — and specifically means separating the
   evidence hash chain's `seq`/`prevHash`/`hash` assignment from the score computation that currently
   shares one writer with it, which is the exact race the fusion lease exists to prevent. Making TS
   canonical means the ~758-line Python fusion core stops being a second runtime candidate and
   becomes the reference implementation the lab checks its own output against — the smaller,
   reversible cut.

3. **Everything unbuilt downstream already assumes it.** `backend/docs/Architecture.md` §6.8
   (IntegrityRescore, Phase 10, not yet built) says it "re-runs the same fusion engine over stored
   observations + adjudications" — the backend's own engine, not a call to Python.

4. **`ml/`'s runtime design was already deliberately rejected for the rest of the product.**
   `backend/docs/Architecture.md` §2 is an explicit mapping *away* from the AWS/Lambda/DynamoDB
   topology `ml/docs/Architecture.md` §1 and §8 still describe, so the whole product runs on
   `docker compose up`. Making the Python engine canonical would reintroduce the infrastructure that
   decision removed, for a component with no entry point into it yet.

The honest case for the other direction: `ml/`'s statistics are better specified than the backend's
(a documented LLR clamp, log-saturating duration scaling, a real 196-line baseline module with a
hand-rolled KS test, versus the backend's 22-line rhythm-sample bucket with no clamp or scaling at
all — see `ml/docs/Memory.md`'s Key decisions for how each number there was derived). None of that is
lost by this decision — it's the reason `ml/` is kept as the lab whose output the backend is meant to
start consuming, not evidence that Python should run live.

## What this means concretely

- `backend/src/config/detection.ts` (`LLR_TABLE`, `CHANNEL_WEIGHTS`, `CHANNEL_THRESHOLDS`, ...)
  remains server-only and authoritative for what actually scores a live session. Nothing in this
  change alters a single constant in it.
- `ml/src/vtml/` remains the place calibration curves, priors and personalised-baseline logic get
  developed and proven against fixtures before (if and when approved) a backend implementation adopts
  them. It is not itself deployed.
- The two detector vocabularies are recorded, side by side, in
  [`contracts/detector-registry.json`](../contracts/detector-registry.json) — not merged, not
  renamed. Both sides have a test (`backend/tests/unit/detection-contract.test.ts`,
  `ml/tests/test_contract.py`) that fails if that file drifts from the real source it documents, so
  future drift is caught instead of silent.
- `backend/src/config/detection.ts::getLlr()` used to return `0` for any `type` string it did not
  recognise. That is the path a first `ml/`-shaped integration, or any CV/ASR producer using the wrong
  vocabulary, would have hit: every observation scored 0.0 and looked like a clean signal on the
  dashboard. The 2026-09-18 change made it log once per unknown type and count every occurrence
  (`getUnknownDetectorTypeCounts()`). That did not fix it. The return value stayed `0`, so the score did
  not change and nothing downstream could tell. Since 2026-09-19 it returns `null`: the backend stores
  the observation with `llr = null`, and live fusion and `IntegrityRescore` skip it. The dashboard still
  shows nothing, and no code reads the counter. Detail: `backend/docs/Memory.md`, 2026-09-19 entry.

## What this explicitly does not do

- It does not change `backend/src/config/detection.ts`'s channel weights, thresholds, decay rates, or
  score function. Any of that is a separate, explicitly-approved step (`backend/CLAUDE.md`: "ask me
  before changing constants in `src/config/detection.ts`"; `ml/docs/Rules.md` §1: "do not change the
  fusion constants ... to make a test pass").
- It does not rename either side's detector type strings or channel enums to match the other.
- It does not build a network integration between the two components. `contracts/detector-registry.json`'s
  `typeMapping` is documentation for whoever builds that integration later, not working code.
- It does not delete or deprecate any part of `ml/`. Roughly half its source
  (`evaluate/`, `detectors/offline_video.py`, `fixtures/`) has no backend counterpart at all and is
  unaffected.

## Open follow-up (not actioned here, needs explicit approval)

Porting `ml/`'s LLR clamp, duration scaling and personalised baselines into
`backend/src/config/detection.ts` / `backend/src/live/calibration.ts` would move backend scores,
break the backend's current test expectations, and require re-pinning `ml/`'s locked regression
baseline (`ml/tests/test_regression_baseline.py`) if the shared contract becomes normative for values,
not just vocabulary. Both components' own rules require asking before that kind of change — see the
"What this explicitly does not do" section above. Revisit after the current submission.

### Calibration window (diagnosed 2026-09-19, deferred until after submission)

The backend lets evidence from the first 60 s accumulate and gates only flags and warnings. The ML
lab discards it: in-window observations feed the baseline and add no LLR. The backend's own
requirement (`backend/docs/PRD.md`, FR-LIVE-2) asks only for no flags and no warnings, and
`backend/docs/Memory.md` (Known issues, Phase 10) and `backend/docs/REMAINING_WORK.md` (section 4)
record the divergence as intentional. Two facts now favour matching the lab. The live dashboard tells
the interviewer "nothing is scored" during the window, and the ML lab measured the leak at 1.17 points
on its honest fixture (`ml/docs/Memory.md`). The ML score function differs from the backend's, so the
size on the backend is unmeasured.

The change is one hoisted guard in `session-runtime.ts` and one in `integrity-rescore.step.ts`, with no
constant moved. The sketch, the tests it touches and the frontend reads are in `backend/docs/Memory.md`
(2026-09-19 entry). It changes live scoring and needs the integration suite, so it waits for a machine
with Postgres and Redis. A separate defect makes the window boundary depend on batch arrival time
(`backend/docs/Memory.md`, Known issues, 2026-09-19); fix both in the same change.
