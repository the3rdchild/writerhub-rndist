# Quadrant

For positioning on two axes: impact against effort, reach against frequency, a portfolio map,
a 2x2 decision frame. Use it when *where a thing sits relative to the others* is the message.

## Layout

A 1px `ink` cross through the centre. Items are small dots (`r="4"`) with their labels 8-10px
away, never crossing an axis line.

**Axis labels are one word at each arrow tip.** No arrows baked into the text, no
parentheses, no "HIGH"/"LOW" modifiers — `JetBrains Mono` 9px, uppercase,
`letter-spacing="0.18em"`, flanking the tip rather than sitting on the line. Stop the arrow
60-80px short of the edge so the label has room beyond it.

Never label the midpoint. The centre of a quadrant chart is a boundary, not a value.

About twelve items maximum. Beyond that, cluster them or split the chart.

Accent goes on the "do first" item, usually top-right.

## Naming the quadrants

Optional, and useful when the frame is well known — "quick wins", "money pit". Put them in
`JetBrains Mono` 8px in `soft`, in the corner, not the centre. If naming all four takes effort,
the axes are probably wrong.

## Anti-patterns

- Four filled quadrants in four colours. Position and label already do the work; colour only
  adds noise.
- An item sitting on an axis line, which leaves its quadrant ambiguous.
- Axes without names — the commonest failure, and the one that makes the drawing meaningless.
- Precision the data does not support. If the placements are judgement calls, say so in the
  caption instead of implying measurement.
