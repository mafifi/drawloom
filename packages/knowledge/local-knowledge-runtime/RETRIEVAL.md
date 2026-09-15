# Local retrieval admission policy

The accepted boundary is relevance, not answer sufficiency: omit wholly unrelated
material, but permit related records even when they omit the requested attribute.
Context guidance explicitly asks the answering model to acknowledge missing
information and not infer unsupported facts. This framing is not a security
boundary or a guarantee that a model will comply.

SQLite lexical admission removes only the explicitly enumerated English
function/question words in its query builder, retaining other Unicode terms and
quoted compound identifiers. Remaining terms use OR matching. No retained terms
means an empty result after authorization, not a browse-all query. This is a
conservative English heuristic, not language detection or stemming; unknown
languages retain their terms, including their function words. Identifiers equal
to excluded English words are ambiguous and exact-reference reads remain available.

The local composition uses SQLite's best-passage cosine similarity to admit
semantic candidates at **0.52 inclusive before reciprocal-rank fusion**. Lexical
admission is independent. No candidate is rescued merely because it ranks first.
Authorization and provenance checks precede rank assignment, and continuation
rechecks authority and corpus revision. An empty admitted set is ready/empty;
unavailable inference falls back to lexical admission.

This floor is the current Qwen3-Embedding-0.6B Q8_0 GGUF / product-formatting policy,
not a portable score contract. A replacement model requires independent
calibration. It changes retrieval, not vectors, so stored embeddings are not
rebuilt or reinterpreted. SearchHit.relevance remains a rank-derived ordering
value and must not be used as a similarity threshold by context consumers.

Before the frozen evaluation, an independent eight-positive/72-negative public
calibration measured minimum positive cosine 0.6058640109357305 and maximum
negative 0.43258229611100957. The preregistered midpoint rounded upward to two
decimals selected 0.52. Fixtures/results are retained with the learning-journey
evidence. These small examples do not establish universal relevance: weak
paraphrases may be lost, shared content terms may admit irrelevant lexical
records, and near-colliding identifiers still require exact evidence inspection.
Relevance admission neither detects hostile instructions nor replaces disclosure
authorization. Held-out measurements must report recall losses, not retune the
floor against answer keys.

The unchanged historical 24-case corpus scores same-entity/wrong-attribute
references as irrelevant. Under that original metric, this candidate retains
zero abstention; that result remains a failed sufficiency result, not relabeled.
Hybrid relevant recall falls from 1 to 26/27: the museum-access support record
has cosine about 0.5068 and is omitted at 0.52, while museum-visiting survives
and links to that support. Lexical recall also falls (23/27 to 20/27). Neither
the threshold nor the English list was retuned to those cases. The independent
challenge separates unrelated omission from related-but-incomplete admission;
its results are reported separately, not substituted into the old metric.
