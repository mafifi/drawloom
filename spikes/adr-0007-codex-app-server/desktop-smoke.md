# Codex Desktop MCP smoke

This is a manual verification because app-server automation does not prove that
the shipped Codex Desktop composition exposes the same MCP boundary.

## Preconditions

- The repository canonical gate and `bun run spike:adr-0007` pass.
- Codex Desktop is authenticated with the same local installation under test.
- No credentials or personal data are placed in the probe.

## Procedure

1. Configure one local stdio MCP server named `drawloom_adr_0007` with command
   `bun` and argument
   `<repository>/spikes/adr-0007-codex-app-server/mcp-interaction-server.ts`.
2. Start a fresh Codex Desktop task with other optional MCP servers, apps, and
   plugins disabled for the task.
3. Ask Codex to call `drawloom_request_one_input` exactly once.
4. Confirm Desktop presents one request with the exact prompt “Provide the
   Drawloom spike value.” Submit `desktop-single` and confirm the tool reports
   an accepted response.
5. In another fresh task, ask Codex to call
   `drawloom_request_two_inputs` exactly once.
6. Confirm Desktop presents two distinct requests with the exact prompts
   “Provide the first Drawloom spike value.” and “Provide the second Drawloom
   spike value.”
7. Submit `desktop-first` and `desktop-second` to the corresponding requests.
8. Confirm the tool completes and Codex reports that both inputs were received.
9. In a fresh task, ask Codex to use provider-native delegation exactly once;
   require an exact non-sensitive sentinel from the child and confirm it reaches
   the parent.
10. Remove the temporary MCP configuration and record only pass/fail, app and
   Codex versions, date, and redacted observations in the authoritative evidence
   record.

Do not paste task identifiers, tool-call identifiers, raw transcripts, or local
configuration containing unrelated servers into the evidence record.

## Observed result: 2026-09-04

- Desktop app `26.901.31953` (`7868`) with bundled Codex CLI `0.153.1`
  discovered and invoked the retained stdio MCP server.
- The client advertised form elicitation but immediately returned `decline` for
  the single-input control; no form was presented.
- The concurrent control also completed without presenting either form and did
  not receive both values.
- Provider-native delegation completed and the exact child sentinel reached the
  parent.

The manual smoke therefore failed its Desktop form-elicitation expectation
while passing MCP discovery, invocation, and native delegation. Drawloom's
accepted integration targets app-server directly, where elicitation passed;
Desktop rendering is retained as a host limitation rather than a portable
contract requirement. See the
[authoritative evidence record](../../knowledge/evidence/adr-0007-codex-app-server.md).
