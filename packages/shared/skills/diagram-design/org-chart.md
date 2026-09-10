# Org chart

For who reports to whom, or who owns what: a team structure, a governance chart, a routing
map for decisions. Use it when the reader needs to find a person or a unit and see where it
sits.

## Layout

Root at the top, units fanning out below. Each node is a rectangle (`rx="6"`) with the unit or
role in `Inter` 12px/600 and, optionally, the holder's name or headcount in `JetBrains Mono`
9px beneath.

**Connectors are elbows, never diagonals**, and drawn before the boxes: a short vertical drop
from the parent, a horizontal bus across the siblings, then a short drop into each child's top
edge.

Depth of four and about five children per level. Beyond that, draw one branch and say the
others are elsewhere — an org chart that fits everyone at 6px is a chart nobody reads.

A dotted line means a secondary reporting line. Use it sparingly; two solid parents is not a
tree and this drawing cannot show it honestly.

One node in `accent`: the unit the surrounding text is about.

## Anti-patterns

- Boxes of wildly varying width. Pick two widths at most.
- A vacant role drawn identically to a filled one. Mark it, or leave it out.
- Reporting lines that cross. Reorder the siblings instead.
- Titles so long they need two lines while the boxes stay one line tall.
