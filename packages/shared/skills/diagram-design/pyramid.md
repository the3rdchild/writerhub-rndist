# Pyramid / funnel

For ranked layers: a hierarchy of needs, an order of priority, a funnel from audience to
conversion. Use it when the reader should see that one layer rests on another, or that a
population narrows at each step.

## Pick one orientation and hold it

- **Pyramid**, point up — the apex is the rarest or most valuable; the base is the
  foundation.
- **Funnel**, point down — the top is the widest audience; the narrow end is what converted.

Never mix them in one drawing: the same shape then means two different things at two heights.

## Layout

Four to six layers, each a `<polygon>` trapezoid of four points, all the same height (56-72px).
Widths change linearly from base to apex.

**When the funnel shows real counts, the widths must be proportional to them.** A funnel drawn
with even steps while the data drops 80% then 5% is a false picture, and the reader has no way
to tell. Put the counts in the drawing as side annotations — `−40%`, `1.240 → 310` — so the
picture never has to be measured.

Each layer carries its name centred inside in `Inter` 12-14px/600, with an optional sublabel
in `JetBrains Mono` 9-10px. Side annotations sit outside the shape.

One layer in `accent`: the one under discussion, or the step where the drop-off is worst.

## Anti-patterns

- A pyramid whose layers are not actually hierarchical — that is a list, and a list reads
  better as a list.
- Even widths on a funnel with uneven data.
- More than six layers; the top ones become slivers with unreadable labels.
- A different colour per layer, which erases the ranking the shape exists to show.
