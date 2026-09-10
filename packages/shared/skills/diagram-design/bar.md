# Bar chart

For one number per category, compared side by side: revenue by year, count by
department, score by cohort. Use it when the comparison between the bars is the message.

## The rule that is not about looks

**Every bar carries `data-value` with its real number, and every bar is computed from one
scale factor.** Pick the factor once — `pixels = value x (380 / largest value)` — and apply
it to all of them. Never place a bar by eye, and never adjust one afterwards because it
"looks better".

A structural diagram drawn wrong looks wrong: nodes overlap, arrows tangle, and the writer
sees it immediately. A chart drawn wrong looks completely fine — the bars are tidy, the axis
is straight, the labels are correct. Only the heights are false, and what reaches the reader
is wrong data wearing a convincing face. That is why the drawing is checked against your
numbers, and why a mismatch is rejected rather than passed on.

Put the figures in `<desc>` as well, as `category: value` pairs. That is what lets a reader —
or a later redraw — check the picture against the data without you.

If a number is missing, do not estimate it. Say which one is missing and stop.

## Layout

Inside `viewBox="0 0 1000 500"`: plot area with 80px on the left for the y-axis labels, 60px
below for category names, 40px top and right. Baseline at y=420, plot top at y=40.

- **4-8 bars.** More than eight, group them into periods or split the chart in two.
- Bar width at least half the pitch — the gap must never be wider than the bar. A pitch of
  110 with a bar of 72 reads well.
- 4-6 horizontal gridlines in `rgba(45,49,66,0.08)` at 0.8px; baseline `rgba(45,49,66,0.25)`
  at 1px.
- Y-axis labels right-aligned in `JetBrains Mono` 8px, `muted`, ending at x=72.
- Category names centred under each bar in `Inter` 11px/600.
- The value printed above each bar in `JetBrains Mono` 8px — the real number, so the reader
  never has to measure the picture.
- One focal bar in `accent`; the rest `rgba(79,93,117,0.15)` fill with a `muted` stroke.

```svg
<rect x="140" y="230" width="72" height="190" data-value="1900"
      fill="rgba(79,93,117,0.15)" stroke="#4f5d75" stroke-width="1"/>
<text x="176" y="222" fill="#4f5d75" font-size="8"
      font-family="JetBrains Mono, monospace" text-anchor="middle">1.900</text>
```

## Anti-patterns

- A y-axis that does not start at zero. It doubles the apparent difference, and on a bar
  chart it is simply a false picture. If the interesting range is narrow, say so in the
  prose or use a line chart.
- Bars sorted by height when the categories have a natural order (months, years, stages).
- A legend for a single series.
- More than one accent bar.
