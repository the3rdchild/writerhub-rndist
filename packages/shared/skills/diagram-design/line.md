# Line chart

For a trend over time or an ordered sequence: revenue by month, enrolment by year, latency
by release. Use it when the direction and rate of change carry the message.

## The rule that is not about looks

**Every vertex carries `data-value`, and every vertex is placed through one scale.** Equal
steps in value must be equal distances on the axis. A point nudged to smooth the curve is
not a tidier chart, it is a false one — and unlike a broken diagram it gives the reader no
sign that anything is wrong. The drawing is checked against your numbers and rejected on a
mismatch.

Put the series in `<desc>` as `label: value` pairs. If a period has no data, leave a visible
gap; do not interpolate across it and do not drop the label.

## Layout

Inside `viewBox="0 0 1000 500"`: 80px left, 60px bottom, 40px top and right. Baseline y=420,
plot top y=40.

- **4-12 points.** Fewer than four is a sentence, not a chart; more than twelve should be
  aggregated into periods.
- The line is a `<polyline>` with `fill="none"`, `stroke-linejoin="round"`. Focal series at
  1.8px in `accent`; other series at 1.2px in `muted`.
- Vertex dots (`r="4"`) only on the focal series, each carrying its `data-value`.
- 4-6 horizontal gridlines, same faint treatment as the bar chart.
- X labels in `JetBrains Mono` 8px, centred under each vertex — and spaced according to the
  real interval. Twelve months and then a three-year jump are not the same step.
- At most 3 series. Beyond that the lines cross into illegibility; split the chart.
- Label the first and last value of the focal series in text, so the magnitude is readable
  without the axis.

## Anti-patterns

- Even spacing for uneven periods.
- A smoothed curve through few points — it invents readings that were never taken.
- A second y-axis. Two scales on one picture is two charts pretending to be one.
- Filling the area under a line whose baseline is not zero.
