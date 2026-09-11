# Evidence vocabularies: representation, not a memory engine

## Scope

These references answer a different question from the products: how to express a source, claim, assessment and derivation without giving them the same meaning. They do not supply a complete storage, retrieval, orchestration or authentication implementation. Inspected 11 September 2026. No schema generators or example computations were executed.

## SEPIO: claim and evidence assessment

The older [SEPIO ontology](https://github.com/monarch-initiative/SEPIO-ontology/blob/461b854e49660a21656f011aa20cb46498100e54/README.md) explicitly redirects new model work to **sepio-linkml**. Both repositories were cloned, but the current information-model analysis uses [sepio-linkml at f41c71c](https://github.com/sepio-framework/sepio-linkml/tree/f41c71c4396ec30e06e12448270447f50b76a543). A stale ontology diagram must not be treated as the latest interface.

The [core model](https://github.com/sepio-framework/sepio-linkml/blob/f41c71c4396ec30e06e12448270447f50b76a543/src/sepio_linkml/schema/sepio_classes.yaml#L654) distinguishes a proposition from a statement about it. A statement can simply assert a proposition or assess how strongly it is supported or disputed. It allows readable text as well as structured subject/predicate/object/qualifier information. This matters for Drawloom: a useful observation need not be forced into a perfect ontology before storage, and the content of a claim need not change merely because its assessment changes.

An [EvidenceLine](https://github.com/sepio-framework/sepio-linkml/blob/f41c71c4396ec30e06e12448270447f50b76a543/src/sepio_linkml/schema/sepio_classes.yaml#L1067) groups information interpreted as one argument for or against a proposition. It has target proposition, evidence items, support direction, qualitative strength and optional quantitative score. The documentation explicitly delegates scoring scales and rules to profiles. This is unusually close to the proposed separation between common provenance and domain-specific assessment.

That does not mean SEPIO automatically discovers independent evidence. Independence is part of the model's intended meaning; an implementation must decide whether repeated articles, copied notes and agent restatements are really separate arguments. Nor does a numerical score mean a calibrated probability. Its scale and interpretation must remain available.

The schema includes [shortcuts](https://github.com/sepio-framework/sepio-linkml/blob/f41c71c4396ec30e06e12448270447f50b76a543/src/sepio_linkml/schema/sepio_classes.yaml#L884): a statement can link directly to evidence or source resources without introducing EvidenceLine objects when their additional detail is unnecessary. This is an important restraint. Adopting the vocabulary does not require maximal structure for every fibre.

The new repository calls its classes Draft/Informative and describes a profile methodology, not a universally deployable knowledge service. It offers generated schemas and documentation. There is no demonstrated scheduler, indexed retrieval API, source-change watcher, restart-safe consolidation worker or organizational entitlement service in this inspection. A model for describing assessment is not an evaluator implementation.

Licensing must be checked per repository: the older ontology README declares CC BY 3.0; [sepio-linkml's root LICENSE](https://github.com/sepio-framework/sepio-linkml/blob/f41c71c4396ec30e06e12448270447f50b76a543/LICENSE) is Apache-2.0. Do not carry one repository's licence label across both.

## PROV-O: where a record came from

PROV-O provides entities, activities and agents, with derivation, attribution, generation, revision and invalidation relationships. This is useful vocabulary for stating which source revisions and processing activity produced a knowledge record. It does not determine whether that knowledge is true. A machine can be the actor; provenance does not imply human approval. [W3C Recommendation, 30 April 2013](https://www.w3.org/TR/prov-o/).

A candidate application is to retain source/version and processing identity alongside a derived claim or assessment. Drawloom would still need to define its actual record, persistence and access contract. Merely naming fields after PROV-O would not establish RDF or PROV conformance.

## Data Quality Vocabulary: name the assessment method

DQV separates a quality metric from a measurement and allows provenance around quality information. It is useful when different domains attach different assessments rather than treating one unexplained number as universal confidence. DQV does not prescribe a claim-truth probability, a recency-decay formula, or Nightloom's tightness model. [W3C Working Group Note, 15 December 2016](https://www.w3.org/TR/vocab-dqv/).

The applicable lesson is modest: preserve what was measured and how. Retrieval ranking, source quality, evidence strength and belief confidence should not all be presented as the same score.

## Nanopublications: package an assertion with provenance

Nanopublications separate an assertion, its provenance and publication information in an RDF-based structure. They offer a reference for portable, attributable claim packages. They are not a database engine or automatic knowledge-maintenance service. [Nanopublication Guidelines, working draft](https://nanopub.net/guidelines/working_draft/).

A claim distributed in a portable package still needs access control, source availability and interpretation. Drawing inspiration from this separation does not require Drawloom to store every observation as an RDF nanopublication.

## Web Annotation: point to the actual evidence

The Web Annotation model relates bodies to targets and supports selectors for specific portions of a resource, including text quotations and positions. That is useful when “the source” should mean a particular passage rather than an entire document. It also separates data-model representation from the transport that creates or retrieves annotations. [W3C Recommendation](https://www.w3.org/TR/annotation-model/).

Selectors are not immutable evidence by themselves: a mutable URL or position needs suitable version/state information to remain meaningful. Whether Drawloom needs that precision for a particular source type is a contract decision, not a reason to demand complex annotations from every contributor.

## OKF and the existing Drawloom profile

The public repository already records its [OKF profile](../../../knowledge/AGENTS.md): stable record IDs, typed front matter, status, citations, freshness and retained superseded records. This is evidence of the repository's documentation convention, not a supported runtime memory engine or a certification of a universal OKF implementation.

Private project records are deliberately excluded from this public survey. Their content, schemas, business constraints and example calculations are not copied here.

Readable knowledge records and an efficient database index can coexist, but they must not become competing authorities. The file can be authoritative with a rebuilt index, or the database can be authoritative with a readable export. The reference products demonstrate different choices; no choice is adopted here.

## Candidate common vocabulary

A minimal conceptual spine is **source → claim → assessment**, with links recording which evidence and processing revision support the assessment. Some contributions stop at source/observation. Some retrieval results include original material; others include a derived summary.

The maintenance lifecycle remains additional behavior: notice changed evidence, identify affected claims, reassess under a domain policy, publish the new revision and advance committed processing coverage. SEPIO helps describe the result; Hindsight, Graphiti and Letta Code provide concrete but different maintenance implementations. None of these vocabularies justifies adding five separate services or forcing a graph database into a portable interface.

The useful distinction for future discussion is between **shared record meaning**, **provider-internal processing**, and **domain-specific judgement**. These findings are discovery evidence, not accepted Drawloom contracts.
