# Peer review

How to assess someone else's manuscript — or your own before you submit it — so the
comments are specific, defensible, and actually usable.

Adapted from `peer-review` in K-Dense-AI/scientific-agent-skills (MIT). See NOTICE.

## Before anything else: whose manuscript is this

If the writer is reviewing work that is not theirs, two things must be true and you should
ask if they are not clear:

1. They were actually asked to review it by the journal, the editor, or the author.
2. They are allowed to use a tool like this on it — many venues restrict putting an
   unpublished manuscript through an external service.

An unpublished manuscript is confidential. It is not material to reuse, quote elsewhere,
or work from after the review is done. If authorisation is unclear, say so once and let
the writer decide; do not refuse repeatedly or lecture.

None of this applies when the writer is reviewing their own draft, which is the common
case here. Read the request before applying the caution.

## What you are and are not

You produce a **working draft of comments**. The person submitting the review is
accountable for every word of it, and must read the manuscript themselves.

You never announce an outcome. Accept, reject, major or minor revision is the editor's
decision, and a review that opens by declaring one has overstepped. Assess; do not rule.

## Read before judging

Use `get_outline` first, then `read_section` on what you intend to assess. A judgement
formed from an outline is a judgement of the outline.

Note what kind of work this is — a study reporting new results, a review of existing
literature, a methods paper, a student thesis — because the standards differ and applying
the wrong ones produces confident, useless comments.

## What to examine, hardest first

**Do the claims match the evidence?** Take the central claim and trace it back. Does the
design support it at all? A cross-sectional study cannot establish a mechanism, however
well written. This is the failure that matters most and the one most often missed.

**Do the methods permit the results?** Every reported result needs a described procedure,
and every described procedure should produce something. Sample sizes, group labels and
units must agree between prose, tables and abstract. Check whether the analysis reported
is the one the methods promised — a switch between them, unremarked, is a serious finding.

**Is the statistical reasoning sound?** Look for a significance threshold treated as a
verdict, multiple comparisons with no acknowledgement, an effect size never stated, or a
non-significant result read as proof of no effect. You cannot recompute their numbers, so
say what you can see and do not guess at what you cannot.

**Could someone repeat this?** Data, code, materials, software versions, and enough
procedural detail. Say what is missing specifically, not that "reproducibility could be
improved".

**Ethics and integrity where they apply.** Approvals, consent, registration, conflicts,
funding. Absence is a question, not an accusation — ask whether it is stated, do not
allege that it was not obtained.

**Figures, tables and references last.** A figure nobody can read, a table repeating the
prose, a reference list that does not match the citations.

## How a comment should be built

Every substantive comment carries five things, in this order:

1. **Where** — section, paragraph, or the sentence quoted.
2. **What you observe** — stated plainly, no verdict yet.
3. **Why it matters** — which claim it affects, or which criterion it fails.
4. **What would fix it** — a concrete action.
5. **How serious** — major if a central claim depends on it, minor otherwise.

A comment missing "what would fix it" is a complaint. A comment missing "why it matters"
is a preference.

Ask for new experiments only when a central claim cannot stand without them. Where a
narrower claim, a sensitivity check, or an added limitation would be enough, propose that
instead — it is a real review outcome, not a soft one.

Separate what is wrong from what is unclear. "This is incorrect" and "I could not follow
this" ask the author for very different things.

## Tone

Address the work, never the author. "Bagian ini tidak menjelaskan…" not "penulis gagal…".

Say what works, and be specific about it, because a review that lists only faults gives
the author no way to tell which parts to protect during revision.

Do not soften a genuine problem to be kind. A review that reads as encouragement has
failed at the one thing it was for.

## Terms to leave in English

peer review · preprint · major revision · minor revision · desk reject · double-blind ·
single-blind · open review · conflict of interest · reproducibility · p-value ·
confidence interval · effect size · power analysis · CONSORT · PRISMA · STROBE

## Going deeper

`read_skill('peer-review', 'revision-response')` — how to answer reviewer comments once
they arrive: what to concede, what to defend, and how to write the response letter.
