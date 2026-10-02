import { createHash } from "node:crypto";
import { parseSync, type ESTree } from "rolldown/utils";

/** Opt-in export diagnostics: retain sites, never exported bytes or errors. */
export function instrumentContentFaults(code: string, id: string, recorder: string) {
  const module = ["wasm_document_json", "wasm_session_checkpoint"].find(name => id.endsWith(`/breditor-browser/dist/${name}.js`));
  if (!module) return null;
  if (code.includes("__breditorContentResult")) throw new Error("Content diagnostic already installed");
  const parsed = parseSync(id, code);
  if (parsed.errors.length) throw new Error("Cannot parse content diagnostic module");
  const checked = new Set(["documentJsonUtf8Bytes", "documentJsonMatchesProjection", "resolveWasmDurableJsonContract",
    "readDurableFormatBinding", "readDurablePropertyType",
    "validatedCheckpointBytes", "validateCheckpointEnvelope", "validEditorStateV3", "validSessionV3History",
    "validPendingFormats", "validSelection", "validPoint", "validOperationV3Payload"]);
  const edits: { start: number; end: number; text: string }[] = [];
  const sites: { stage: string; line: number; expression?: string }[] = [];
  function wrap(node: ESTree.Node, kind: "result" | "failure") {
    const line = code.slice(0, node.start).split("\n").length;
    const stage = `${module}:${kind}:${line}`;
    sites.push({ stage, line });
    const helper = kind === "result" ? "__breditorContentResult" : "__breditorLinkThrow";
    edits.push({ start: node.start, end: node.end,
      text: `${helper}(${JSON.stringify(stage)}, (${code.slice(node.start, node.end)}))` });
  }
  function visit(node: ESTree.Node, parent?: ESTree.Node, name?: string): void {
    if (node.type === "FunctionDeclaration") name = node.id?.name;
    // Nested callbacks are not the selected function's return value.
    if (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") name = undefined;
    if (node.type === "ReturnStatement" && node.argument && name &&
        ["isU32", "isPositiveU32", "isSafeUnsignedInteger", "isNullableSafeInteger"].includes(name)) {
      const value = node.argument;
      const line = code.slice(0, node.start).split("\n").length;
      const stage = `${module}:numeric:${line}`;
      sites.push({ stage, line });
      let part = 0;
      function traceOperand(operand: ESTree.Node): string {
        // Preserve the original AND tree and its short circuit. Each leaf is
        // evaluated once; false leaves are observed before returning unchanged.
        if (operand.type === "LogicalExpression" && operand.operator === "&&") {
          return `(${traceOperand(operand.left)} && ${traceOperand(operand.right)})`;
        }
        const expression = code.slice(operand.start, operand.end);
        const operandStage = `${stage}:operand:${part++}`;
        sites.push({ stage: operandStage, line, expression });
        return `__breditorNumericPredicate(${JSON.stringify(operandStage)}, (${expression}), value)`;
      }
      // A false leaf of the nullable helper's OR is expected, not rejection.
      const expression = name === "isNullableSafeInteger"
        ? code.slice(value.start, value.end) : traceOperand(value);
      edits.push({ start: value.start, end: value.end,
        text: `__breditorNumericPredicate(${JSON.stringify(stage)}, (${expression}), value)` });
      return;
    }
    if (node.type === "ReturnStatement" && node.argument && name && checked.has(name)) {
      wrap(node.argument, "result");
      return;
    }
    if (node.type === "CallExpression" && node.callee.type === "Identifier" &&
        node.callee.name === "boundaryFailure" && parent?.type !== "VariableDeclarator") {
      wrap(node, "failure");
      return;
    }
    for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) {
      if (child !== null && typeof child === "object" && "type" in child && "start" in child && "end" in child) {
        visit(child as ESTree.Node, node, name);
      }
    }
  }
  visit(parsed.program);
  if (sites.length === 0) throw new Error("No content rejection sites found");
  let transformed = code;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    transformed = transformed.slice(0, edit.start) + edit.text + transformed.slice(edit.end);
  }
  return { module, sourceSha256: createHash("sha256").update(code).digest("hex"), sites,
    code: `import { recordLinkThrow as __breditorLinkThrow, recordContentResult as __breditorContentResult, recordNumericPredicate as __breditorNumericPredicate } from ${JSON.stringify(recorder)};\n${transformed}` };
}
