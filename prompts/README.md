# Prompt architecture

Five prompts, run as a chain. Each is a versioned TypeScript module rather than
a string literal buried in a route handler, because prompts are the part of this
system most likely to change and the part where a change is hardest to review.

```
                    ┌─────────────────────────────┐
  resume text  ───▶ │ 01  extract-resume          │──▶ ResumeDocument
                    └─────────────────────────────┘          │
                    ┌─────────────────────────────┐          │
  job text     ───▶ │ 02  extract-job             │──▶ JobSpec
                    └─────────────────────────────┘          │
                                                             ▼
                    ┌─────────────────────────────┐
                    │ ✱  ats/keyword-match.ts     │──▶ KeywordReport   (no model)
                    └─────────────────────────────┘          │
                                                             ▼
                    ┌─────────────────────────────┐
                    │ 03  score-and-gaps          │──▶ MatchReport
                    └─────────────────────────────┘          │
                                                             ▼
                    ┌─────────────────────────────┐
                    │ 04  rewrite         (stream)│──▶ TailoredResumeDraft
                    └─────────────────────────────┘          │
                                                             ▼
                    ┌─────────────────────────────┐
                    │ 05  critique                │──▶ CritiqueReport
                    └─────────────────────────────┘          │
                                                             ▼
                                             ungrounded claims reverted
```

## Why these five, and not fewer or more

**Extraction is split from scoring** so the user can correct a parsing mistake
before anything is judged. A misread date that silently costs ten points is
worse than a misread date the user can see and fix.

**Scoring and gap analysis share one call.** They need identical context — the
same resume, the same posting, the same reasoning about what is missing — and
splitting them would pay for that context twice and risk the two outputs
disagreeing about the same gap.

**The critique is a separate call with a separate context.** This is the one
place where merging would defeat the purpose. A model asked to write a rewrite
*and* check it in the same turn is grading its own homework with its own
justifications still in context. Stage 05 sees the original resume and the
proposed rewrite, and nothing about why the rewrite was written that way.

**Keyword coverage uses no model at all.** It is set intersection over
normalised strings, and a model would make it slower, costlier, and
non-deterministic. See `src/lib/ats/keyword-match.ts`.

## Anti-fabrication

The rule lives in three places, because a prompt instruction alone is a wish:

1. **In the schema.** `subScore.evidence` is a non-empty array of quotes. A
   response that scores without citing fails validation and is retried — a bare
   number cannot reach the UI.
2. **In the prompts.** Stage 04 must state, per bullet, the source phrase that
   grounds it. Stage 05 judges each claim independently.
3. **In code.** `computeOverallScore` recomputes the headline from the
   sub-scores and discards the model's arithmetic, and the pipeline reverts any
   claim stage 05 marks ungrounded. If stage 05 itself fails twice, the
   original resume is shown — the system **fails closed**.

## Tuning notes for Claude Opus 5

These prompts are written for `claude-opus-5` and are deliberately less
prescriptive than prompts written for older models would be.

- **No step-by-step choreography.** Opus 5 follows instructions literally and
  scripting a judgement task measurably lowers output quality. The prompts
  state the goal, the constraints, and the output shape.
- **No "double-check your work" instruction.** This inverts the usual advice on
  purpose: Opus 5 verifies its own output without being asked, and telling it to
  verify produces over-verification. Grounding is checked by stage 05, which is
  a separate call, not by asking one model to re-read itself.
- **Explicit conciseness.** Opus 5 writes longer by default, and resume bullets
  have a hard length budget, so length is stated as a constraint.
- **Scope discipline.** Stage 04 is told not to invent structure the user did
  not ask for.

`effort` is set per stage in `src/lib/ai/models.ts`: extraction runs low,
scoring and rewriting run high.

## Versioning

`PROMPT_VERSION` in `prompts/version.ts` is part of the cache key. Bumping it
invalidates every cached analysis, which is the point — a prompt change that
silently kept serving results from the old one would be undebuggable. Bump it
whenever a prompt changes in a way that should change output.
