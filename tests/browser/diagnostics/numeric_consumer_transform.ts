import { createHash } from "node:crypto";
import { parseSync, type ESTree } from "rolldown/utils";

/** Apply candidate only to captured return values, after original boundary reads/checks. */
export function transformNumericConsumer(code: string, id: string, helper: string) {
  const descriptor = id.endsWith("/breditor-browser/dist/wasm_profile_descriptor.js");
  const selection = id.endsWith("/breditor-browser/dist/wasm_selection_adapter.js");
  if (!descriptor && !selection) return null;
  if (code.includes("normalizeWasmBoundaryNumber")) throw new Error("Runtime normalization already installed; use ordinary runtime tests, not the retired candidate transform");
  if (code.includes("__breditorNormalizeNumber")) throw new Error("Numeric normalization already installed");
  const parsed = parseSync(id, code);
  if (parsed.errors.length !== 0) throw new Error("Cannot parse numeric boundary module");
  const edits: { start: number; end: number; text: string; scope: string; line: number }[] = [];
  const text = (node: ESTree.Node) => code.slice(node.start, node.end);
  function capture(node: ESTree.Node, scope: string) {
    edits.push({ start: node.start, end: node.end, scope, line: code.slice(0, node.start).split("\n").length,
      text: `__breditorNormalizeNumber(${text(node)})` });
  }
  function visit(node: ESTree.Node, scope: string | null): void {
    if (node.type === "FunctionDeclaration") scope = node.id?.name ?? null;
    else if (node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") scope = null;
    if (descriptor && scope !== null && ["readScalar", "invoke", "invoke2"].includes(scope) &&
        node.type === "ReturnStatement" && node.argument?.type === "Identifier" && node.argument.name === "result") {
      capture(node.argument, scope);
      return;
    }
    if (selection && node.type === "CallExpression" && text(node.callee) === "Reflect.get" &&
        node.arguments.length === 2 && text(node.arguments[0]!) === "view" && text(node.arguments[1]!) === "field") {
      capture(node, "readSemanticSelection");
      return;
    }
    for (const value of Object.values(node)) {
      for (const child of Array.isArray(value) ? value : [value]) {
        if (child !== null && typeof child === "object" && "type" in child && "start" in child && "end" in child) visit(child as ESTree.Node, scope);
      }
    }
  }
  visit(parsed.program, null);
  const expected = descriptor ? 3 : 1;
  if (edits.length !== expected || (descriptor && new Set(edits.map(edit => edit.scope)).size !== 3)) {
    throw new Error(`Numeric boundary drift: expected ${expected} capture sites, found ${edits.length}`);
  }
  let output = code;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }
  return {
    code: `import { normalizeBoundaryNumber as __breditorNormalizeNumber } from ${JSON.stringify(helper)};\n${output}`,
    sourceSha256: createHash("sha256").update(code).digest("hex"),
    sites: edits.map(({ scope, line }) => ({ scope, line })),
  };
}
