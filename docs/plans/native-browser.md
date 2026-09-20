# Native browser implementation

Status: implementation checkpoint; native acceptance and lifecycle verification
remain in progress. The maintainer authorised checkpoint commits and accepted
ADR 0033 on 2026-09-20.
Specification: [ADR 0033](../adr/0033-isolated-native-browser-panel.md), including
the maintainer-approved Ask/Allow once/Always allow/Block site permission flow.

## Tasks

1. Define the optional browser contract and permission policy; test origin,
   capability and request lifetime before exposing UI. Public desktop host owns
   the contract, never plugin or agent capability payloads.
2. Implement the macOS native adapter and trusted command boundary. Native
   code owns callbacks and browser instances; no automatic device grant.
3. Implement shared panel and Settings presentation, actions, bounded geometry
   and unloaded restoration. Preserve workbench content and composer draft.
4. Test native isolation, permission decisions, navigation, shutdown, restart,
   replacement and plugin-update preservation before packaging. Run public and
   private checks; keep native and synthetic evidence distinct.

## Constraints and verification

Keep existing 4488 installation and user data. No reset, media generation,
signing, notarisation, packaging, publication, permissions changes to the machine,
or automatic commits. No private source or fixtures in public tests. Native
callbacks must not trust a page-supplied origin, tab identity or decision.
Use existing shared shadcn controls and MVVM boundaries. No browser automation,
page extraction or new agent tools. Unsupported permissions fail closed.

The first unit policy and navigation-policy tests have run RED then GREEN.
See the [readiness evidence](../reference/native-browser-permission-readiness.md)
for executed native launch, navigation and tab checks, and the remaining
permission/isolation and lifecycle/update acceptance. Neither unit tests nor
the implementation checkpoint establish release readiness.
