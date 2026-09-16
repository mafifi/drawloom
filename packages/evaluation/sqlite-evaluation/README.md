# `@drawloom/sqlite-evaluation`

A Bun-hosted local provider for `@drawloom/evaluation`. Read this before
choosing a store for a local desktop composition, or before relying on it for
anything beyond durable evidence.

It stores all scopes in `evaluation.sqlite` beneath a caller-selected data
directory, using transactions, WAL mode, restrictive permissions and a
validated schema version.

The provider stores durable evaluation evidence only—it does not schedule,
retry, cancel or acknowledge orchestration work. Callers may acknowledge a
durable step only after the corresponding checkpoint write resolves.

Start attempts and provider-run bindings are kept as distinct immutable
records. A result row retains a bounded exact summary even when
reconstructing all its referenced checkpoints would exceed the aggregate
detail-view limit: `getResult` then fails visibly, while `getResultSummary`
and `listResults` stay available.

See [`@drawloom/evaluation`](../evaluation/README.md) for the store contract
this package implements.
