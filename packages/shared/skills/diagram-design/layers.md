# Layer stack

For levels of abstraction stacked on one another: a technology stack, a protocol model, a
hierarchy of scope. Use it when the relationship is "sits on top of", not "flows into".

## Layout

Full-width horizontal bands, each the same x and the same width, stacked vertically. Four to
six layers; height 56–72px each. Every row carries three things, left to right:

1. an index tag on the far left — `L3`, `07`, `APPLICATION` — in `JetBrains Mono` 8px;
2. the layer name, `Inter` 14–16px/600;
3. a short note on the far right in `JetBrains Mono` 9px `muted`.

Separate layers with 1px `rule` hairlines and draw the outer silhouette in `muted`. Choose
either alternating `paper` / `paper-2` fills or a single fill with hairline dividers — one
or the other, not both.

Outside the stack, in the left margin, put a small arrow and a mono label saying which way
the hierarchy runs: `abstraction ↑`, `packets ↓`. Without it the reader has to guess whether
the top or the bottom is the foundation.

## Focal

One layer in `accent` with `accent-tint` behind it: the bottleneck, the layer under
discussion, the one the surrounding paragraph is about.

## Anti-patterns

- Layers that are not actually hierarchical — that is an architecture or a swimlane.
- Skipping an index (L3 then L5) without saying why.
- A different colour per layer, which erases the hierarchy the shape is meant to show.
- Varying layer heights for no stated reason; the reader reads height as importance.
