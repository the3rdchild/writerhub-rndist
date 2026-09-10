# Fishbone

For root-cause analysis: one observed effect, causes grouped by category, sub-causes hanging
off each category. Use it when the reader needs to see **what was investigated**, not only
what was concluded.

## Layout

A horizontal spine in `ink` at 1.2px runs left to right across the vertical centre and ends
in an arrowhead entering the **effect box** at the right — the observed problem, stated as a
sentence.

Category bones are straight diagonals at **60°** to the spine, alternating above and below
and evenly spaced along it. Each carries its category name at the outer end in a small tag
box (`rx="4"`, not a pill) in `Inter` 12px/600.

Sub-causes are short 32px horizontal ticks in `soft` branching off each bone, with the label
in `JetBrains Mono` 9px past the open end.

For a spine at `y = CY` with the effect box's left edge at `x = HEAD`, bone `k` (1-6) attaches
at `HEAD - 160 - k*160`, odd `k` above and even `k` below.

**Diagonals are correct here.** The right-angle connector rule in the main skill does not
apply to the bones and their ticks — the 60° fan is this type's defining grammar. It still
applies to anything else in the drawing.

Draw in this order: spine, bones, ticks, category tags, effect box.

## Focal

Exactly one bone is the **confirmed** root cause: its line in `accent`, its tag in
`accent-tint` with an `accent` stroke. The effect box is styled the same way. That pair is
the entire accent budget — everything else stays `ink`, `muted`, `soft`.

If nothing is confirmed yet, accent nothing and say so in the caption. A fishbone that
highlights a suspicion looks exactly like one that highlights a finding.

## Anti-patterns

- More than six categories; the bones stop being distinguishable.
- Sub-causes that restate the category in other words.
- An effect stated as a topic ("performance") rather than an observation ("checkout takes
  11 seconds at peak").
