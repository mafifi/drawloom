import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("page, form, collection and viewer layouts have a shared implementation", () => {
  const shared = readFileSync(new URL("./src/styles.css", import.meta.url), "utf8");
  const desktop = readFileSync(
    new URL("../../../apps/desktop/src/routes/app.css", import.meta.url),
    "utf8",
  );
  for (const role of [
    "primary-view",
    "primary-view-header",
    "primary-view-scroll",
    "primary-view-content",
    "project-entry-form",
    "collection-row",
    "collection-detail",
    "document-content",
    "document-frame",
  ]) {
    expect(shared).toContain(`.${role} {`);
    expect(desktop).not.toContain(`.${role} {`);
  }
});
