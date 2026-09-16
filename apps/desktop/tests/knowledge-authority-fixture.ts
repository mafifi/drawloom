import { createManagedLocalKnowledgeClient } from "@drawloom/local-knowledge-runtime";
import { createDesktopAuthorization } from "../host/authorization.js";

/** Test composition owns both lifetimes; production uses the application's shared scheduler. */
export function createAuthorizedKnowledgeFixture(
  options: Omit<Parameters<typeof createManagedLocalKnowledgeClient>[0], "authority">,
) {
  const authorization = createDesktopAuthorization();
  const client = createManagedLocalKnowledgeClient({
    ...options,
    authority: authorization.knowledge(),
  });
  return {
    ...client,
    async close() {
      try {
        await client.close();
      } finally {
        authorization.shutdown();
      }
    },
  };
}
