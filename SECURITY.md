# Security Policy

## Supported Versions

Drawloom has no supported release yet. Security support begins with the first
published release.

## Reporting a Vulnerability

Do not disclose suspected vulnerabilities through public issues or discussions.

A private reporting channel will be configured before the first public release.
Until then, this repository contains documentation only and has no supported
runtime.

## System and Scope

This policy covers Drawloom contracts, runtime, composition, provider
implementations, sandbox boundaries, tool execution, context compilation,
policy enforcement, and handling of execution traces.

## Threat Model and Trust Boundaries

Model output, user prompts, retrieved knowledge, tool arguments and results,
provider responses, imported configuration, and sandboxed workloads must be
treated as potentially untrusted.

Provider implementations must not silently weaken the security properties
declared by their contracts.

## Security Invariants

- Execution must remain within explicitly granted capabilities.
- Authorization must precede externally visible mutation.
- Sandbox isolation must fail closed.
- Data crossing trust boundaries must be parsed and validated.
- Secrets must not be exposed to models, tools, traces, or logs unnecessarily.
- Policy and approval decisions must be attributable and inspectable.
- A provider substitution must continue to satisfy its contract’s security
  requirements and conformance suite.

## Reportable Findings

Reportable findings include realistic sandbox escapes, authorization or policy
bypasses, unintended code execution, secret disclosure, unsafe cross-boundary
data handling, trace-data exposure, and contract violations that weaken a
security guarantee.

## Out of Scope

Unless they demonstrate a reachable Drawloom security impact, the following are
out of scope:

- unsupported or unreleased versions;
- model-quality or prompt-quality concerns without a control-boundary failure;
- dependency advisories with no reachable vulnerable path;
- denial-of-service reports requiring unrealistic resources;
- social engineering of maintainers.

## Known Limitations

The implementation and deployment threat model are not yet established. This
policy must be revisited when the first runtime, sandbox, remote provider, or
multi-user boundary is introduced.
