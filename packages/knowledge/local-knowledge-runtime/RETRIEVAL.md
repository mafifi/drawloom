# Local retrieval admission policy

This explains what the local knowledge runtime admits into an answer's
context, and why. Read it if you are tuning retrieval, investigating a
relevance regression, or replacing the embedding model — it assumes you
already know the [KnowledgeRetrieval](../knowledge/README.md) contract this
runtime implements.

## Relevance, not sufficiency

The accepted boundary is relevance, not answer sufficiency: admission omits
wholly unrelated material, but permits related records even when they omit
the requested attribute. Context guidance separately asks the answering
model to acknowledge missing information and not infer unsupported facts.
That guidance is not a security boundary or a guarantee that a model will
comply — it shapes what the model is told, not what it does with it.

## Lexical admission

SQLite lexical admission removes only the explicitly enumerated English
function and question words from its query builder, retaining other
Unicode terms and quoted compound identifiers. Remaining terms use OR
matching. No retained terms means an empty result after authorization, not
a browse-all query — an empty query should never silently become "show
everything". This is a conservative English heuristic, not language
detection or stemming: unknown languages retain their terms, including
their function words. An identifier that happens to equal an excluded
English word is ambiguous under this heuristic, so exact-reference reads
remain available as a way around it.

## Semantic admission

The local composition uses SQLite's best-passage cosine similarity to admit
semantic candidates at **0.52 inclusive, before reciprocal-rank fusion**.
Lexical admission is independent of this floor, and no candidate is
rescued merely because it ranks first. Authorization and provenance checks
precede rank assignment, and continuation rechecks authority and corpus
revision on every page. An empty admitted set is a ready/empty result, not
a failure; if inference is unavailable, retrieval falls back to lexical
admission rather than blocking.

This floor belongs to the current Qwen3-Embedding-0.6B Q8_0 GGUF and its
product formatting policy — it is not a portable score contract. Swapping
the model requires independent calibration; changing the floor changes
retrieval, not the stored vectors, so embeddings are not rebuilt or
reinterpreted. `SearchHit.relevance` remains a rank-derived ordering value,
and context consumers must not treat it as a similarity threshold.

The value itself comes from an independent calibration exercise, not from
tuning against the held-out cases below; the fixtures, the calibration
run, and the per-case diagnosis are retained with the learning-journey
evidence, in
[adr-0027-learning-journey.md](../../../knowledge/evidence/adr-0027-learning-journey.md).

## Known limits

Held-out measurement, not the calibration itself, is how this floor's
limits get reported — the floor is never retuned against an answer key to
close a gap found this way.

- **Weak paraphrases can be lost.** A record that restates a request's
  intent without sharing its vocabulary may fall below 0.52.
- **Shared content terms can admit irrelevant lexical records.** Lexical
  admission does not know that a term is being used in an unrelated sense.
- **Near-colliding identifiers still need exact evidence inspection.**
  Neither admission path resolves an identifier clash on its own.
- **A same-entity, wrong-attribute record still scores as irrelevant**
  under the original 24-case corpus's metric — that remains a failed
  sufficiency result under that metric, not one this floor relabels.
- **Recall drops when the floor is applied.** Against the independent
  27-case challenge, hybrid relevant recall falls from 27/27 to 26/27: a
  museum-access support record sits at roughly 0.5068 cosine and is
  omitted at 0.52, while a related museum-visiting record survives and
  links to it. Lexical recall falls too, from 23/27 to 20/27. Neither the
  threshold nor the English function-word list was retuned to these cases.

Relevance admission neither detects hostile instructions nor replaces
disclosure authorization — it decides what a search can surface, not
whether a request is safe to answer. The independent held-out challenge
keeps unrelated omission separate from related-but-incomplete admission,
and its results are reported on their own terms rather than folded into
the older metric.
