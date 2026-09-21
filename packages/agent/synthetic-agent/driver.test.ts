import { test } from "vitest";
import { agentConformance } from "@drawloom/agent/conformance";
import { syntheticAgentFixture } from "../../../scripts/agent-conformance-fixtures.mjs";
test("synthetic driver shared conformance", () => agentConformance(syntheticAgentFixture));
