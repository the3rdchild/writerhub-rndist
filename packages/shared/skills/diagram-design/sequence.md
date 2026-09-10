# Sequence

For an exchange between actors over time: a request and its response, a protocol, an
authentication path, the reconstruction of an incident. Use it when *order* and *who spoke to
whom* carry the message.

## Layout

Actors are boxes in a row across the top. From each one, a dashed vertical lifeline descends
to the bottom of the drawing. Time runs downward; messages are horizontal arrows between
lifelines.

An **activation bar** — an 8px-wide rectangle in `muted` with a hairline stroke — sits on a
lifeline for the interval that actor holds control. Nested calls stack them.

| Message | Stroke | Arrowhead |
|---|---|---|
| Call, expects a reply | solid `muted`, or `link` when it leaves the system | filled |
| Return | **dashed**, never solid | filled |
| Async, fire-and-forget | dashed `muted` | open |
| The headline success | solid `accent`, one message only | filled |

A message an actor sends to itself is a short U-shaped loop back to the same lifeline, with
the label to its right.

When the flow branches — token valid or invalid, retry or give up — draw one framed fragment
around the alternatives with the condition in its corner. Free-floating if/else arrows leave
the reader guessing which arrows belong to which case.

## Anti-patterns

- Returns drawn solid, which makes a reply look like a new request.
- More than five actors; the drawing becomes wider than the page and the lifelines stop being
  followable.
- Messages without a verb — "data" says nothing that the arrow did not already say.
- Accent on several messages. One happy path, or the signal is gone.
