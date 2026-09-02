# Knowledge agent guide

This guide applies under `knowledge/`.

## Drawloom OKF profile

Every substantive Markdown record starts with YAML front matter containing:

```yaml
---
type: source
id: stable-kebab-case-id
title: Human-readable title
status: draft
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

- `type` follows OKF 0.2 and may be refined as the corpus develops.
- `id` is stable and unique across the knowledge bundle.
- `status` is one of `draft`, `active`, `deprecated`, or `superseded`.
- Records cite primary sources where possible and distinguish evidence from
  inference.
- Time-sensitive claims state their freshness or verification date.
- Every active record is reachable from `knowledge/index.md`.
- Superseded records link to their replacement and remain in history.
- Do not store secrets, personal data, raw private conversations, or unredacted
  execution traces here.

Repository automation will validate metadata, links, and index coverage once
the initial toolchain is selected.
