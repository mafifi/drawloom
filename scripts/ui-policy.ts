import { readFile, readdir } from "node:fs/promises";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "svelte/compiler";
import ts from "typescript";

export interface UiPolicyIssue {
  path: string;
  line: number;
  kind:
    | "native-control"
    | "widget-role"
    | "import-boundary"
    | "stateful-control"
    | "conversation-composition"
    | "theme-token"
    | "view-responsibility"
    | "parse-error";
  message: string;
}

const excludedDirectories = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  "target",
  "generated",
  "_generated",
]);
const controlReplacements: Readonly<Record<string, string>> = {
  button: "Button",
  input: "Input (or Checkbox/Switch for boolean choices)",
  select: "Select",
  option: "Select.Item",
  optgroup: "Select.Group",
  textarea: "Textarea",
  label: "Label",
  details: "Collapsible",
  summary: "Collapsible.Trigger",
  hr: "Separator",
  dialog: "Dialog",
};
const roleReplacements: Readonly<Record<string, string>> = {
  button: "Button",
  checkbox: "Checkbox",
  combobox: "Combobox or Select",
  tab: "Tabs.Trigger",
  tablist: "Tabs.List",
  tabpanel: "Tabs.Content",
  switch: "Switch",
  dialog: "Dialog",
  alertdialog: "AlertDialog",
  radio: "RadioGroup.Item",
  radiogroup: "RadioGroup",
  slider: "Slider",
  spinbutton: "Input",
  listbox: "Select",
  option: "Select.Item",
  menu: "DropdownMenu",
  menuitem: "DropdownMenu.Item",
  menuitemcheckbox: "DropdownMenu.CheckboxItem",
  menuitemradio: "DropdownMenu.RadioItem",
  separator: "Separator",
};
const conversationSlots: Readonly<Record<string, string>> = {
  attachment: "Attachment",
  message: "ChatMessage",
  bubble: "ChatMessage",
  marker: "Marker",
};

function normalisePath(path: string): string {
  return posix.normalize(path.replaceAll("\\", "/"));
}

function excludedDirectory(name: string): boolean {
  return name.startsWith(".") || excludedDirectories.has(name);
}

export function isMaintainedUiSource(path: string): boolean {
  const normalised = normalisePath(path);
  return (
    /^(apps|packages)\//.test(normalised) &&
    /\.(css|svelte|[cm]?[jt]sx?)$/.test(normalised) &&
    !normalised.split("/").slice(0, -1).some(excludedDirectory)
  );
}

export async function scanUiPolicy(
  root: string,
): Promise<{ files: number; issues: UiPolicyIssue[] }> {
  const result = { files: 0, issues: [] as UiPolicyIssue[] };
  async function scan(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(join(root, directory), { withFileTypes: true });
    } catch (error) {
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
  try {
    const semantics = await readFile(join(root, "packages/ui/ui/src/theme/semantic.css"), "utf8");
    const styles = await readFile(join(root, "packages/ui/ui/src/styles.css"), "utf8");
    result.issues.push(...checkSemanticMappings(semantics, styles));
  } catch (error) {
    if (record(error)?.code !== "ENOENT") throw error;
  }
  return result;
}

/** The shared theme deliberately has one root map and one system-dark map. */
export function checkSemanticMappings(semantics: string, styles: string): UiPolicyIssue[] {
  const clean = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "");
  const [light = "", dark = ""] = clean(semantics).split(
    /@media\s*\(prefers-color-scheme:\s*dark\)/,
  );
  const declarations = (source: string) =>
    new Set([...source.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
  const lightNames = declarations(light),
    darkNames = declarations(dark);
  return [
    ...new Set(
      [...clean(styles).matchAll(/--color-[\w-]+\s*:\s*var\((--[\w-]+)\)/g)].map(
        (match) => match[1]!,
      ),
    ),
  ]
    .filter((name) => !lightNames.has(name) || !darkNames.has(name))
    .map((name) => ({
      path: "packages/ui/ui/src/theme/semantic.css",
      line: 1,
      kind: "theme-token" as const,
      message: `${name} needs an explicit light and dark semantic mapping.`,
    }));
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function visit(value: unknown, inspect: (node: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) {
    for (const child of value) visit(child, inspect);
    return;
  }
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
  return (
    /^(bits-ui|shadcn-svelte)(\/|$)/.test(specifier) || /(^|\/)components\/ui(\/|$)/.test(specifier)
  );
}

export function checkUiSource(path: string, source: string): UiPolicyIssue[] {
  path = normalisePath(path);
  if (!isMaintainedUiSource(path)) return [];
  const themeIssues = checkThemeSource(path, source);
  if (path.endsWith(".css") || path.startsWith("packages/ui/ui/src/")) return themeIssues;
  const issues: UiPolicyIssue[] = [];
  function report(kind: UiPolicyIssue["kind"], start: unknown, message: string): void {
    const line = source.slice(0, typeof start === "number" ? start : 0).split("\n").length;
    issues.push({ path, line, kind, message });
  }
  function checkImport(specifier: unknown, start: unknown): void {
    if (typeof specifier === "string" && bypassesUiBoundary(path, specifier)) {
      report(
        "import-boundary",
        start,
        `Import shared controls from @drawloom/ui instead of "${specifier}"; add missing shadcn-svelte primitives in packages/ui/ui/src first.`,
      );
    }
  }
  if (!path.endsWith(".svelte")) {
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    function inspect(node: ts.Node): void {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier))
          checkImport(node.moduleSpecifier.text, node.getStart(file));
      } else if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === "require"))
      ) {
        const argument = node.arguments[0];
        if (argument && ts.isStringLiteralLike(argument))
          checkImport(argument.text, node.getStart(file));
      }
      ts.forEachChild(node, inspect);
    }
    inspect(file);
    return [...issues, ...themeIssues];
  }
  let ast;
  try {
    ast = parse(source, { modern: true, filename: path });
  } catch (error) {
    const details = record(error);
    report(
      "parse-error",
      record(details?.start)?.character,
      `Cannot verify UI boundary: ${error instanceof Error ? error.message : "Svelte parse failed"}. Fix the Svelte syntax and rerun the check.`,
    );
    return issues;
  }
  /**
   * A view may not reach a service or validate a response. Both belong in a
   * `*-view-model.svelte.ts` module, which is testable without a DOM.
   *
   * Targeted on purpose. An earlier draft of this rule failed on any `.parse(`,
   * which also catches `JSON.parse`, `parseInt` and date parsing — a rule that
   * fires on correct code teaches people to suppress it. This matches network
   * and service access by name, and schema validation only where the receiver
   * is an imported schema or `zod` is imported at all.
   */
  const schemaNames = new Set<string>();
  let importsZod = false;
  visit(ast, (node) => {
    if (node.type !== "ImportDeclaration") return;
    const source = record(node.source)?.value;
    if (source === "zod") importsZod = true;
    for (const specifier of Array.isArray(node.specifiers) ? node.specifiers : []) {
      const entry = record(specifier);
      const local = record(entry?.local)?.name;
      // A schema is recognised by the convention the repository already uses.
      if (typeof local === "string" && /Schema$/.test(local)) schemaNames.add(local);
    }
  });
  const serviceCalls = new Set(["fetch", "EventSource", "WebSocket", "XMLHttpRequest"]);
  visit(ast, (node) => {
    if (node.type === "ImportDeclaration" && record(node.source)?.value === "zod")
      report(
        "view-responsibility",
        node.start,
        "A view must not import zod. Move schema validation into a *-view-model.svelte.ts module.",
      );
    if (node.type !== "CallExpression" && node.type !== "NewExpression") return;
    const callee = record(node.callee);
    const name = typeof callee?.name === "string" ? callee.name : undefined;
    if (name && serviceCalls.has(name))
      report(
        "view-responsibility",
        node.start,
        `A view must not call ${name} directly. Move the request into a *-view-model.svelte.ts module so it can be tested without a DOM.`,
      );
    // `SomeSchema.parse(...)` / `.safeParse(...)` on an imported schema.
    if (callee?.type === "MemberExpression") {
      const property = record(callee.property)?.name;
      const object = record(callee.object)?.name;
      if (
        (property === "parse" || property === "safeParse") &&
        ((typeof object === "string" && schemaNames.has(object)) || (importsZod && !object))
      )
        report(
          "view-responsibility",
          node.start,
          "A view must not validate a response. Move schema validation into a *-view-model.svelte.ts module.",
        );
    }
  });

  const sharedButtons = new Set<string>();
  visit(ast, (node) => {
    if (
      node.type !== "ImportDeclaration" ||
      record(node.source)?.value !== "@drawloom/ui" ||
      !Array.isArray(node.specifiers)
    )
      return;
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
    if (
      [
        "ImportDeclaration",
        "ExportNamedDeclaration",
        "ExportAllDeclaration",
        "ImportExpression",
      ].includes(String(node.type))
    )
      checkImport(record(node.source)?.value, node.start);
    if (
      node.type === "CallExpression" &&
      record(node.callee)?.name === "require" &&
      Array.isArray(node.arguments)
    )
      checkImport(record(node.arguments[0])?.value, node.start);
    if (
      node.type === "Component" &&
      typeof node.name === "string" &&
      sharedButtons.has(node.name) &&
      Array.isArray(node.attributes)
    ) {
      const loading = node.attributes
        .map(record)
        .find(
          (attribute) =>
            attribute?.type === "Attribute" &&
            ["aria-busy", "pending", "isLoading"].includes(String(attribute.name)),
        );
      if (loading)
        report(
          "stateful-control",
          loading.start,
          `Use StatefulButton from @drawloom/ui with pending for action loading feedback instead of ${String(loading.name)} on ${node.name}; keep eligibility disabled conditions separate.`,
        );
    }
    if (node.type !== "RegularElement") return;
    const name = typeof node.name === "string" ? node.name : "";
    const replacement = controlReplacements[name];
    if (replacement)
      report(
        "native-control",
        node.start,
        `Replace <${name}> with ${replacement} from @drawloom/ui.`,
      );
    if (!Array.isArray(node.attributes)) return;
    for (const attribute of node.attributes) {
      const attr = record(attribute);
      if (attr?.type === "Attribute" && attr.name === "data-slot") {
        visit(attr.value, (part) => {
          const slot =
            part.type === "Text" ? part.data : part.type === "Literal" ? part.value : undefined;
          const component =
            typeof slot === "string" ? conversationSlots[slot.split("-")[0]!] : undefined;
          if (component)
            report(
              "conversation-composition",
              attr.start,
              `Compose ${component} from @drawloom/ui instead of recreating data-slot="${String(slot)}" markup; keep application state and commands in the consumer.`,
            );
        });
      }
      if (attr?.type !== "Attribute" || attr.name !== "role") continue;
      visit(attr.value, (part) => {
        const role =
          part.type === "Text" ? part.data : part.type === "Literal" ? part.value : undefined;
        if (typeof role !== "string") return;
        const widget = role.split(/\s+/).find((value) => roleReplacements[value]);
        if (widget)
          report(
            "widget-role",
            attr.start,
            `Replace native role="${widget}" implementation with ${roleReplacements[widget]} from @drawloom/ui.`,
          );
      });
    }
  });
  return [...issues, ...themeIssues];
}

/** Narrow static guidance, not a CSS evaluator or a ban on authored media colours. */
function checkThemeSource(path: string, source: string): UiPolicyIssue[] {
  if (!/\.(svelte|css)$/.test(path)) return [];
  const shared = path.startsWith("packages/ui/ui/src/");
  const primitives = path === "packages/ui/ui/src/theme/primitives.css";
  const semantics = path === "packages/ui/ui/src/theme/semantic.css";
  const issues: UiPolicyIssue[] = [];
  const css = path.endsWith(".css");
  let ast;
  try {
    ast = parse(css ? `<style>${source}</style>` : source, { modern: true });
  } catch {
    return css
      ? [
          {
            path,
            line: 1,
            kind: "parse-error",
            message: "Cannot verify theme CSS. Fix its syntax and rerun check:ui-policy.",
          },
        ]
      : [];
  }
  function check(value: string, start: unknown, property?: string): void {
    const retiredComposition =
      /\b(?:settings-section|workbench-setting-row|workbench-setting-controls|consent-facts|model-facts)\b/.test(
        value,
      );
    const rawColour = primitives
      ? /#[\da-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklab|lab|lch|color)\(/i.test(value)
      : /#[\da-f]{3,8}\b/i.test(value) ||
        (/\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color|color-mix)\(/i.test(value) &&
          !(semantics && value.includes("var(")));
    const palette =
      /(?:^|[\s:])(?:bg|text|border|ring|fill|stroke|shadow|outline|decoration)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})(?:\b|\/)/.test(
        value,
      );
    const primitiveBypass = !semantics && !primitives && /(?:var\(|\()[\s]*--dl-/.test(value);
    const localColourOpacity =
      /(?:^|[\s:])(?:bg|text|border|ring|fill|stroke|shadow|outline|decoration|from|via|to)-[a-z-]+\/\d+/.test(
        value,
      );
    const arbitraryType =
      !shared &&
      (/\b(?:text|leading|tracking)-\[[-.\d]/.test(value) ||
        (property !== undefined &&
          /^(font-size|font-family|font-weight|line-height|letter-spacing)$/.test(property) &&
          !/var\(|^(inherit|initial|unset|normal)$/.test(value)));
    const arbitraryLayout =
      /\[[^\]]*\d(?:px|rem|pt|em)[^\]]*\]/.test(value) ||
      (!shared &&
        (/(?:^|[\s:])(?:p[xysetbrl]?|m[xysetbrl]?|gap(?:-[xy])?|space-[xy]|w|h|min-w|max-w|min-h|max-h|size|inset(?:-[xy])?|top|left|right|bottom|rounded(?:-[\w]+)?)-\[/.test(
          value,
        ) ||
          (property !== undefined &&
            /^(?:(?:min-|max-)?(?:width|height)|padding(?:-[\w]+)?|margin(?:-[\w]+)?|gap|row-gap|column-gap|inset(?:-[\w]+)?|top|right|bottom|left|border-radius)$/.test(
              property,
            ) &&
            /(?:\d|\.)+(?:px|rem|em|pt)\b/.test(value))));
    if (
      !rawColour &&
      !palette &&
      !primitiveBypass &&
      !arbitraryType &&
      !arbitraryLayout &&
      !localColourOpacity &&
      !retiredComposition
    )
      return;
    const offset = Math.max(0, (typeof start === "number" ? start : 0) - (css ? 7 : 0));
    issues.push({
      path,
      line: source.slice(0, offset).split("\n").length,
      kind: "theme-token",
      message: retiredComposition
        ? "Use shared settings-group, settings-row, settings-controls or facts-list compositions instead of retired local layouts."
        : "Use semantic theme tokens and shared compositions (for example bg-background, text-body, gap-stack). Define raw values in packages/ui/ui/src/theme/primitives.css and map their purpose in theme/semantic.css; Views compose the system, not a local palette, layout or type scale.",
    });
  }
  visit(ast.css, (node) => {
    if (node.type === "Declaration" && typeof node.value === "string")
      check(node.value, node.start, String(node.property));
  });
  // Variant maps hold presentation classes in scripts, not template attributes.
  // Only inspect class-shaped values; ordinary user content remains content.
  for (const script of [ast.instance, ast.module])
    visit(script, (node) => {
      if (
        node.type === "Literal" &&
        typeof node.value === "string" &&
        /(?:(?:bg|text|border|ring|fill|stroke|shadow|outline|decoration|from|via|to|p[xysetbrl]?|m[xysetbrl]?|gap|w|h|size)-\[|(?:bg|text|border|ring|fill|stroke|shadow|outline|decoration|from|via|to)-[a-z-]+\/\d+)/.test(
          node.value,
        )
      )
        check(node.value, node.start);
    });
  if (!css)
    visit(ast, (node) => {
      if (node.type === "Attribute" && ["class", "style"].includes(String(node.name)))
        visit(node.value, (part) => {
          const value =
            part.type === "Text" ? part.data : part.type === "Literal" ? part.value : undefined;
          if (typeof value === "string") {
            check(value, part.start);
            if (node.name === "style")
              for (const declaration of value.split(";")) {
                const colon = declaration.indexOf(":");
                if (colon >= 0)
                  check(
                    declaration.slice(colon + 1).trim(),
                    part.start,
                    declaration.slice(0, colon).trim(),
                  );
              }
          }
        });
    });
  return issues;
}
