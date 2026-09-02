# Packages

Product code will be organised around capabilities rather than generic layers
or provider names.

The intended shape is:

```text
packages/<capability>/
├── <capability>/       # provider-independent contract + conformance suite
├── <provider-a>/       # one implementation
└── <provider-b>/       # another implementation
```

Runtime and composition packages may consume multiple capability contracts, but
only a composition root may choose concrete providers.

No capability directories are created until their contracts are proposed and
accepted.
