# Gantt

For a plan with dates: tasks that start and end, grouped into phases. Use it when overlap,
parallel tracks and the order of milestones are the message — a work programme, a research
schedule, a project report.

## Layout

Inside `viewBox="0 0 1000 500"` or taller as the task count needs:

- **Label column** from x=20 to x=200. Task names in `Inter` 11px/600; phase names as
  `JetBrains Mono` 7px eyebrows above each group.
- **Timeline** from x=200 to x=960. Time runs left to right.
- **One row per task, 40px tall**, with the bar 24px high centred in it.
- Time axis labels in `JetBrains Mono` 8px along the top at even pitch, with a hairline
  separator below them.
- **Phases** get a zone rectangle behind their rows — `rgba(45,49,66,0.02)` fill,
  `rgba(45,49,66,0.10)` stroke — with the phase name in the left margin.
- One focal bar in `accent`: the critical deliverable. Every other bar is
  `rgba(79,93,117,0.15)` with a `muted` stroke.
- An optional dashed vertical line marks today or a deadline.

**The time axis must be proportional.** A task that runs twice as long is twice as wide. A
bar stretched to fill its row, or shortened to fit a label, turns a schedule into a picture of
a schedule.

## Anti-patterns

- More than about twelve tasks on one sheet — group them into phases and draw the phases.
- Dependencies drawn as arrows across the whole chart; if the order matters that much, the
  reader needs a flowchart as well.
- Bars that all start at the left edge, which hides exactly what the chart exists to show.
- A milestone drawn as a one-day bar rather than a marker.
