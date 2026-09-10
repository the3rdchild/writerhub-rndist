# Flowchart

For decision logic: an algorithm, a branching procedure, a routing rule. Use it when the
reader must be able to follow a path and see where each answer leads.

## Layout

Flow runs top-to-bottom. **Shape carries meaning, colour does not:**

| Shape | Means |
|---|---|
| `<rect rx="20">` | Start or end |
| `<rect rx="6">` | A step, an action |
| `<polygon>` diamond | A decision |
| `<circle r="4">` filled `ink` | A merge point where branches rejoin |

From a diamond, send *yes* to the right and *no* downward — but **label every outgoing
arrow anyway**, because a reader who joins the diagram in the middle has no convention to
lean on. A decision with more than three exits is not one decision; nest it.

## Focal

The accent goes on the happy path, *or* on the single most consequential decision. Never on
every diamond: if all decisions are highlighted, none is.

## Crossing

Branches that rejoin should meet at a merge dot rather than having two arrowheads land on
the same node edge. If two arrows must cross, hop one of them.

## Anti-patterns

- Using fill colour to signal node type — the shape already does that.
- A diamond with four exits.
- Unlabelled branches.
- A flow that runs bottom-to-top for part of its length.
