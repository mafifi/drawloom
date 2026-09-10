# Orchestration contract

Portable authoring, management and owned-agent task declarations from accepted
ADR 0017. ADR 0018 moves these types and the shared conformance into a package so
trusted backend declarations do not import retained experiments.

This package supplies no workflow engine. Temporal and deterministic test
implementations remain retained evidence, not desktop dependencies. Registration
and capability selection belong to trusted composition. Workflow input is not
agent approval; startup conveys no tool grants. See ADR 0017 for demonstrated
semantics and exclusions.
