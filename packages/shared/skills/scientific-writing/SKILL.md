# Scientific writing

How to build an argument that holds up: what may be claimed, how a claim is tied to a
source, and how uncertainty survives into the prose.

Adapted from `scientific-writing` in K-Dense-AI/scientific-agent-skills (MIT). See NOTICE.

## What this skill does not decide

It never names a section, a chapter, or a heading. Document structure, heading text,
numbering and page format belong to the active template — `apply_template_format` and the
template's own rules. Where this skill and the template appear to disagree, **the template
wins**, and you follow it without comment.

Talk about sections by what they do, not by what they are called. A writer working in
Indonesian is not writing a "Related Work section"; they are writing the part that
situates their work against existing literature, and their institution has its own name
for it.

## Never invent

Do not produce, complete, or "reconstruct" any of the following when it is not in front
of you:

- citations, references, DOI, PMID, ISBN, URLs, or direct quotations;
- numbers of any kind: results, sample sizes, denominators, units, effect sizes,
  confidence intervals, p-values, dates;
- methods, instruments, software versions, protocol details, or analysis choices;
- ethics approvals, registrations, consent statements, funding, or conflicts of interest;
- author names, ordering, affiliations, or acknowledgements.

A plausible-looking citation is worse than no citation, because it survives review by
looking right. When something is missing, say so in the prose you hand back — "sumber
belum ada", "angka menyusul" — and leave it for the writer to fill. Never substitute
boilerplate that reads as if it were verified.

This holds even under direct pressure. If the writer asks for "a citation for this", the
answer is a search or a request for the source, never a fabricated reference.

## Tie every claim to something

A factual claim needs a source the writer can open. Three things do **not** count as
verification:

1. a search snippet, an abstract, or a title;
2. your own summary of a paper you did not read in full;
3. another work's bibliography — that is where citation errors propagate from.

When web research is available in the conversation, use it and attribute what you find.
When it is not, mark the claim as needing a source instead of writing around the gap.

Distinguish carefully between what a source *found*, what its authors *concluded*, and
what the writer wants it to mean. These drift apart in exactly the places a reviewer looks.

## Keep uncertainty intact

Most damage to a scientific argument happens in the rewrite, when hedges get polished
away and a careful sentence becomes a confident one.

- Association is not causation. "Berkorelasi dengan" must not become "menyebabkan".
- A non-significant result is not evidence of no effect.
- An exploratory or post-hoc finding stays labelled as one, however interesting.
- A single study is not a literature.
- Sample and setting bound the claim. Findings from one population do not silently
  generalise.

Report what does not work as well as what does: null results, failed attempts, and
inconclusive analyses belong in the record. Limitations must be concrete and specific —
a paragraph admitting vague "keterbatasan waktu dan sumber daya" tells a reviewer
nothing and reads as filler.

## Make the prose carry the argument

- One paragraph, one claim. If a paragraph needs "dan juga" to continue, it holds two.
- Methods and results must agree. Every method described produces a result; every result
  reported has a method behind it.
- Units, sample sizes, and group labels must match everywhere they appear — including
  between the prose and the tables.
- Prefer the plain word. Technical vocabulary is precision when it is load-bearing and
  noise when it is decoration.
- Avoid stock openings — a paragraph that begins by restating that the topic is
  important has spent a sentence saying nothing.

## Terms to leave in English

Do not translate these, in any language the writer uses. They are identifiers or terms of
art, and translating them breaks searchability or meaning:

DOI · PMID · PMCID · ISBN · ISSN · ORCID · preprint · p-value · confidence interval ·
effect size · odds ratio · IMRaD · BibTeX · DataCite · Crossref · OpenAlex · PubMed ·
arXiv · peer review · open access · dataset · repository · t-test · ANOVA · chi-square ·
regression · CONSORT · PRISMA · STROBE

Names of statistical tests, software, datasets, standards, and databases stay as they are
published. Everything else follows the writer's language.

## Going deeper

`read_skill('scientific-writing', 'evidence-audit')` — how to audit a draft that already
exists: locating unsupported claims, overstated certainty, and mismatches between what
the methods promise and what the results deliver.
