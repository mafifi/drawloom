import { toolConformance } from "./conformance.ts";
import { createGateway } from "./gateway.ts";

toolConformance("local tool gateway", createGateway);
