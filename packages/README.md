# Packages

Drawloom's reusable code lives here. Packages are grouped by what they do, so
you can find a capability's interface, implementations and tests together.

Start with the [foundation API guide](../docs/reference/foundation-api.md) to
choose a capability, or use the
[repository walkthrough](../docs/reference/repository-audit/README.md) to read
the implementation.

## Find an interface and its implementation

Where a capability has its own contract package, the usual layout is:

```text
packages/<capability>/
├── <capability>/       # interface, data validation and shared tests
├── <provider-a>/       # an implementation
└── <provider-b>/       # another implementation
```

A **contract** describes the inputs, outputs and behaviour that callers can rely
on. A **provider** implements it. Their shared tests check that providers keep
the same promises.

For example, [orchestration](orchestration/orchestration/README.md) defines how
to run workflows; [Temporal](orchestration/temporal-orchestration/README.md)
implements that interface. The application chooses Temporal when setting up
the capability. Workflow authors do not need to import Temporal to define work.

## Not every capability needs a separate service

The ten capabilities in the README describe what Drawloom offers, not ten
independent services. Memory shares the knowledge implementation, context has
a shared data shape, and sandboxing uses the selected execution environment.
Create packages to meet an agreed need, not to fill out a diagram.

Keep interfaces independent of providers. Code using a capability should call
its interface; only application setup chooses the implementation.
[Contributing](../CONTRIBUTING.md) explains the package rules, shared tests and
dependency checks to follow when making a change.
