# Auditing an existing draft

For when the writer already has text and wants to know whether it holds up — before a
supervisor, a reviewer, or an examiner finds out for them.

Adapted from `scientific-writing` in K-Dense-AI/scientific-agent-skills (MIT). See NOTICE.

## Read before judging

Use `get_outline` first, then `read_section` on the parts you intend to assess. Do not
audit from the outline alone: the failures below live inside sentences, and an outline
shows none of them.

Audit what the writer asked about. If they point at one part, stay there — a writer
asking about their methods does not want their introduction rewritten.

## What to look for, in order of how much it costs to fix late

**1. Claims with nothing behind them.** Go sentence by sentence through the factual
assertions. For each, ask where it came from. Three failure shapes recur:

- the naked assertion — a fact with no source, usually phrased as common knowledge
  ("banyak penelitian menunjukkan…") with no study named;
- the drifted citation — a source is cited, but it supports something adjacent rather
  than the sentence attached to it;
- the borrowed bibliography — a reference that appears because another paper cited it,
  not because anyone opened it. These carry forward the original's errors, including
  its typos.

**2. Certainty the evidence does not support.** Look for verbs that overstate:
"membuktikan" where the design can only suggest, "menyebabkan" where the analysis is
correlational, "signifikan" used to mean "large" rather than as a statistical statement.
Check whether a conclusion covers a population the study never sampled.

**3. Methods and results that do not meet.** List what the methods promise, then what
the results report. Anything on one list and not the other is a finding: an unreported
measurement, or a result with no described procedure. Then check the numbers themselves
— sample sizes, group labels, and units must be identical in the prose, in the tables,
and in the abstract. Disagreement between abstract and body is common and lethal.

**4. Limitations doing no work.** A limitations passage that could be pasted into any
other document is not a limitation. Test it: does it name something specific about *this*
study that bounds *this* conclusion? If it does not, say so.

**5. Structural drift.** Does the stated objective still match what the document
actually concludes? Long documents grow away from their opening, and the introduction is
usually the last thing anyone rereads.

## How to report it

Group findings by severity, not by page order — a fabricated citation and an awkward
sentence should not sit in the same list.

Quote the exact sentence you are flagging. A writer cannot act on "beberapa klaim kurang
didukung"; they can act on a sentence they recognise.

Separate what is wrong from what is merely unverified. "Angka ini tidak cocok dengan
Tabel 3" is a defect. "Klaim ini belum ada sumbernya" may simply mean the writer has the
source and has not typed it yet — say which one you mean.

Do not rewrite the document while auditing it. Report first; the writer decides what to
change. If they then ask for fixes, apply them one finding at a time so each change stays
traceable to the reason for it.

## What not to do

Do not supply the missing citation yourself from memory — that converts a gap the writer
would have caught into an error they will not. Search for it, or leave the gap marked.

Do not soften a real finding to be encouraging. An audit that reads as reassurance has
failed at the one thing it was for.
