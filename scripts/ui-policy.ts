import { readFile, readdir } from "node:fs/promises";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "svelte/compiler";
import ts from "typescript";

export interface UiPolicyIssue {
  path: string;
  line: number;
  kind: "native-control" | "widget-role" | "import-boundary" | "stateful-control" | "parse-error";
  message: string;
}

const excludedDirectories = new Set([
  "node_modules", "dist", "build", "coverage", "target", "generated", "_generated",
]);
const controlReplacements: Readonly<Record<string, string>> = {
  button: "Button", input: "Input (or Checkbox/Switch for boolean choices)",
  select: "Select", option: "Select.Item", optgroup: "Select.Group",
  textarea: "Textarea", label: "Label", details: "Collapsible", summary: "Collapsible.Trigger",
  hr: "Separator", dialog: "Dialog",
};
const roleReplacements: Readonly<Record<string, string>> = {
  button: "Button", checkbox: "Checkbox", combobox: "Combobox or Select", tab: "Tabs.Trigger",
  tablist: "Tabs.List", tabpanel: "Tabs.Content", switch: "Switch", dialog: "Dialog",
  alertdialog: "AlertDialog", radio: "RadioGroup.Item", radiogroup: "RadioGroup",
  slider: "Slider", spinbutton: "Input", listbox: "Select", option: "Select.Item",
  menu: "DropdownMenu", menuitem: "DropdownMenu.Item", menuitemcheckbox: "DropdownMenu.CheckboxItem",
  menuitemradio: "DropdownMenu.RadioItem", separator: "Separator",
};

function normalisePath(path: string): string {
  return posix.normalize(path.replaceAll("\\", "/"));
}

function excludedDirectory(name: string): boolean {
  return name.startsWith(".") || excludedDirectories.has(name);
}

export function isMaintainedUiSource(path: string): boolean {
  const normalised = normalisePath(path);
  return /^(apps|packages)\//.test(normalised)
    && /\.(svelte|[cm]?[jt]sx?)$/.test(normalised)
    && !normalised.split("/").slice(0, -1).some(excludedDirectory);
}

export async function scanUiPolicy(root: string): Promise<{ files: number; issues: UiPolicyIssue[] }> {
  const result = { files: 0, issues: [] as UiPolicyIssue[] };
  async function scan(directory: string): Promise<void> {
    let entries;
    try { entries = await readdir(join(root, directory), { withFileTypes: true }); }
    catch (error) {
      if (record(error)?.code === "ENOENT" && ["apps", "packages"].includes(directory)) return;
      throw error;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory() && !excludedDirectory(entry.name)) await scan(path);
      else if (entry.isFile() && isMaintainedUiSource(path)) {
        result.files++;
        result.issues.push(...checkUiSource(path, await readFile(join(root, path), "utf8")));
      }
    }
  }
  await scan("apps");
  await scan("packages");
  return result;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function visit(value: unknown, inspect: (node: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) { for (const child of value) visit(child, inspect); return; }
  const node = record(value);
  if (!node) return;
  inspect(node);
  for (const [key, child] of Object.entries(node)) {
    if (key !== "loc" && key !== "metadata") visit(child, inspect);
  }
}

const repositoryRoot = normalisePath(fileURLToPath(new URL("../", import.meta.url)));

function bypassesUiBoundary(path: string, specifier: string): boolean {
  if (specifier === "@drawloom/ui" || specifier === "@drawloom/ui/styles.css") return false;
  if (specifier.startsWith("@drawloom/ui/")) return true;
  if (specifier.startsWith(".") || posix.isAbsolute(specifier)) {
    const target = posix.resolve(repositoryRoot, posix.dirname(path), specifier);
    const packagePath = posix.relative(repositoryRoot, target);
    if (/^packages\/ui\/ui\/(src|dist)(\/|$)/.test(packagePath)) return true;
  }
  return /^(bits-ui|shadcn-svelte)(\/|$)/.test(specifier)
    || /(^|\/)components\/ui(\/|$)/.test(specifier);
}

export function checkUiSource(path: string, source: string): UiPolicyIssue[] {
  path = normalisePath(path);
  if (!isMaintainedUiSource(path) || path.startsWith("packages/ui/ui/src/")) return [];
  const issues: UiPolicyIssue[] = [];
  function report(kind: UiPolicyIssue["kind"], start: unknown, message: string): void {
    const line = source.slice(0, typeof start === "number" ? start : 0).split("\n").length;
    issues.push({ path, line, kind, message });
  }
  function checkImport(specifier: unknown, start: unknown): void {
    if (typeof specifier === "string" && bypassesUiBoundary(path, specifier)) {
      report("import-boundary", start,
        `Import shared controls from @drawloom/ui instead of "${specifier}"; add missing shadcn-svelte primitives in packages/ui/ui/src first.`);
    }
  }
  if (!path.endsWith(".svelte")) {
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    function inspect(node: ts.Node): void {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier))
          checkImport(node.moduleSpecifier.text, node.getStart(file));
      } else if (ts.isCallExpression(node)
        && (node.expression.kind === ts.SyntaxKind.ImportKeyword
          || ts.isIdentifier(node.expression) && node.expression.text === "require")) {
        const argument = node.arguments[0];
        if (argument && ts.isStringLiteralLike(argument)) checkImport(argument.text, node.getStart(file));
      }
      ts.forEachChild(node, inspect);
    }
    inspect(file);
    return issues;
  }
  let ast;
  try { ast = parse(source, { modern: true, filename: path }); }
  catch (error) {
    const details = record(error);
    report("parse-error", record(details?.start)?.character,
      `Cannot verify UI boundary: ${error instanceof Error ? error.message : "Svelte parse failed"}. Fix the Svelte syntax and rerun the check.`);
    return issues;
  }
  const sharedButtons = new Set<string>();
  visit(ast, (node) => {
    if (node.type !== "ImportDeclaration" || record(node.source)?.value !== "@drawloom/ui"
      || !Array.isArray(node.specifiers)) return;
    for (const specifier of node.specifiers) {
      const imported = record(specifier);
      const local = record(imported?.local)?.name;
      if (typeof local !== "string") continue;
      if (imported?.type === "ImportNamespaceSpecifier") sharedButtons.add(`${local}.Button`);
      else if (imported?.type === "ImportSpecifier" && record(imported.imported)?.name === "Button")
        sharedButtons.add(local);
    }
  });
  visit(ast, (node) => {
    if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration", "ImportExpression"].includes(String(node.type)))
      checkImport(record(node.source)?.value, node.start);
    if (node.type === "CallExpression" && record(node.callee)?.name === "require" && Array.isArray(node.arguments))
      checkImport(record(node.arguments[0])?.value, node.start);
    if (node.type === "Component" && typeof node.name === "string" && sharedButtons.has(node.name)
      && Array.isArray(node.attributes)) {
      const loading = node.attributes.map(record).find((attribute) => attribute?.type === "Attribute"
        && ["aria-busy", "pending", "isLoading"].includes(String(attribute.name)));
      if (loading) report("stateful-control", loading.start,
        `Use StatefulButton from @drawloom/ui with pending for action loading feedback instead of ${String(loading.name)} on ${node.name}; keep eligibility disabled conditions separate.`);
    }
    if (node.type !== "RegularElement") return;
    const name = typeof node.name === "string" ? node.name : "";
    const replacement = controlReplacements[name];
    if (replacement) report("native-control", node.start, `Replace <${name}> with ${replacement} from @drawloom/ui.`);
    if (!Array.isArray(node.attributes)) return;
    for (const attribute of node.attributes) {
      const attr = record(attribute);
      if (attr?.type !== "Attribute" || attr.name !== "role") continue;
      visit(attr.value, (part) => {
        const role = part.type === "Text" ? part.data : part.type === "Literal" ? part.value : undefined;
        if (typeof role !== "string") return;
        const widget = role.split(/\s+/).find((value) => roleReplacements[value]);
        if (widget) report("widget-role", attr.start,
          `Replace native role="${widget}" implementation with ${roleReplacements[widget]} from @drawloom/ui.`);
      });
    }
  });
  return issues;
}
