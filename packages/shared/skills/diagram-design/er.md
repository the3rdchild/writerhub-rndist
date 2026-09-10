# ER / data model

For entities and how they relate: a conceptual or logical data model, a domain model, the
resources of an API. Use it when the story is *what exists and how many of each*.

Not for the physical schema. This is entity level — lines join boxes and carry cardinality at
each end. Real tables with SQL types and column-to-column foreign keys are a different
drawing, and this skill does not yet carry it.

## Layout

Each entity is a box in two sections:

- **Header** — a small `ENTITY` tag in `JetBrains Mono` 7px above the entity name in `Inter`
  13px/600.
- **Body** — one field per line in `JetBrains Mono` 9px. Prefix the primary key with `#` and
  each foreign key with `→`. Let the box take its natural height; padding every entity to the
  same height suggests a symmetry the model does not have.

Relationships are lines between boxes with cardinality written at **both** ends — `1`, `N`,
`0..1`, `1..*` in `JetBrains Mono` 8px, sitting 10-12px clear of the box edge. An optional
verb ("has", "belongs to") sits centred on the line.

Place related entities near each other so most relationships are straight. A model whose
lines cross repeatedly is a model laid out in the wrong order, not a complex one.

Accent goes on the central entity — the one the rest of the model hangs off.

## Anti-patterns

- One line per foreign key on a model with dozens of them. Lay out by cluster instead.
- Cardinality written at one end only, which leaves the other end a guess.
- Cardinality notation that changes between relationships in the same drawing.
- Attribute lists so long the box becomes a table. Show the keys and what identifies the
  entity; the rest belongs in prose or an appendix.
