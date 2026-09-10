# Venn

For overlap between sets: what two or three groups share and what only one of them has. Use it
when the intersection is the point — and only then.

## Layout

Two or three circles, never more. Four sets cannot be drawn as circles without lying about
which regions exist, and a reader cannot recover the truth from the picture.

Circles are stroked, not filled solid: `rgba(79,93,117,0.10)` fill with a `muted` stroke, so
the overlaps read as mixtures rather than as layers stacked on top of each other.

Each set gets a name outside its circle in `Inter` 12px/600. Contents sit inside the region
they belong to, in `JetBrains Mono` 9px, one item per line — three or four per region at most.

The intersection is where the accent goes, when it is the point.

## When the sizes carry meaning

Only make circles proportional to their sets when you have the counts and the overlap can
actually be drawn at that scale — otherwise draw them equal and put the counts in the labels.
A circle that is slightly bigger for aesthetic reasons will be read as a bigger set.

## Anti-patterns

- Four or more circles.
- An empty intersection drawn anyway, which promises a relationship that does not exist.
- Solid fills that make the overlap a third opaque colour, hiding what it is made of.
- Using a Venn for a comparison with no overlap. That is a table.
