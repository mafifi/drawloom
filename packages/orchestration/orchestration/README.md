# Orchestration contract

Portable workflow authoring, management and owned-agent task declarations,
from accepted [ADR 0017](../../../docs/adr/0017-orchestration-interfaces.md).
Read this if you are defining a workflow or task handler, or choosing an
orchestration provider to run them.
[ADR 0018](../../../docs/adr/0018-plugin-standards-and-runtime-extensions.md)
moved these types and the shared conformance suite into their own package,
so trusted backend declarations do not have to import retained
experiments to use them.

This package supplies no workflow engine of its own — Temporal and the
deterministic test implementations remain retained evidence, not desktop
dependencies of this contract. Registration and capability selection
belong to trusted composition, not to this package or to workflow
authors. Workflow input is not agent approval, and startup conveys no
tool grants: defining or starting a workflow never implicitly authorises
what it does. See ADR 0017 for the demonstrated semantics and exclusions
behind these boundaries.

For an implementation of this contract, see
[temporal-orchestration](../temporal-orchestration/README.md).
