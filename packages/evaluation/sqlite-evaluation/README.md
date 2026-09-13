# `@drawloom/sqlite-evaluation`

Bun-hosted local provider for `@drawloom/evaluation`. It stores all scopes in
`evaluation.sqlite` beneath a caller-selected data directory, using transactions,
WAL mode, restrictive permissions and a validated schema version.

The provider stores durable evaluation evidence only. It does not schedule,
retry, cancel or acknowledge orchestration work. Callers may acknowledge a
durable step only after the corresponding checkpoint write resolves.

Start attempts and provider-run bindings are distinct immutable records. Result
rows retain a bounded exact summary even when reconstructing all referenced
checkpoints would exceed the aggregate detail-view limit; `getResult` then fails
visibly while `getResultSummary` and `listResults` remain available.
