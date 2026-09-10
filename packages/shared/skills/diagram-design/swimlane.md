# Swimlane

For a process with more than one actor: who does what, in what order, and where the work
changes hands. Use it when the handoffs are the point.

## Layout

One horizontal lane per actor, stacked. Label each lane in the left margin with a
`JetBrains Mono` uppercase eyebrow. Divide lanes with 1px `rule` hairlines that run the full
width, so the reader can follow a lane without tracing it.

Steps are rectangles placed inside the lane of whoever performs them, and time runs
left-to-right across all lanes. Do not force an equal number of steps per lane — a lane with
one step is an honest finding about the process, not a gap to fill.

## Handoffs

Arrows that cross a lane boundary are the most informative edges in the drawing: they are
where the work waits, and where it gets dropped. Consider putting the accent on the handoff
that introduces the most delay or coupling.

Route them as elbows — leave the source's bottom edge, cross the boundary vertically, then
run horizontally into the destination's side.

## Anti-patterns

- A step drawn straddling two lanes. Pick one owner; shared ownership is usually the thing
  the diagram should be exposing, not hiding.
- Unlabelled lanes.
- Arrows that snake backwards repeatedly — reorder the steps so the flow is mostly straight,
  or accept that the process itself is the problem and say so in the prose.
- More than six lanes.
