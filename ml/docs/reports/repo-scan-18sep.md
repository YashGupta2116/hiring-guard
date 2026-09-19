# Repo scan, 18 Sep: full reconciliation for ml/

Scope: read-only across `frontend/`, `backend/`, `ml/`. No code changed in this pass except the
authorised doc updates listed at the end. All git commands used were non-mutating (`log`, `diff`,
`show`, `ls-files`, `status`).

## A. What changed since my last known state

Base commit: `eaf0155` (Aryan Sharma, 2026-09-18 18:07, "Add PRD, Phases, and Rules documentation for
VeriTrust Integrity Engine"). This is the last commit before the pull that touched `ml/`, and it is
mine.

Four commits landed after it, all by Yash Gupta, all on 2026-09-18:

| Commit | Time | Summary |
|---|---|---|
| `68b0d21` | 18:51 | Cross-component architecture doc, `contracts/detector-registry.json`, `ml/tests/test_contract.py`, small edits to `ml/README.md` and `ml/docs/{Architecture,Memory}.md` |
| `31f5d82` | later | Report generation and pipeline status endpoints (backend only) |
| `fe60969` | later | Retention policy and audit log functionality (backend only) |
| `943e937` | later | Integration tests for pipeline resilience and reproducibility (backend only), plus new `ml/docs/REMAINING_WORK.md` and `backend/docs/REMAINING_WORK.md` |

File count touched, `eaf0155..HEAD`, by top-level directory: `backend` 50, `ml` 5, `contracts` 1 (new
directory), `docs` 1 (new file, root-level). Zero files under `frontend/` changed in this range, the
frontend's last commits predate `eaf0155`.

Every commit that touched `ml/` after my last commit was authored by Yash Gupta, not me:

- `ml/tests/test_contract.py` (new, 58 lines, a real pytest file) — `68b0d21`
- `ml/README.md` (+2 lines) — `68b0d21`
- `ml/docs/Memory.md` (+9 lines) — `68b0d21`
- `ml/docs/Architecture.md` (22 lines changed) — `68b0d21`
- `ml/docs/REMAINING_WORK.md` (new, 112 lines) — `943e937`

I stopped and flagged this mid-scan per this handoff's own rule ("the scan shows `ml/` code was
modified by someone other than me"). Told to continue and treat it as trusted current state. Verified
before continuing: `pytest -q` in `ml/` passes 89/89, `tests/test_regression_baseline.py` passes on
its own (5/5), and bare `mypy` reports 0 issues across 27 source files. Nothing Yash added breaks
anything of mine.

## B. What the repo now claims the architecture is

`docs/cross-component-architecture.md` (new, root-level, committed in `68b0d21`) states the decision in
writing: `backend/src/live/` and `ml/src/vtml/` are two complete, independently-built fusion engines
solving the same problem, and `backend/src/live/` is kept as the canonical live scorer while `ml/`
becomes the offline calibration and evaluation lab whose output a future backend implementation may
adopt. This was previously, per my notes, an "agreed in principle" verbal decision of unknown status;
it is now a committed file with reasoning (asymmetric integration cost, only one side has a runtime,
downstream work already assumes it, and the AWS topology `ml/`'s own Architecture.md still describes
was already rejected for the rest of the product).

**Which engine scores a live session today: `backend/src/live/session-runtime.ts`, calling into
`backend/src/live/fusion/fusion.engine.ts`. `ml/src/vtml/fusion/engine.py` is reachable only via
`python -m vtml.replay` or `python -m vtml.evaluate` run by hand; nothing imports or calls it from a
live session.**

## C. Contract table

| Contract point | `ml/` produces | Other side expects / produces | Match? | Consequence if unfixed |
|---|---|---|---|---|
| Detector type strings | 16 `dotted.case` types, `ml/src/vtml/detectors/schema.py` `REGISTRY`, recorded in `contracts/detector-registry.json:81-101` | Backend's `LLR_TABLE` has 17 `snake_case` keys, `backend/src/config/detection.ts:15-35` (12 emitted by a real client detector, 5 reserved for a producer that does not exist yet, per `detector-registry.json:56-77`) | **No overlap at all as literal strings.** `typeMapping` in `detector-registry.json:104-121` records a conceptual correspondence but is documentation only, wired nowhere (`detector-registry.json:103`) | An `ml/`-shaped observation reaching the backend today would hit `getLlr()`'s unknown-type path (see next row) on every single call, since no string matches |
| Unknown detector type | N/A (produces its own vocabulary) | `backend/src/config/detection.ts:55-70` `getLlr()`. **Fixed this pull**: logs once per type and counts every occurrence via `getUnknownDetectorTypeCounts()` (`detection.ts:38-44,73-75`). Still returns `0` for the observation | Partially resolved | Previously: silent zero, indistinguishable from a clean signal. Now: still scores `0`, but observable via the count. No live integration hits this path today since nothing sends `ml/`-shaped types to the backend |
| Channel enum | 6 values, `ml/src/vtml/types.py` `Channel` | 11 values, `enum MonitoringChannel`, `backend/prisma/schema.prisma:67-79` | Mismatch by design, mapped (not merged) in `wire.py:14-26` and `detector-registry.json:37-51` | None today. `wire.py`'s mapping is never called from anything that runs; see section F |
| Score bands | 4 literal values `clear`/`review`/`suppressed`/`calibrating`, `ml/src/vtml/types.py`, confirmed live in `fusion/engine.py:307,313` and `ml/docs/Architecture.md:109` | Backend emits **no band name at all** — just raw `score: number` and `calibrating: boolean` on the `integrity.tick` socket event (`backend/docs/Design.md:350`, `backend/src/live/session-runtime.ts:168-172`). Frontend independently derives its own 4-state `status`: `"score"`\|`"review"`\|`"calibrating"`\|`"down"` (`frontend/components/ui/integrity-gauge.tsx:8,33-40`) | Numeric thresholds agree (70 and 85 both sides, see next row), **band names do not**: frontend calls the sub-70 band `"review"` where `ml/` and the design tokens call it `"suppressed"` | Cosmetic today, since nothing feeds the frontend a real score (section G). Would surface as a labelling bug the moment real data is wired up |
| The 70-point threshold specifically | `suppressed` starts below 70, `ml/docs/Rules.md:112-116` | Backend nulls `Report.compositeScore` and sets `reviewRequired = true` below integrity 70, `backend/src/pipeline/steps/composite-score.step.ts:25,68-72`; Prisma comment confirms, `backend/prisma/schema.prisma:914` | **Match**, confirmed by reading both sides | None, this one line up |
| Calibration-window evidence handling | Gates accumulation **and** flag emission — an in-window observation reaches `BaselineBuilder` and nothing else (`ml/src/vtml/fusion/engine.py` `_process_one`, fixed per `ml/docs/Memory.md:63`) | Gates **flag emission only** — `applyObservation()` runs and updates `this.fusionState` unconditionally at `backend/src/live/session-runtime.ts:196-197`, and only the subsequent flag/warden call is skipped by `if (calibrating) continue;` at line 199 | **Documented, deliberate divergence**, not a bug either side is unaware of: `backend/docs/Memory.md:121-124` names it explicitly | Backend's live score is not "observe-only" in the calibration window the way `ml/docs/PRD.md:76` promises for the product. This is real and live-facing, not hypothetical — see section G |
| `duration_ms` on the wire | Documented as travelling inside the backend's `payload Json` column, since `Observation` has no duration column (`ml/src/vtml/wire.py:28-33`) | Confirmed: `backend/prisma/schema.prisma:539-552` `Observation` model has `payload Json`, no duration field | Match, verified directly | None |
| `score_delta` labelling | Leave-one-out, non-additive by construction; explicit product decision that the UI must say "recovers N points" on dismissal, never "cost N points" (`ml/docs/Memory.md:53`, told to Yash directly) | `frontend/components/ui/flag-card.tsx:154-157` renders a flat `"{delta} pts"` (e.g. `-8 pts`) with no recovery/cost framing and no dismiss-specific copy anywhere | Not implemented on the frontend | Not urgent today since the whole panel is mock data (section G), but the specific UI requirement from the decision log has not been built anywhere I can find |
| Frontend consumption of the live contract at all | N/A | `frontend/components/live-interview/live-sidebar.tsx` takes only `candidateName` and a callback as props (line 24-27); its `IntegrityGauge` is hardcoded `score={84}` (line 204) and its `FlagCard` is hardcoded `scoreDelta={-8}` (line 232). No socket listener, no fetch | **Nothing is wired.** Independently confirmed by `backend/docs/REMAINING_WORK.md:29-33`: "The frontend is not connected to this API at all... 100% `lib/mock-data/*`, zero calls to this backend or its sockets" | Every question in this table about how the UI *handles* a value is currently moot in production. It only matters for what gets built next |

## D. Corrections to my prior state

Blunt, with file and line. This section has content; it is not empty.

1. **"`ml/docs/` is gitignored and untracked" — was true, is no longer.** Before `eaf0155`,
   `ml/.gitignore` line 17 was literally `docs/` (confirmed: `git show eaf0155 -- ml/.gitignore` shows
   that line being deleted). My own commit `eaf0155` removed that line and committed all six doc files
   in the same commit. `git ls-files ml/docs` today lists **seven** tracked files, `REMAINING_WORK.md`
   (Yash's, `943e937`) makes six into seven. I had already fixed this myself and the handoff describing
   it as still-gitignored was stale, not wrong when written, just not updated after the fact.

2. **"The frontend `integrity-gauge.tsx` was built against three score bands and may break on a
   fourth, `calibrating`" — false.** `frontend/components/ui/integrity-gauge.tsx:8` types its `status`
   prop as `"score" | "review" | "calibrating" | "down"`, four states, one of which is already
   literally named `calibrating`. Lines 36-37 explicitly fall back to `"calibrating"` when `score` is
   `null` or `undefined`. It does not break on a fourth band. It was built with one from the start (plus
   a fifth state, `"down"` for "Detector down", that has no `ml/`-side equivalent at all).

3. **"`PRD.md` line 21 says 'Nothing downstream recomputes it,' which is false... if the backend is
   downstream and recomputes"** — the line is real (it's line 20, not 21, in the current file:
   `ml/docs/PRD.md:20`) but the reasoning doesn't hold the way I'd assumed. The backend is not
   downstream of `ml/` in any sense, the two are fully separate engines (section B). The line is still
   wrong, but for a different, closer-to-home reason: `ml/`'s own adjudication flow recomputes the
   score. `Architecture.md:59` ("`Engine.recompute(dismissed_ids, downgraded_ids)` replays the
   accumulated evidence set") and `PRD.md`'s own F9 ("Adjudication recompute... recompute the score
   exactly") both contradict a literal reading of "nothing downstream recomputes it." This is a
   same-document internal inconsistency, not a cross-component one.

4. **"The unresolved situation... duplicate engine"** is resolved on disk, in writing, not just
   "agreed in principle" as I recalled it. See section B.

5. **"Silent-zero defect in `getLlr()`... verify whether this is still true"** — it is fixed, not
   merely verified. See the contract table, row 2. Read directly: `backend/src/config/detection.ts:55-70`.

6. Everything else I had written down about `ml/`'s own internals checked out exactly as stated:
   the pinned baseline (`honest_seed7` 94.28386762280083, `staged_seed7` 2.350196740204917, both
   confirmed live by running `pytest tests/test_regression_baseline.py`, matching
   `ml/docs/Memory.md:100-101` digit for digit), `Engine.snapshot()`'s copy-not-live semantics
   (`ml/src/vtml/fusion/engine.py:292-317`, confirmed by reading the method), `wire.py`'s mapping
   behaviour, the mypy strict gate (still clean, still whole-`src` per `pyproject.toml`), and the demo
   fixture. The one number that moved is the test count: 84 at the end of Phase 6, 89 now (5 new
   contract tests from `68b0d21`), which is growth, not drift.

## E. The ml/ change list

**Headline: nothing here breaks the demo, and nothing here is caused by anything Yash did.** `ml/`'s
own artifacts (`replay.py`, `evaluate/`, the demo fixture, the pinned baseline) are self-contained and
untouched. Every item below is doc accuracy or smaller. Ordered per the requested priority; there is
nothing in the first two tiers ("breaks the demo", "breaks a teammate").

### Doc accuracy

1. **Fix `ml/docs/PRD.md:20`** ("Nothing downstream recomputes it"). Reword to acknowledge that
   adjudication (`Engine.recompute`) is itself a recompute of the score, so the constraint actually
   being made is about *external* recomputation, not *any* recomputation. What breaks if skipped:
   nothing functional, a careful reader hits a contradiction with the same doc's own F9. **~5 min. Safe
   after the video.**
2. **Finish reconciling `ml/docs/Architecture.md` sections 8 and 9.** Yash's `68b0d21` edit added a
   disclaimer banner at the top of section 1 and fixed the folder-tree comments for `handler.py` and
   `weights/`, but sections 8 ("Lambda integration") and 9 ("Failure behaviour", written around
   DynamoDB) still read as live documentation with no inline marker, only the section-1 banner two
   thousand words above them. What breaks if skipped: a reader who jumps straight to section 8 (a judge,
   a future contributor) gets no warning it's unbuilt. **~10 min. Safe after the video. I did this one
   myself, see the bottom of this report.**
3. **Update the stale test count in `ml/docs/Architecture.md`'s folder tree** (`tests/  # 84 passing as
   of the end of Phase 6`) to 89, since `Memory.md` two sections over already has the right number.
   **~2 min. Done, see bottom of this report.**

### Nice to have, no urgency

4. **Record a convention for Yash's contributions inside `ml/`.** `test_contract.py` and
   `REMAINING_WORK.md` are good-faith, correct, and tested, but they are still someone else's commits
   inside a directory this handoff calls mine alone. Worth one line in `Rules.md` or `Memory.md` saying
   this specific shared-contract test is expected to be touched from either side, so a future scan
   doesn't re-trigger the same stop-and-ask. I did not add this myself, it's a decision about process,
   not a fact I can verify from disk. See section H.
5. **`contracts/detector-registry.json:78`'s own flagged `openQuestion`** (`visibility_loss` and
   `face_absent` carry near-identical LLR values with no detector distinguishing their trigger) touches
   `backend/src/config/detection.ts`, not `ml/`. Nothing to do here except note it's tracked.
6. **`wire.py` could get a one-line pointer** to `docs/cross-component-architecture.md` next to its
   existing "backend is out of scope for this component" docstring line (`wire.py:3-4`), so a future
   reader isn't confused about why a real mapping exists that nothing calls. Purely a comment. **~3 min.**

## F. What in ml/ is now dead

- **Phase 3** (`calibrate/`, the fixture-capture and curve-fitting pipeline): confirmed absent from
  disk (`ml/src/vtml/calibrate` does not exist). Cut for the hackathon per `Phases.md`, still specified
  as a real thing to build post-submission. Not touched by anything this pull.
- **Phase 5** (`handler.py`, `weights/weights.json`, `weights/weights.schema.json`): confirmed absent
  from disk. Given `docs/cross-component-architecture.md`'s reasoning (asymmetric integration cost,
  backend already has 157 tests and 9 integrated phases against zero for `ml/`'s runtime), this is no
  longer just "cut for time", it reads as **unlikely to ever be built as originally specified**. Worth
  being that honest about it rather than calling it merely deferred.
- **`wire.py`'s own mapping**: still tested (`test_wire.py`), still mypy-clean, still cited by
  `contracts/detector-registry.json`'s `channelMapping` section as the source of truth. But its actual
  functions (`dispatch`, `to_payload`, `to_unscored_window`) are called from nowhere except its own
  test file. Nothing in `replay.py`, `evaluate/`, or the demo path calls it. It documents a real,
  correct mapping that has never once executed outside a test, and given the backend-canonical
  decision, has no scheduled caller.
- **The AWS Lambda + API Gateway + DynamoDB design** in `ml/docs/Architecture.md` sections 1
  (diagram), 8, and 9: dead design, not just unbuilt. Same reasoning as Phase 5 above.

## G. What is not mine to fix

For Yash, phrased so it can be forwarded as-is:

1. **The calibration window in `backend/src/live/session-runtime.ts` accumulates LLR, it doesn't just
   gate flags.** `applyObservation()` runs unconditionally at line 196-197 before the `if (calibrating)
   continue;` at line 199, so an observation inside the 60-second calibration window is added to
   `this.fusionState` and only its *flag* is suppressed, not its evidence. This is already recorded as
   a known, deliberate divergence in `backend/docs/Memory.md:121-124`, so this isn't news, it's a
   cross-check confirming the doc is accurate. Worth flagging again only because `ml/docs/PRD.md:76`'s
   "the first 60 seconds of a session are observe-only" reads as a product-wide promise, and today it's
   only true on the side nothing runs.
2. **The frontend is not wired to any live backend data.** `frontend/components/live-interview/live-sidebar.tsx:204,232`
   hardcodes the integrity score and a flag's score delta. Already tracked independently in
   `backend/docs/REMAINING_WORK.md:29-33`. Passing along the exact file and line in case it's useful
   when this gets picked up.
3. **`FlagCard` never implements the "recovers points, never cost" framing.**
   `frontend/components/ui/flag-card.tsx:154-157` always renders a flat `"{delta} pts"`, with no
   different copy for a dismissed flag. This was a specific decision communicated directly, per
   `ml/docs/Memory.md:53` ("Told Yash so the reviewer UI labels it as recovery, not cost"). Not built
   yet anywhere I can find in the frontend.
4. **`IntegrityGauge`'s band naming doesn't match the shared vocabulary.** `frontend/components/ui/integrity-gauge.tsx:119-127`
   labels the sub-70 state `"Review required"`. `ml/docs/Design.md:36-43` and `ml/docs/Rules.md:108-116`
   both call that band `suppressed`. Low severity, just a naming mismatch, flagging since it's the exact
   kind of vocabulary drift `contracts/detector-registry.json` exists to prevent for detector types and
   nothing currently does the same for band names.

## H. Open questions

1. Now that Yash has committed directly into `ml/tests/` and `ml/docs/` (item E4), do you want a
   standing rule about it, or was this a one-time, contract-test-specific exception? I did not decide
   this myself since it's a process call, not a fact on disk.
2. `backend/docs/Memory.md:124` says the calibration-window divergence (item G1) should be revisited
   "only if the two engines are ever meant to converge on one behaviour." Is that still the plan, or is
   it worth raising with Yash before the demo video regardless, since it touches the "observe-only"
   promise PRD.md makes for the product, not just for `ml/`?
3. The demo video is scheduled for tomorrow evening (19 Sep) and, per section C's last row, the
   frontend renders nothing live at all. Does the video demo `ml/`'s own `replay.py`/`evaluate/` output
   directly, the way Phase 6 was built for, rather than the (currently mock) product UI? I could not
   determine the demo plan from the repo.
4. `contracts/detector-registry.json:78`'s open question about `visibility_loss`/`face_absent` LLR
   overlap: is resolving it on anyone's list before submission, or is it fine to leave as a documented
   open question?
