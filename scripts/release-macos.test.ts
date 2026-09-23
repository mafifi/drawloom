import { afterEach, expect, test } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assemble, notarise } from "./release-macos.mjs";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "drawloom-release-test-"));
  roots.push(root);
  const dmg = join(root, "Drawloom.dmg");
  writeFileSync(dmg, "signed image");
  return { root, dmg, receipt: `${dmg}.notary.json`, profile: "test-profile" };
}
const id = "36ebe69f-4612-4967-8e75-40ab5ee2dea0";

test("assembly signs a copy, excludes concurrent writers and verifies the resulting image", () => {
  const f = fixture();
  const output = join(f.root, "new.dmg");
  const options = { app: f.root, output, identity: "Developer ID Application: Test" };
  const calls: string[][] = [];
  const result = assemble(options, (command: string, args: string[]) => {
    calls.push([command, ...args]);
    if (command === "ditto") {
      expect(() => assemble(options, () => "")).toThrow(/EEXIST/);
    }
    if (command === "sh") expect(args[1]).not.toBe(f.root);
    if (command === "hdiutil" && args[0] === "create") {
      expect(args).not.toContain("-ov");
      writeFileSync(output, "new signed image");
    }
    return "acceptance passed";
  });
  expect(result.dmg).toBe(output);
  expect(calls.some((args) => args[0] === "hdiutil" && args[1] === "verify")).toBe(true);
  expect(existsSync(`${output}.assembly.lock`)).toBe(false);
  expect(JSON.parse(readFileSync(`${output}.assembly.json`, "utf8")).sha256).toMatch(
    /^[a-f0-9]{64}$/,
  );
  expect(readFileSync(f.dmg, "utf8")).toBe("signed image");
});

test("a failed post-staple assessment cannot record completion and remains recoverable", () => {
  const f = fixture();
  notarise("submit", f, () => JSON.stringify({ id }));
  expect(() =>
    notarise("finish", f, (command: string, args: string[]) => {
      if (args.includes("info")) return JSON.stringify({ id, status: "Accepted" });
      if (args.includes("staple")) writeFileSync(f.dmg, "stapled image");
      if (command === "spctl") throw new Error("assessment failed");
      return "";
    }),
  ).toThrow("assessment failed");
  expect(JSON.parse(readFileSync(f.receipt, "utf8")).state).not.toBe("complete");
  expect(notarise("status", f, () => JSON.stringify({ id, status: "Accepted" })).status).toBe(
    "Accepted",
  );
});

test("assembly requires an explicit dmg suffix and preserves existing sidecars", () => {
  const f = fixture();
  const run = () => {
    throw new Error("must not run");
  };
  expect(() =>
    assemble(
      { app: f.root, output: join(f.root, "Drawloom"), identity: "Developer ID Application: Test" },
      run,
    ),
  ).toThrow(/\.dmg/);
  const output = join(f.root, "new.dmg");
  writeFileSync(`${output}.acceptance.log`, "prior evidence");
  expect(() =>
    assemble({ app: f.root, output, identity: "Developer ID Application: Test" }, run),
  ).toThrow(/exists/);
  expect(readFileSync(`${output}.acceptance.log`, "utf8")).toBe("prior evidence");
});

test("failed upload retains stdout containing a recovery ID", () => {
  const f = fixture();
  expect(() =>
    notarise("submit", f, () => {
      throw Object.assign(new Error("upload interrupted"), { stdout: JSON.stringify({ id }) });
    }),
  ).toThrow("upload interrupted");
  expect(JSON.parse(readFileSync(`${f.receipt}.submit.json`, "utf8")).id).toBe(id);
});

test("assembly failure at app verification never creates or signs a DMG", () => {
  const { root } = fixture();
  const calls: string[] = [];
  expect(() =>
    assemble(
      { app: root, output: join(root, "new.dmg"), identity: "Developer ID Application: Test" },
      (command: string, args: string[]) => {
        calls.push(command);
        if (args.some((arg) => arg.endsWith("verify-macos-app.mjs")))
          throw new Error("invalid payload");
        return "";
      },
    ),
  ).toThrow("invalid payload");
  expect(calls).not.toContain("hdiutil");
});

test("assembly never overwrites an existing release", () => {
  const f = fixture();
  expect(() =>
    assemble({ app: f.root, output: f.dmg, identity: "Developer ID Application: Test" }, () => {
      throw new Error("should not run");
    }),
  ).toThrow(/exists/);
  expect(readFileSync(f.dmg, "utf8")).toBe("signed image");
});

test("ambiguous submission is retained before upload and cannot be repeated", () => {
  const f = fixture();
  expect(() =>
    notarise("submit", f, () => {
      expect(existsSync(f.receipt)).toBe(true);
      throw new Error("connection lost");
    }),
  ).toThrow("connection lost");
  expect(JSON.parse(readFileSync(f.receipt, "utf8")).state).toBe("submitting");
  expect(() =>
    notarise("submit", f, () => {
      throw new Error("duplicate upload");
    }),
  ).toThrow(/receipt already exists/);
});

test("malformed success retains raw receipt without allowing another submission", () => {
  const f = fixture();
  expect(() => notarise("submit", f, () => '{"message":"uploaded"}')).toThrow(/submission ID/);
  expect(readFileSync(`${f.receipt}.submit.json`, "utf8")).toContain("uploaded");
  expect(() => notarise("submit", f, () => "")).toThrow(/receipt already exists/);
});

test("status is bound to the submitted image and never uploads again", () => {
  const f = fixture();
  notarise("submit", f, () => JSON.stringify({ id }));
  writeFileSync(f.dmg, "different image");
  expect(() => notarise("status", f, () => "")).toThrow(/changed/);
});

test("pending and rejected submissions cannot be stapled", () => {
  for (const status of ["In Progress", "Invalid"]) {
    const f = fixture();
    notarise("submit", f, () => JSON.stringify({ id }));
    const calls: string[][] = [];
    expect(() =>
      notarise("finish", f, (_command: string, args: string[]) => {
        calls.push(args);
        return JSON.stringify({ id, status });
      }),
    ).toThrow(/not accepted/);
    expect(calls.some((args) => args.includes("stapler"))).toBe(false);
  }
});

test("accepted submission staples and validates before recording completion", () => {
  const f = fixture();
  notarise("submit", f, () => JSON.stringify({ id }));
  const calls: string[][] = [];
  notarise("finish", f, (_command: string, args: string[]) => {
    calls.push(args);
    if (args.includes("info")) return JSON.stringify({ id, status: "Accepted" });
    if (args.includes("staple")) writeFileSync(f.dmg, "stapled image");
    return "";
  });
  expect(calls.some((args) => args[0] === "stapler" && args[1] === "validate")).toBe(true);
  expect(calls.some((args) => args.includes("--assess"))).toBe(true);
  expect(JSON.parse(readFileSync(f.receipt, "utf8")).state).toBe("complete");
});
