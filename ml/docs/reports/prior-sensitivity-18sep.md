# Prior-sensitivity sweep and calibration-window ablation

Two questions about the hand-set priors in `priors.py`: does the verdict
depend on the exact number chosen (the sweep), and what did the
calibration-window fix actually buy, measured rather than cited (the
ablation). Both were run against the two tracked fixtures,
`honest_seed7` and `staged_seed7`, through the shipped engine.

## Method

**One at a time, not jointly.** For each scored channel, every other
channel's priors stay at their shipped default while the target
channel's move. Interaction effects between two channels' priors moving
together are **not computable** from this design, the same way Phase 4
marked precision and recall not computable rather than approximating
them from two fixtures.

**Channel, not detector type.** `priors.py` holds one prior per detector
type, and a channel can own several (gaze owns three: 0.3, 1.4, 1.6).
"Sweeping a channel's prior" scales every detector type registered
under that channel by the same multiplier at once. The full per-type
values are in the CSV; the figure and the stability statistic treat the
channel as the unit, because that is what one F5 panel and one sweep
target are.

**Nine points, 0.25x to 4x, log-spaced.** Multiplier ratio is exactly
`sqrt(2)` per step: 0.25, 0.354, 0.5, 0.707, 1.0, 1.414, 2.0, 2.828, 4.0.
No prior in the registry has a declared lower bound, so a scaled value
going negative is clamped to zero and the clamp is recorded in the CSV;
this never triggers across the tested range.

**Five channels swept, not six.** `network`'s `channel_weight` is `0.0`
by design (`config.py`, `channel_weight` table; `PRD.md` section 5) --
no multiplier on its prior can move a score, so it is excluded outright
rather than drawing a flat line and calling that a stability result.
The five swept are gaze, audio, scene, focus, input.

**Audio is in the sweep but not in the headline.** Audio is declared in
the schema but disabled in v1 (`PRD.md` line 61: "declared, disabled in
v1"); neither fixture ever produces an audio observation, so every
multiplier is a no-op for both scores. A channel that is never
exercised held the verdict trivially, not stably -- it is excluded from
the narrowest-channel headline below, not counted as a pass. Its panel
in F5 is drawn hatched, the same "not computable" treatment F2 already
uses for an unfitted detector, rather than as a flat line that looks
like every other stable channel.

**Override, not monkeypatch.** `fusion/engine.py`'s `Engine.__init__`
takes an optional `priors` keyword, defaulting to `None`; when omitted,
`self._priors` is bound to the exact same `priors.PRIORS` object every
existing call site already used (`fusion/engine.py:56-73`), and
`_process_one`'s lookup at `fusion/engine.py:145` reads `self._priors`
instead of the module global. Nothing is patched and nothing is shared:
each sweep point constructs its own `Engine` with its own copied dict.
Every `Engine(...)` construction in `src/` and `tests/` was grepped to
confirm this: the only two call sites passing `priors=` are the two
this sweep adds.

**Determinism.** `run_sweep()` reads two static fixture files and calls
no RNG and no wall clock. Run twice, the CSV was byte-identical both
before and after this pass's cleanup.

**Leakage.** After the full sweep, a freshly constructed default
`Engine` replays `honest_seed7` and is asserted to still score
`94.28386762280083` -- the pinned baseline. This runs twice inside
`priors_sweep.main()` (before and after the sweep), not once.

## Corrections to prior claims

| Claim | Verdict | Detail |
|---|---|---|
| "Six scored channels" | **Corrected** | Not found as a literal claim in the handoff itself. The "six" figure traces to `PRD.md:52`: "Six channels are defined in the schema. Five ship in v1." That table's "five" (gaze, scene, focus, input, network) excludes **audio**. "Scored" here means `channel_weight != 0` (`config.py` lines 22-31), which is a *different* five: gaze, audio, scene, focus, input, excluding **network**. The two fives differ by one channel (audio versus network), and neither reaches six. |
| Honest A = `94.28386762280083`, B = `93.11` | **Confirmed** | Measured this session: A = 94.28386762280083, B = 93.110106 (see Ablation results) |
| Staged A = `2.35` | **Confirmed** | Measured: A = 2.350196740204917 |
| Five of sixteen honest observations inside the window | **Confirmed** | Measured: 5 of 16, same five timestamps `docs/Memory.md`'s 2026-09-18 entry already names (t=12425, 13251, 28855, 40939, 52802) |

## Stability results

| Channel | Exercised by either fixture | Widest range holding both verdicts |
|---|---|---|
| gaze | yes | full swept range, 0.25x-4x |
| scene | yes | full swept range, 0.25x-4x |
| input | yes | full swept range, 0.25x-4x |
| focus | yes | **0.25x-2.828x** |
| audio | **no** | not applicable -- untested, not stable |

**Focus is the narrowest, and it is a real finding.** Four of five
channels hold both verdicts (honest `clear`, staged `suppressed`) across
the entire tested range, a factor of 16 from 0.25x to 4x. Focus holds up
to ~2.83x and breaks at 4x: the honest fixture's own ambient
window-blur noise, with no scripted event at all, pushes the score from
94.28 down to 80.40 -- out of `clear` and into `review`. This was not
softened and the sweep was not widened to find a friendlier range.

**The break is band drift, not a false flag, and that distinction is
the point.** At every one of the 45 sweep points, including focus at
4x, the honest fixture produces zero flags. The band moved because
enough small, individually-sub-threshold accumulations from ordinary
window-blur noise summed to a lower score; no single observation ever
crossed the flag threshold. The band and the flag count answer
different questions here -- one absorbs the accumulated weight of
ambient noise, the other only fires on a single crossing -- and only
the band is prior-sensitive in this design. A report that only checked
"any false flags on honest?" would have missed this entirely.

**Audio's "full range" is not a second pass.** It is excluded from the
count above because it is untested: with no audio observation in either
fixture, its score never moves at any multiplier. That flat line shows
only that this design has never exercised the audio prior, nothing
about whether the prior itself is safe.

**A secondary, non-headline note on input.** `input`'s two highest
multipliers (2.828x and 4x) produce an identical staged score
(0.0420...) because `input.large_paste`'s scaled LLR saturates against
the existing `llr_clamp_max = 4.0` bound (`config.py`) before the
sigmoid ever sees it. This is a real saturation effect in the scoring
formula itself, not a bug in the sweep, and it is distinct from the
CSV's `clamped` column, which tracks only this sweep's own floor at
zero (never triggered in this run).

## Ablation results

Condition A is the shipped engine, unmodified. Condition B reproduces
the pre-fix defect (an in-window observation still accumulates LLR and
is eligible for corroboration; only flag emission stays gated) in a
temporary, evaluation-only subclass that is never imported outside
`evaluate/calibration_ablation.py` and carries no config flag.

| Fixture | Condition A (shipped) | Condition B (prior defect) | Observations inside window / total |
|---|---|---|---|
| `honest_seed7` | 94.283868 | 93.110106 | 5 / 16 |
| `staged_seed7` | 2.350197 | 1.933756 | 5 / 20 |

On both fixtures, discarding in-window evidence only ever raises the
score relative to accumulating it: the system declines to charge a
candidate for noise inside a window it calls observe-only. On the
honest fixture that is worth 1.17 points -- the gap between scoring all
sixteen observations and scoring only the eleven that landed after
calibration closed.

## What this does not show

Two synthetic fixtures, one seed each. This is a sensitivity analysis
of the hand-set priors against those two fixtures, not a validation of
the detectors against real behaviour, and it says nothing about
real-world precision or recall -- the same limitation Phase 4's report
already states for every other number in this component. The one-at-
a-time design cannot see interaction effects between two channels'
priors moving together. Audio's clean sweep is a coverage gap, not a
tested guarantee.

## In three sentences

The four hand-set priors that actually see evidence in these fixtures
can move independently by a factor of eleven to sixteen around their
shipped value without changing whether an honest session reads clear or
a staged one reads suppressed. One of the five, `focus`, is narrower
than the rest: pushed to four times its shipped value, ordinary
background noise alone -- not a paste, not a second face -- would be
enough to knock an honest session out of the clear band, though it
would still raise zero flags. The same calibration-window fix these
numbers confirm is worth just over a point to an honest candidate on
this three-minute session, because it stops charging for evidence
collected during a window the product promises not to score -- how
that figure moves on a longer session is not something this ablation
tested.
