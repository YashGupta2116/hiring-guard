# PRD: VeriTrust Integrity Engine

Component: `veritrust-ml`
Owner: solo
Version: 1.0
Status: pre-build

---

## 1. What this is

The integrity engine is the part of VeriTrust that turns raw behavioural signals into an explainable integrity score and a list of reviewable flags.

It is not a classifier that outputs "cheating" or "not cheating". It is an evidence-fusion system that outputs:

- a continuous integrity confidence, 0 to 100
- a list of flags, each carrying its own evidence, severity, and the exact number of points it cost the score
- a list of unscored windows, meaning intervals where a signal was unavailable and no judgement was made

Everything downstream of this component (dashboard, report, warnings) renders what the engine produced. Nothing outside this component recomputes it. The one recomputation that does happen, adjudication (F9), is the engine itself replaying its own stored evidence with terms removed, not a second system re-deriving the score.

## 2. Why it exists

Existing proctoring tools output a binary verdict from a single signal and are widely distrusted for exactly that reason. A candidate who looks away to think gets the same treatment as one reading from a second screen. The engine's job is to make the difference between those two visible and defensible: corroboration across independent channels, evidence that decays, negative evidence that pushes the score back up, and a reviewer who can dismiss any flag and watch the score recompute.

## 3. What kind of model this is, and why

This is a **calibrated probabilistic fusion engine**, not a neural network.

Each detector emits an observation with a raw confidence. A calibration curve fitted per detector maps that confidence to a log-likelihood ratio. LLRs accumulate per channel with exponential decay, get boosted when independent channels agree inside a short window, and combine through a weighted sum into a score.

This choice is deliberate and the rationale must survive into the demo:

- **It trains on tens of examples, not tens of thousands.** No labelled dataset of real cheating exists and we cannot build one in a hackathon.
- **It is explainable by construction.** Every flag carries its LLR contribution, so "this cost 14.2 points because gaze and scene agreed within 4 seconds" is a computed fact rather than a post-hoc rationalisation.
- **It runs in under 50 ms per batch in a Lambda** with no GPU and no model server.
- **A reviewer's dismissal recomputes the score exactly**, because removing a term from a sum is exact. With a black-box classifier it would be a guess.

The perception layer (gaze, face count, scene objects) uses **pretrained MediaPipe models off the shelf**. We do not train them. Training a gaze model is not in scope and would be a worse gaze model than the one Google ships.

## 4. Users

| User | What they need from this component |
|---|---|
| **Interviewer / reviewer** | A score that moves for reasons they can read, flags they can act on, and confidence that a dismissal actually changes the outcome |
| **Candidate** | Not to be flagged for thinking, blinking, a bad camera, or a dropped connection. Not to be judged during any interval where the system was blind |
| **Me, during the build** | A component testable offline against recorded fixtures, with no AWS and no browser in the loop |
| **Judges** | A two-minute explanation of how the score is produced that does not bottom out in "the model decided" |

## 5. Signal channels

Six channels are defined in the schema. Five ship in v1.

| Channel | Source | Detectors | v1 |
|---|---|---|---|
| `gaze` | Browser MediaPipe FaceLandmarker | offscreen glance, persistent offscreen, fixed external focus | Ships |
| `scene` | Browser MediaPipe FaceDetector | face absent, multiple faces | Ships |
| `focus` | Browser DOM events | tab hidden, window blur, fullscreen exit | Ships |
| `input` | Browser clipboard and keystroke timing | large paste, low typed ratio, burst rate, rhythm shift | Ships |
| `network` | Client and socket state | telemetry gap, clock anomaly, client inconsistency | Ships, zero weight |
| `audio` | Server-side speaker clustering | second voice | Declared, disabled in v1 |

**Audio is declared in the schema and disabled in the v1 weights file.** Second-voice detection needs server-side speaker embeddings, which needs the media pipeline we cut for the hackathon. The channel exists so enabling it later is a weights change, not a refactor. In the demo this is stated openly rather than faked.

`network` carries zero weight by design. A dropped connection, a clock skew or an impossible client state is a **data quality note to the reviewer**, never a penalty to the candidate. It appears in the report and contributes nothing to the score.

## 6. Features

### F1. Observation ingestion and normalisation
Accepts detector output in one schema regardless of origin (browser, offline video, synthetic fixture). Validates, clock-corrects, deduplicates, orders by sequence.

### F2. Calibration
Per-detector curves fitted offline on a small labelled set, mapping raw confidence to LLR. Shipped as a single versioned `weights.json`. The runtime never fits anything.

### F3. Per-candidate baselining
The first 60 seconds of a session are observe-only. Baselines captured: gaze home region, head pose neutral, typing rhythm distribution, glance rate during normal conversation. Thresholds are personalised against these. If calibration cannot complete, population defaults apply and the session is marked `calibration: fallback`, which widens the error bars on every gaze flag and must appear in the report.

### F4. Evidence accumulation
Duration-scaled LLR, per-channel exponential decay, negative evidence for sustained clean behaviour.

### F5. Corroboration
Independent channels agreeing inside a 6 second window multiply the incoming evidence. Same-channel repeats add with damping instead. This is the single highest-value mechanic for suppressing false positives and the thing the demo leads with.

### F6. Flag emission
Threshold crossing produces a flag with severity, narrative, corroborating channels, media offset, and the exact score delta computed by re-running the score with and without that evidence.

### F7. Flag merging
Same type and channel within 15 seconds extends the existing flag rather than creating a new row.

### F8. Unscored windows
Any detector suppression, signal loss or unreplayable telemetry gap opens a window where that channel neither accumulates nor decays. Reported explicitly. Never inferred as suspicion.

### F9. Adjudication recompute
Given a set of dismissed or downgraded flag ids, recompute the score exactly, deterministically, without replaying the session.

### F10. Offline evaluation harness
Runs the engine over labelled fixture sessions and emits metrics plus figures: flag precision and recall, score separation between honest and staged sessions, calibration reliability, sensitivity sweep across lenient, standard and strict.

## 7. Success criteria

Targets for v1. These are the numbers the phase exit criteria check against.

| Metric | Target | Why this number |
|---|---|---|
| Zero high-severity flags on honest fixture sessions | Hard requirement | One false accusation in the demo kills the product's premise |
| Flag precision on staged sessions | 0.80 or better | Below this, the reviewer stops trusting the list |
| Staged-session recall on scripted events | 0.70 or better | Missing a staged phone-in-frame is visible on camera in the demo |
| Median score, honest sessions | 90 or above | A clean session must look clean |
| Median score, staged sessions | 70 or below | Must cross into the review band |
| Fusion latency, per 20-observation batch | under 50 ms, p95 | Lambda budget, leaves room for cold start |
| Adjudication recompute | under 10 ms | The score must visibly move when the reviewer clicks dismiss |
| Determinism | Byte-identical output for identical input and seed | Required for the fixtures to be a regression test |

## 8. Out of scope for v1

- Training or fine-tuning any perception model
- Audio and speaker diarisation
- The offline rescore pass with heavier models
- Identity drift via face embeddings
- Screen-track perceptual hashing
- Any per-organisation or online learning
- Anything that requires a GPU
- The dashboard, the report renderer, the WebSocket transport. This component produces data structures. It does not render them.

## 9. Ethical constraints that are product requirements, not preferences

These are testable and each one has a corresponding rule in `Rules.md` and a test in Phase 1.

1. The engine never emits a boolean verdict field. No `is_cheating`, no `passed`, no `verdict`.
2. Absence of data never increases suspicion. Every code path that loses a signal opens an unscored window.
3. Every flag is reconstructible: given its observation ids and the weights version, its score delta recomputes exactly.
4. Narratives state the observation and never the inference. "Gaze left the screen region for 47 seconds while a second channel agreed" is allowed. "Candidate was reading from notes" is not.
5. No candidate-identifying content enters the engine. It consumes numeric features and timestamps only, never frames, never transcript text, never keystroke identities.
6. The weights version, calibration status and every unscored window are part of the output, not a debug log. A consumer cannot render the score without also being handed what the system could not see.
