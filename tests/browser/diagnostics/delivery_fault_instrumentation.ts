import { createHash } from "node:crypto";
import { parseSync, type ESTree } from "rolldown/utils";

/** Observe only existing failed-delivery edges; never reevaluate a predicate. */
export function instrumentDeliveryFaults(code: string, id: string, recorder: string) {
  if (!id.endsWith("/breditor-browser/dist/browser_editor.js")) return null;
  if (code.includes("__breditorDeliveryFault")) throw new Error("Delivery diagnostic already installed");
  const parsed = parseSync(id, code);
  if (parsed.errors.length) throw new Error("Cannot parse delivery diagnostic module");
  const edits: { start: number; end: number; text: string }[] = [];
  const sites: { stage: string; line: number }[] = [];
  function visit(node: ESTree.Node, scope?: string): void {
    if (node.type === "MethodDefinition") scope = node.key.type === "PrivateIdentifier" ? node.key.name : undefined;
    else if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") {
      // A method's FunctionExpression is visited through its body below.
      scope = undefined;
    }
    if (scope === "submitImmediate" && node.type === "CallExpression" &&
        code.slice(node.callee.start, node.callee.end) === "Object.freeze" &&
        node.arguments.length === 1 && node.arguments[0]?.type === "ObjectExpression" &&
        node.arguments[0].properties.length === 1) {
      const property = node.arguments[0].properties[0];
      if (property?.type === "Property" && property.key.type === "Identifier" && property.key.name === "status" &&
          property.value.type === "Literal" && property.value.value === "failed") {
        const line = code.slice(0, node.start).split("\n").length;
        const stage = `browser_editor:delivery:${line}`;
        sites.push({ stage, line });
        edits.push({ start: node.start, end: node.end,
          text: `(__breditorDeliveryFault(${JSON.stringify(stage)}), ${code.slice(node.start, node.end)})` });
        return;
      }
    }
    if (scope === "dispatchToolbar" && node.type === "ExpressionStatement" &&
        node.expression.type === "CallExpression" &&
        code.slice(node.expression.callee.start, node.expression.callee.end) === "this.#fault" &&
        node.expression.arguments[0]?.type === "Literal" && node.expression.arguments[0].value === "toolbarDispatchFailed") {
      const line = code.slice(0, node.start).split("\n").length;
      const stage = `browser_editor:toolbar:${line}`;
      sites.push({ stage, line });
      edits.push({ start: node.start, end: node.start,
        text: `__breditorDeliveryFault(${JSON.stringify(stage)}, delivery, invocation);\n` });
      return;
    }
    if (node.type === "MethodDefinition") {
      if (node.value.body) visit(node.value.body, scope);
      return;
    }
    for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) {
      if (child !== null && typeof child === "object" && "type" in child && "start" in child && "end" in child) {
        visit(child as ESTree.Node, scope);
      }
    }
  }
  visit(parsed.program);
  if (sites.filter(site => site.stage.includes(":toolbar:")).length !== 1 ||
      sites.filter(site => site.stage.includes(":delivery:")).length !== 9) throw new Error("Delivery diagnostic shape drift");
  let transformed = code;
  for (const edit of edits.sort((a, b) => b.start - a.start)) transformed = transformed.slice(0, edit.start) + edit.text + transformed.slice(edit.end);
  return { sourceSha256: createHash("sha256").update(code).digest("hex"), sites,
    code: `import { recordDeliveryFault as __breditorDeliveryFault } from ${JSON.stringify(recorder)};\n${transformed}` };
}
