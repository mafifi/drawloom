# Working designs

This directory holds detailed designs that refine Proposed ADRs before a
supported contract or implementation exists.

Working designs may contain exact interfaces, schemas, conformance cases, and
provider mappings that are too volatile or detailed for an ADR. They are not a
supported API and do not authorize implementation. Once implemented, current
contract and protocol reference moves to `docs/reference/` or is generated from
the authoritative package.

Each design links to the ADRs that establish its architectural boundaries and
states which decisions remain open. ADRs link back rather than copying detailed
contract material.

## Current designs

- [Agent execution contract](agent-execution-contract.md): exact portable
  interfaces, schemas, and conformance requirements under active design.
- [Codex app-server adapter](codex-app-server-adapter.md): provider mapping and
  disposable integration evidence for the first proposed agent driver.
