# Tree

For containment and descent: an organisational chart, a taxonomy, a decomposition, a
dependency hierarchy. Use it when every node has exactly one parent.

## Layout

Root at the top, children fanning out below — or root at the left and children to the right
when the labels are long. Nodes are small rectangles, `rx="6"`, 120–180px wide and 40–52px
high, with an `Inter` 12px/600 name and an optional `JetBrains Mono` 9px sublabel.

**Pick at most two node widths for the whole drawing.** Widths that vary with the length of
the label make the tree look like it encodes something it does not.

## Connectors

Elbows, never diagonals, and drawn before the nodes. The parent drops a short vertical line,
a horizontal bus spans the siblings, and each child takes a short vertical drop into its top
edge:

```svg
<path d="M px,py V busY M leftX,busY H rightX M cx,busY V cy" fill="none"
      stroke="#4f5d75" stroke-width="1"/>
```

Every node connects to its immediate parent. A line from a node to its grandchild, skipping
the level between, is a drawing error even when the omitted node is uninteresting.

## Limits

Depth of four — root plus three tiers — and no more than five children per level. Past that
the labels shrink below readable size, and the answer is to split the tree or to summarise a
branch as a single node named for what it contains.

## Focal

One node in `accent`: the root, or one critical leaf. Not both — accenting the root and a
leaf makes the reader look for a relationship between them that the tree does not claim.

## Anti-patterns

- Five or more levels on one page.
- Diagonal connectors.
- Widely varying node widths.
- A "tree" whose nodes have several parents. That is a dependency graph; draw an
  architecture instead, or say it in prose.
