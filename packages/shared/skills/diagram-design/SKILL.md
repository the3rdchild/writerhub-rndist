# Editorial diagrams

How to draw a diagram that belongs in a typeset document: one self-contained inline
`<svg>`, restrained, and consistent with every other diagram in the file.

Adapted from `diagram-design` by cathrynlavery (MIT). See NOTICE.

## Before you draw

Ask: *would the reader learn more from this than from a well-written paragraph?* If no,
write the paragraph. A list of things is a list. A before/after is a table. A single box
with a label is a sentence.

**The highest-quality move is usually deletion.** Two nodes that always travel together
are one node. A connection whose meaning is already obvious from the layout is noise.
Target density is about 4 out of 10 — enough to be complete, not so dense it needs its
own key. Above nine nodes you probably have two diagrams.

## How it reaches the document

Call `insert_diagram` with one complete `<svg>` element and nothing around it. It lands in
a code block the writer can open and edit by hand, so the source you send is the source
they will read.

Six constraints are enforced by the editor, not by taste. Violating them means the diagram
is rejected with a visible message, or silently missing from the exported file:

1. **A `viewBox` is required.** Export measures the drawing from it. `viewBox="0 0 1000 480"`.
2. **The viewBox must contain the whole drawing, and be at most 1.5x taller than it is
   wide.** The first half of that sentence outranks the second. A drawing that runs past
   its viewBox is silently cut off — it parses, it renders, and a third of it is simply
   missing, with nothing to tell the reader. So when the drawing does not fit, **never
   shrink the viewBox**: remove nodes, shorten labels, or change the layout. A top-to-bottom
   flow of nine steps that will not fit is two diagrams, or a flow with fewer steps.

   The 1.5 comes from the paper: an A4 content box is roughly 642x971px, and a diagram is
   always scaled to the column width, so anything taller overruns a single page.
3. **No `<style>` element.** CSS inside an SVG is not scoped; one rule would restyle the
   whole page. Put every visual property on the element as a presentation attribute:
   `fill=`, `stroke=`, `font-family=`, `font-size=`.
4. **No `<foreignObject>`, `<image>`, `<script>`, `<a>`, or animation elements.**
5. **Nothing may point outside the file.** `url(#arrow)` is fine; any URL is not.
6. **Fonts must be ones the document can embed.** Use `Inter` for labels, `JetBrains Mono`
   for eyebrows and codes, `Source Serif 4` for a display line. Anything else falls back to
   a system font in the exported PDF and DOCX, and the diagram stops matching the page.

Give every `<svg>` a `<title>` and a `<desc>` as its first two children, and point
`aria-labelledby` at their ids. The `<desc>` is also how the diagram can later be redrawn
without re-reading its coordinates, so state what it shows, not that it is a diagram.

**The caption belongs in the document, not in the drawing.** Do not put a heading, an
eyebrow, or a figure number inside the SVG. Write the diagram, then write the caption as an
ordinary paragraph, so it can be numbered and listed like any other figure.

## Tokens

Refer to roles, never to hex values in prose. These are the values to write.

| Role | Light | Dark | Used for |
|---|---|---|---|
| `paper` | `#f5f5f5` | `#2d3142` | Background, default node fill |
| `paper-2` | `#ececec` | `#393e53` | Secondary fill |
| `ink` | `#2d3142` | `#f5f5f5` | Primary text and stroke |
| `muted` | `#4f5d75` | `#bfc0c0` | Secondary text, default arrows |
| `soft` | `#7a8399` | `#8e98ac` | Sublabels, zone labels |
| `rule` | `rgba(45,49,66,0.12)` | `rgba(245,245,245,0.12)` | Hairlines |
| `accent` | `#eb6c36` | `#f08a59` | The focal node — **1 or 2 per diagram** |
| `accent-tint` | `rgba(235,108,54,0.08)` | `rgba(240,138,89,0.10)` | Fill behind an accent border |
| `link` | `#2e5aa8` | `#6a95d8` | External calls, HTTP, API |

Light is the default. Draw dark only when the writer asks for it, or when the diagram will
sit inside a dark design. To convert, flip the roles and turn every `rgba(45,49,66, X)` into
`rgba(245,245,245, X)` at the same opacity.

**The accent is editorial, not a flag.** Using it on five nodes destroys the only signal the
diagram has. One node, occasionally two: the thing you want read first.

## Shape, stroke, type

- Node: `<rect rx="6">`, fill `paper`, stroke `rule` at `stroke-width="1"`. Height 44–64.
- Focal node: stroke `accent` at `1.4`, fill `accent-tint`.
- Arrows: `stroke-width="1.2"`, `muted`, with `marker-end="url(#arrow)"`. Secondary,
  optional and return flows use `stroke-width="1"` plus `stroke-dasharray="4,3"`.
- Node label: `Inter`, 12–14px, weight 600, `ink`. Sublabel: `JetBrains Mono`, 9px, `soft`.
- Eyebrow and tag: `JetBrains Mono`, 7–8px, uppercase, `letter-spacing="0.14em"`, `soft`.
- Text is positioned, not flowed: SVG has no wrapping. Two lines means two `<text>`
  elements, or `<tspan>` with an explicit `dy`.

Define arrow markers once in `<defs>`:

```svg
<marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
  <polygon points="0 0, 8 3, 0 6" fill="#4f5d75"/>
</marker>
```

## Connectors

**Right-angle connectors, never diagonal.** A plain `<line>` is correct only when the two
endpoints share an x or a y. Anything else is an elbow path with 8px rounded corners:

```svg
<path d="M x1,y1 H mid-8 Q mid,y1 mid,y1+8 V y2-8 Q mid,y2 mid+8,y2 H x2"
      fill="none" stroke="#4f5d75" stroke-width="1.2" marker-end="url(#arrow)"/>
```

Leave and enter through the edge that matches the direction of travel: top and bottom ports
for a mostly-vertical run, left and right for a mostly-horizontal one. An arrow arriving at
the side of a node on a vertical path reads as puncturing it.

**Draw in this order — background, zones, arrows, then nodes.** Arrows drawn last cross over
the boxes they connect.

Label an arrow by placing a small `paper`-filled `<rect>` on the line and the text on top of
it, so the line does not run through the letters.

## Choosing the layout

| The reader needs to see | Type | Load |
|---|---|---|
| Which parts a system has and how they talk | Architecture | `architecture` |
| A decision and where each answer leads | Flowchart | `flowchart` |
| When things happened, in proportion | Timeline | `timeline` |
| Who does what, in what order | Swimlane | `swimlane` |
| Stacked levels of abstraction | Layer stack | `layers` |
| What contains or descends from what | Tree | `tree` |

Read the matching file with `read_skill('diagram-design', '<name>')` before drawing. Each one
carries the layout grammar and the mistakes specific to that shape. Do not improvise a type
that is not listed: a shape the reader has to decode is worse than a table.
