# Scatter plot

For two continuous variables against each other: correlation, clusters, outliers. Use it
when the relationship between the variables — or its absence — is the message.

## The rule that is not about looks

**Every point carries `data-value`, and both axes map through one scale each.** A point
moved to make a cloud look more convincing is fabricated data. The drawing is checked and a
mismatch is rejected.

Put the pairs in `<desc>`. If the writer only has a handful of observations, say so in the
prose: a scatter of five points implies a pattern that five points cannot support.

## Layout

Inside `viewBox="0 0 1000 500"`: 80px left, 60px bottom, 40px top and right. Y-axis at x=80,
x-axis at y=420, 4-6 gridlines per axis at equal intervals.

- **5-30 points.** Fewer, and prose says it better; more, and the points merge — bin them.
- Points are `r="5"` circles, `rgba(79,93,117,0.20)` fill with a `muted` stroke, each on a
  `paper` mask so overlaps stay readable. A focal point is `r="6"` in `accent`.
- Label at most two or three points, never all of them, each on a `paper`-filled mask.
- **Name both axes**, with units, in `JetBrains Mono` 9px. A scatter without axis names is
  a decorative cloud.
- A trend line is optional, dashed `4,3` in `rgba(45,49,66,0.25)`. Only draw one when the
  trend is already visible without it, and never fit it by eye to look stronger than it is.

## Anti-patterns

- A trend line on a cloud that has no trend.
- Point size varying without saying what size means.
- Truncated axes that turn a weak relationship into a strong-looking one.
- Colour per point with no legend.
