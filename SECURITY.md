# Security Policy

Use this page to report a security problem privately and understand the
protections Drawloom's code is expected to preserve.

## Reporting a Vulnerability

Email [security@drawloom.org](mailto:security@drawloom.org). Do not post suspected
vulnerabilities in public issues or discussions.

Include the affected version or commit, steps to reproduce the problem and the
impact you believe it could have. Use a small example and remove credentials,
personal information and other sensitive data from attachments.

The contact is also listed in
[security.txt](https://drawloom.org/.well-known/security.txt).

## Supported Versions

The existing policy starts release support with the first published release;
it does not yet name a supported release. This does not mean the repository
contains only documentation: it now includes the desktop host and capability
implementations. A supported-version list remains a maintainer decision.

## System and Scope

This policy covers Drawloom's shared interfaces, implementations and application
setup, including agent execution, tool calls, context, permissions, sandbox
controls and diagnostic records.

The desktop uses a local host and connects to configured providers.
Individual integrations have their own permissions and limitations. The
[architecture](ARCHITECTURE.md#responsibilities-and-safeguards) and
[desktop host guide](docs/design/desktop-host.md) explain how responsibilities
are divided.

## Threat Model and Trust Boundaries

A trust boundary is a point where code receives information it must not simply
believe. Model output, prompts, retrieved knowledge, tool arguments and results,
provider responses, imported configuration and sandboxed work can all contain
untrusted data.

Changing a provider must not weaken the protections promised by its interface.
The following requirements describe what implementations must preserve, not a
claim that every deployment has been independently certified.

## Security Invariants

These are the protections that must continue to hold when the code changes:

- Actions stay within the permissions explicitly granted.
- Permission checks happen before changes with externally visible effects.
- If required sandbox isolation cannot be established, execution must not
  continue without it.
- Incoming data is checked before being trusted or used.
- Secrets are not unnecessarily exposed to models, tools, traces or logs.
- It is possible to inspect permission and approval decisions and identify who
  or what made them.
- A replacement provider satisfies the same security requirements and shared
  tests as the interface it implements.

## Reportable Findings

Report problems with a realistic path to security harm, including:

- Escaping a sandbox or bypassing permission and approval checks.
- Running code that the user did not authorise.
- Exposing secrets or private diagnostic data.
- Handling untrusted data in a way that breaks a security protection.
- Breaking a promised interface behaviour in a way that weakens security.

Explain how the issue can be reached and what it allows an attacker to do.

## Out of Scope

The existing exclusions below apply unless the report demonstrates a reachable
security impact on Drawloom:

- Unsupported or unreleased versions.
- Poor model answers or prompts without a failure of an enforced protection.
- Dependency advisories with no reachable vulnerable code path.
- Denial-of-service reports that require unrealistic resources.
- Social engineering of maintainers.

The release-related exclusion and supported-version policy above still need
maintainer review. This documentation edit does not expand or remove them.

## Known Limitations

The earlier policy predated the runtime. There is now an implementation, with
controls and limitations documented in its ADRs and tests, but this page does not
establish a complete deployment threat model.

A consolidated threat model and release-support policy remain to be reviewed.
Do not infer enterprise, multi-user or every-platform security guarantees from
a local test or an accepted architectural decision. Detailed security design
belongs under [docs/security/](docs/security/README.md).
