# Architecture

For system overviews, integration maps, and data flow between components. Use it when the
reader needs to know which parts exist and how they talk to each other.

## Layout

Group components by tier or by trust boundary — client, then service, then storage; or
public, then private. The primary flow runs either left-to-right or top-to-bottom. Pick one
and hold it for the whole drawing.

Give each node a rectangle with a name in `Inter` 13px/600 and one sublabel in
`JetBrains Mono` 9px underneath saying what it actually is (`SSR + MDX`, `assets · og images`).
A node whose name needs a sentence to explain it is two nodes, or the wrong name.

A small uppercase tag above the node — `EXT`, `EDGE`, `ORIG`, `CMS` — tells the reader which
side of the boundary it lives on without drawing another box.

## Zones

Two or more nodes serving the same tier can share a zone rectangle, drawn before the arrows:

```svg
<rect x="616" y="128" width="164" height="272" rx="8"
      fill="rgba(45,49,66,0.02)" stroke="rgba(45,49,66,0.10)" stroke-width="0.8"/>
<rect x="672" y="132" width="52" height="12" rx="2" fill="#f5f5f5"/>
<text x="698" y="141" fill="rgba(45,49,66,0.40)" font-size="7"
      font-family="JetBrains Mono, monospace" text-anchor="middle" letter-spacing="0.14em">CONTENT</text>
```

The label sits on a `paper`-filled mask so it interrupts the boundary line rather than
crossing it. Leave at least 16px between the label and the first node inside. Keep the fill
at 2% ink — anything stronger competes with the nodes. **Three zones maximum**; past that the
reader is looking at a swimlane, so draw one of those instead.

## Arrows

Label the edges that carry a protocol or a payload — `HTTPS`, `QUERY`, `READ MDX` — in
`JetBrains Mono` 8px on a `paper` mask. Use `link` blue for calls that leave the system.
Returns, caches, and async writes are dashed.

When two arrows must cross, put a small hop on the less important one:

```svg
<path d="M x1,y H cx-8 a 8,8 0 0,1 16,0 H x2" fill="none" stroke="#4f5d75" stroke-width="1.2"/>
```

Never bridge both — that reads as a knot rather than a crossing.

## Focal node

One node in `accent`: the integration point everything depends on, the store that holds the
truth, or the component the surrounding text is actually about. If you cannot name why a
node is focal, none of them is.

## Anti-patterns

- Every node a different colour — the hierarchy disappears.
- Diagonal connectors.
- A legend explaining colours that carry no meaning.
- Boxes labelled with product names only, so the diagram says nothing about behaviour.
