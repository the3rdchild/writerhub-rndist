# Timeline

For events on an axis: a project's milestones, a release history, the phases of a study.
Use it when *when* matters, and especially when the gaps between events matter.

## Layout

A horizontal hairline across the middle at `stroke-width="1"`, `rule` colour. Tick marks at
the boundaries the reader counts in — months, quarters, sprints — with the label below in
`JetBrains Mono` 9px.

Events are filled circles of `r="4"` sitting on the line. Labels alternate above and below
so they do not collide, each connected to its circle by a 1px hairline drop. A major
milestone gets `r="6"` in `accent` and a heavier label.

## The one rule that is not cosmetic

**The scale must be honest.** If two events are three days apart and the next is eight
months later, the spacing has to show that. Evenly spacing events that were not evenly
spaced turns a diagram into a false claim about the work — and this is the failure the
reader is least able to detect, because the drawing looks deliberate either way.

If one region is too dense to read, break the axis visibly — a pair of short diagonal
strokes through the baseline — rather than compressing it quietly.

## Anti-patterns

- Equal spacing for unequal intervals.
- No unit on the axis.
- Labels stacked at the same height until they overlap.
- More than about nine events; past that, group them into phases.
