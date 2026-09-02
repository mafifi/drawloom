# ADR 0002: License the public core under Apache-2.0

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decision owners:** Drawloom maintainers

## Context

Drawloom is intended to demonstrate technical expertise, support a genuine open
source community, and form the foundation of a commercial product. The licence
must encourage adoption without preventing separately developed enterprise
capabilities from remaining proprietary.

The project also needs a contribution process that establishes provenance
without imposing unnecessary legal friction on early contributors.

## Decision

### Public core

The public Drawloom repository is licensed under the Apache License 2.0. Unless
a file states otherwise, the licence covers its source code, documentation,
tests, examples, and repository automation.

The public core will remain useful and self-hostable. It includes contracts,
conformance suites, runtime fundamentals, provider interfaces, core security and
evaluation primitives, and representative implementations.

### Proprietary enterprise capabilities

Enterprise capabilities may be developed in separately licensed, non-public
repositories. They consume stable contracts published by the public core.

The dependency direction is one-way:

```text
proprietary enterprise products -> public Drawloom contracts
public Drawloom                 -X-> proprietary enterprise code
```

Likely commercial boundaries include organisational identity and provisioning,
governance administration, compliance workflows and exports, fleet management,
multi-tenant operations, enterprise connectors, hosted control-plane services,
support, and service-level commitments.

Basic security, observability, evaluation, and local operation will not be
withheld merely to make the public runtime unusable without the commercial
product.

### Contributions

Contributors certify the Developer Certificate of Origin 1.1 by adding a
`Signed-off-by` trailer to each commit. Drawloom does not require a Contributor
Licence Agreement initially.

A CLA may be considered only before a concrete need to relicense or dual-license
the public core, following legal review and a new ADR. It will not be introduced
retroactively without addressing existing contributor rights.

### Brand

The Apache License 2.0 does not grant rights to Drawloom names or marks beyond
customary description of origin. A separate trademark policy may be adopted
before the first public release.

## Consequences

- Individuals and organisations may use, modify, redistribute, and commercially
  offer the public core under Apache-2.0 terms.
- Drawloom may build proprietary products that depend on or extend the public
  contracts.
- Competitors may lawfully offer hosted or proprietary derivatives of the
  public core; commercial differentiation must come from product execution,
  enterprise capabilities, operations, support, and brand.
- Publicly released versions cannot later be withdrawn from their recipients.
- The public/private boundary must remain architectural rather than being
  enforced through imports from unavailable packages.
- DCO sign-off adds a small contribution step while keeping provenance visible.

## Alternatives considered

### AGPL-3.0

AGPL would require source availability for modified versions used over a
network, but its copyleft boundary would complicate adoption and integration for
the audience Drawloom initially seeks.

### Source-available commercial licences

Business/source-available licences could restrict competitive use but would
weaken the project's claim to be open source and create additional adoption
friction.

### Contributor Licence Agreement from inception

A CLA would preserve more relicensing flexibility but impose additional legal
and community overhead before a concrete need exists.
