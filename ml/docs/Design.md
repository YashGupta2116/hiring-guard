# Design: VeriTrust Integrity Engine

Component: `veritrust-ml`

This component ships no UI. What it ships visually is the evaluation figures, the demo timeline chart, and the values the product's gauge renders from. All three must match the product design system exactly, because a judge who sees an eval plot in one palette and a dashboard in another reads two projects instead of one.

Every token here is the same one defined in the VeriTrust Figma design system. Do not invent a colour.

---

## 1. Palette

### Neutrals

| Token | Hex | Use in figures |
|---|---|---|
| `sand/0` | `#FFFFFF` | figure background |
| `sand/100` | `#F7F3EC` | panel background, axes face |
| `sand/300` | `#E3DACB` | grid lines |
| `sand/500` | `#8D8372` | axis spines, tick marks |
| `sand/600` | `#6E6558` | axis labels, annotations |
| `sand/800` | `#2B2620` | titles, primary text |

### Semantic

| Token | Hex | Meaning, and nothing else |
|---|---|---|
| `clay/400` | `#B08968` | the primary data series, the score line |
| `clay/600` | `#7B5A3D` | emphasised series, corroborated evidence |
| `sage/400` | `#7A8B6F` | honest sessions, clear band, typed code |
| `amber/400` | `#C99A4B` | medium severity, review band, pasted code |
| `terra/400` | `#B5654D` | high severity, suppressed band |
| `slate/400` | `#6E8FA3` | low severity, informational series |
| `sand/400` | `#CFC3AE` | unscored windows, hatched |

Integrity band boundaries, used identically by the figures and the product gauge:

| Band | Range | Colour |
|---|---|---|
| clear | 85 to 100 | `sage/400` |
| review | 70 to 84 | `amber/400` |
| suppressed | below 70 | `terra/400` |
| calibrating | no score yet | `sand/400` |

## 2. Rules the figures must obey

1. **No red.** Terracotta stands in everywhere. A plot of a false-positive rate is not an alarm.
2. **Unscored is neutral plus a hatch**, `sand/400` fill with 45-degree `///` hatching, never amber and never terracotta. An unscored window sitting next to a medium flag must be unmistakable at a glance and in greyscale.
3. **Severity is encoded twice**, by colour and by marker shape: low is a hollow circle, medium a half-filled circle, high a filled circle with a ring. Print every figure in greyscale before accepting it.
4. **Honest and staged sessions are distinguished by colour and by hatch**, not colour alone.
5. **One accent per figure.** If a figure needs four hues to be readable, it is two figures.
6. **No figure title inside the image.** Titles live in the report markdown, so the figure can be dropped into a slide with its own heading.
7. **No 3D, no pie charts, no dual y-axes.**

## 3. Typography

| Role | Font | Size | Weight |
|---|---|---|---|
| Figure axis labels | Inter | 11 | 500 |
| Tick labels | Inter | 10 | 400 |
| Annotations, legend | Inter | 10 | 400 |
| Numerals in figures, timestamps, scores | JetBrains Mono | 10 | 400 |
| Report body | Inter | 14 / 22 | 400 |
| Report headings | Inter | 20 / 28 | 600 |
| Code, weights, detector versions | JetBrains Mono | 13 / 20 | 400 |

Every number in a figure uses tabular figures so ticks do not jitter between frames of the demo replay. If Inter and JetBrains Mono are not installed, fall back to DejaVu Sans and DejaVu Sans Mono and record the substitution in `Memory.md` rather than silently shipping a different look.

## 4. Matplotlib style

Ship `src/vtml/evaluate/vtml.mplstyle` and load it in `figures.py`. Nothing else sets a colour.

```
figure.facecolor      : FFFFFF
axes.facecolor        : F7F3EC
axes.edgecolor        : 8D8372
axes.linewidth        : 0.8
axes.labelcolor       : 6E6558
axes.labelsize        : 11
axes.titlesize        : 0
axes.grid             : True
axes.spines.top       : False
axes.spines.right     : False
grid.color            : E3DACB
grid.linewidth        : 0.7
grid.alpha            : 1.0
xtick.color           : 8D8372
ytick.color           : 8D8372
xtick.labelsize       : 10
ytick.labelsize       : 10
font.family           : sans-serif
font.sans-serif       : Inter, DejaVu Sans
legend.frameon        : True
legend.facecolor      : FFFFFF
legend.edgecolor      : E3DACB
legend.fontsize       : 10
lines.linewidth       : 1.8
lines.solid_capstyle  : round
savefig.dpi           : 200
savefig.bbox          : tight
savefig.facecolor     : FFFFFF
```

Figure sizes: single-column figures 7.0 by 4.0 inches, the session timeline 12.0 by 5.0. Export PNG at 200 dpi for the report and SVG for anything that lands in a slide.

## 5. The four evaluation figures

**F1. Score distribution by session type.** Horizontal strip plot, one row per session, `sage/400` filled circles for honest and `terra/400` hollow circles for staged. Vertical band shading behind the plot marks the three integrity bands at 12 percent opacity. The reader should see the two groups separate without reading an axis.

**F2. Reliability curve per detector.** Small multiples, one panel per detector, predicted probability on x and observed frequency on y, `clay/400` line with the diagonal in `sand/500` dashed. Panels for detectors still on priors are drawn with a hatched background and labelled `prior`.

**F3. Sensitivity sweep.** Three grouped bars per metric across lenient, standard and strict, in `sand/400`, `clay/400` and `clay/600`. The target line for each metric is a dashed `sand/600` horizontal rule. Sensitivity is an ordered scale, so it gets an ordered colour ramp rather than three unrelated hues.

**F4. Session timeline.** The centrepiece. Twelve inches wide, three stacked tracks sharing an x axis in `mm:ss`:

- **Track 1, score.** `clay/600` line, 0 to 100, with the three band regions shaded behind it at 12 percent opacity.
- **Track 2, evidence.** One row per channel. Each observation is a tick mark whose height is its LLR. Corroborated evidence is drawn in `clay/600`, everything else in `clay/400`. Unscored windows are `sand/400` hatched blocks spanning the full row height.
- **Track 3, flags.** Markers at emission time using the severity shape and colour, each annotated with its score delta in JetBrains Mono. Dismissed flags are drawn at 40 percent opacity with a strikethrough on the label, never removed, because the dismissal is part of the story.

This figure is what goes in the demo video and on the architecture slide. It is worth twice the time of the other three.

## 6. Report layout

`reports/eval-<version>.md` opens with a summary block before any figure:

```
Weights version   : v1.0.3-fitted
Fixtures          : 20 (10 honest, 10 staged)
Detectors fitted  : 7 of 11
High-severity false positives on honest sessions : 0
Flag precision    : 0.84
Flag recall       : 0.73
Median score      : honest 93.1, staged 64.8
p95 batch latency : 31 ms
```

False positives on honest sessions sit in that block whether the number is zero or not. If the headline number is ever buried below a figure, the report is lying by layout.

## 7. What this component hands the product UI

The engine emits values, the UI renders them. The contract:

| Engine field | UI renders |
|---|---|
| `score` plus `band` | gauge arc colour from the band table in section 1 |
| `status = "calibrating"` | `sand/400` track, the word `Calibrating`, no number |
| `flag.severity` | dot shape and colour, per section 2 rule 3 |
| `flag.score_delta` | the points figure beside the narrative, JetBrains Mono |
| `flag.corroborated_by` | channel icons, the corroborated ones in `clay/600` |
| `unscored` | hatched `sand/400` blocks on the timeline and a report block |
| `calibration = "fallback"` | a note in the methodology appendix, always visible |

The UI never picks a colour from a score. It picks from the band the engine already decided, so a threshold change is one constant in `config.py` and not a hunt through the frontend.
