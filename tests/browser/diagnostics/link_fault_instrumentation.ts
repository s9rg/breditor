import { createHash } from "node:crypto";
import { parseSync, type ESTree } from "rolldown/utils";

const modules = ["browser_editor", "browser_event_router", "command_queue", "wasm_command_adapter", "wasm_projection_adapter", "wasm_selection_adapter", "wasm_action_state_adapter"];

/** Test-build-only throw-site capture. Never serializes errors or user content. */
export function instrumentLinkFaults(code: string, id: string, recorder: string,
  options: { numericPredicates?: boolean; projectionChild?: boolean; projectionImpact?: boolean; impactState?: boolean } = {}) {
  if (options.impactState && !options.projectionImpact) throw new Error("Impact state requires impact rejection capture");
  const module = modules.find(name => id.endsWith(`/breditor-browser/dist/${name}.js`));
  if (module === undefined) return null;
  if (code.includes("__breditorLinkThrow")) throw new Error("Link diagnostic already installed");
  const parsed = parseSync(id, code);
  if (parsed.errors.length) throw new Error(`Cannot parse Link diagnostic module ${module}`);
  const edits: { start: number; end: number; text: string }[] = [];
  const sites: { stage: string; line: number }[] = [];
  let childSites = 0;
  let impactSites = 0;
  function visit(node: ESTree.Node, parent?: ESTree.Node, functionName?: string): void {
    if (node.type === "FunctionDeclaration") functionName = node.id?.name;
    if (options.projectionImpact && module === "wasm_projection_adapter" && functionName === "readSemanticImpact" &&
        node.type === "Literal" && node.value === null &&
        (parent?.type === "ReturnStatement" || parent?.type === "ConditionalExpression")) {
      const line = code.slice(0, node.start).split("\n").length;
      const stage = `${module}:impact:${line}`;
      impactSites++;
      sites.push({ stage, line });
      edits.push({ start: node.start, end: node.end,
        text: options.impactState
          ? `__breditorImpactRejection(${JSON.stringify(stage)}, (null), snapshot, affectedParagraphCount)`
          : `__breditorLinkThrow(${JSON.stringify(stage)}, (null))` });
      return;
    }
    if (options.projectionChild && module === "wasm_projection_adapter" &&
        functionName === "readProfiledSemanticProjectionUpdate" && node.type === "IfStatement" &&
        code.slice(node.test.start, node.test.end) === "!projectionResult.ok") {
      const statement = node.consequent.type === "BlockStatement" && node.consequent.body.length === 1
        ? node.consequent.body[0] : undefined;
      if (statement?.type !== "ReturnStatement" || statement.argument?.type !== "CallExpression" ||
          statement.argument.callee.type !== "Identifier" || statement.argument.callee.name !== "projectionFailure") {
        throw new Error("Projection child rejection shape drift");
      }
      const value = statement.argument;
      const line = code.slice(0, value.start).split("\n").length;
      const stage = `${module}:failure:${line}`;
      sites.push({ stage, line });
      childSites++;
      edits.push({ start: value.start, end: value.end,
        text: `__breditorProjectionChild(${JSON.stringify(stage)}, (${code.slice(value.start, value.end)}), projectionResult)` });
      return;
    }
    if (node.type === "CallExpression" && node.callee.type === "MemberExpression" &&
        node.callee.property.type === "PrivateIdentifier" &&
        ((module === "command_queue" && node.callee.property.name === "fail") ||
         (module === "browser_event_router" && node.callee.property.name === "fault"))) {
      const line = code.slice(0, node.start).split("\n").length;
      const stage = `${module}:failure:${line}`;
      sites.push({ stage, line });
      edits.push({ start: node.start, end: node.end,
        text: `__breditorLinkThrow(${JSON.stringify(stage)}, (${code.slice(node.start, node.end)}))` });
      return;
    }
    if (options.numericPredicates !== false && ((module === "wasm_selection_adapter" && functionName === "isU32") ||
         (module === "wasm_projection_adapter" && functionName === "isIndex")) &&
        node.type === "ReturnStatement" && node.argument) {
      const value = node.argument;
      const line = code.slice(0, node.start).split("\n").length;
      const stage = `${module}:numeric:${line}`;
      sites.push({ stage, line });
      edits.push({ start: value.start, end: value.end,
        text: `__breditorNumericPredicate(${JSON.stringify(stage)}, (${code.slice(value.start, value.end)}), value)` });
      return;
    }
    if (node.type === "CallExpression" && node.callee.type === "Identifier" &&
        ((module === "browser_editor" && node.callee.name === "contentFailure") ||
         (module === "wasm_command_adapter" && ["invalidWasmDocumentJsonReadResult", "unavailableWasmDocumentJsonReadResult",
           "invalidWasmSessionCheckpointReadResult", "unavailableWasmSessionCheckpointReadResult"].includes(node.callee.name)))) {
      const line = code.slice(0, node.start).split("\n").length;
      const stage = `${module}:failure:${line}`;
      sites.push({ stage, line });
      edits.push({ start: node.start, end: node.end,
        text: `__breditorLinkThrow(${JSON.stringify(stage)}, (${code.slice(node.start, node.end)}))` });
      return;
    }
    if (module === "wasm_selection_adapter" && functionName === "readPoint" &&
        node.type === "ReturnStatement" && node.argument?.type === "Literal" && node.argument.value === null) {
      const line = code.slice(0, node.start).split("\n").length;
      const stage = `${module}:point:${line}`;
      sites.push({ stage, line });
      // Only on rejection, inspect already-captured primitive locals. Never
      // reread the generated view or change the predicate that rejected it.
      edits.push({ start: node.argument.start, end: node.argument.end,
        text: `__breditorSelectionPoint(${JSON.stringify(stage)}, kind, nodeIndex, offset, affinity)` });
      return;
    }
    if (node.type === "CallExpression" && node.callee.type === "Identifier" &&
        ((module === "wasm_selection_adapter" && node.callee.name === "selectionFailure") ||
         (module === "wasm_projection_adapter" && node.callee.name === "projectionFailure")) &&
        parent?.type !== "VariableDeclarator") {
      // Ignore the provisional default result. All other sites here are real
      // rejection paths, including the final post-cleanup generation check.
      const line = code.slice(0, node.start).split("\n").length;
      const stage = `${module}:failure:${line}`;
      sites.push({ stage, line });
      edits.push({ start: node.start, end: node.end,
        text: `__breditorLinkThrow(${JSON.stringify(stage)}, (${code.slice(node.start, node.end)}))` });
      return;
    }
    // The editor can reject a noncanonical DOM host or queue lease without an
    // exception. Record creation of its closed failed-delivery result too.
    if (module === "browser_editor" && node.type === "CallExpression" &&
        code.slice(node.callee.start, node.callee.end) === "Object.freeze" &&
        node.arguments.length === 1 && node.arguments[0]?.type === "ObjectExpression" &&
        node.arguments[0].properties.some(property => property.type === "Property" &&
          property.key.type === "Identifier" && property.key.name === "status" &&
          property.value.type === "Literal" && property.value.value === "failed")) {
      const line = code.slice(0, node.start).split("\n").length;
      const stage = `${module}:failure:${line}`;
      sites.push({ stage, line });
      edits.push({ start: node.start, end: node.end,
        text: `__breditorLinkThrow(${JSON.stringify(stage)}, (${code.slice(node.start, node.end)}))` });
      return;
    }
    if (node.type === "ThrowStatement") {
      const line = code.slice(0, node.start).split("\n").length;
      const stage = `${module}:throw:${line}`;
      const value = node.argument;
      sites.push({ stage, line });
      // Evaluate the original operand exactly once, then record the site and
      // rethrow the same identity. Errors thrown while evaluating the operand
      // retain their original behavior and are not mislabeled as this throw.
      edits.push({ start: value.start, end: value.end,
        text: `__breditorLinkThrow(${JSON.stringify(stage)}, (${code.slice(value.start, value.end)}))` });
      return;
    }
    for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) {
      if (child !== null && typeof child === "object" && "type" in child && "start" in child && "end" in child) {
        visit(child as ESTree.Node, node, functionName);
      }
    }
  }
  visit(parsed.program);
  if (options.projectionImpact && module === "wasm_projection_adapter" && impactSites === 0) {
    throw new Error("Expected projection impact rejection sites");
  }
  if (options.projectionChild && module === "wasm_projection_adapter" && childSites !== 1) {
    throw new Error("Expected one projection child rejection");
  }
  if (sites.length === 0) throw new Error(`No throw sites found in ${module}`);
  let transformed = code;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    transformed = transformed.slice(0, edit.start) + edit.text + transformed.slice(edit.end);
  }
  return { module, sourceSha256: createHash("sha256").update(code).digest("hex"), sites,
    code: `import { recordLinkThrow as __breditorLinkThrow, recordSelectionPoint as __breditorSelectionPoint, recordNumericPredicate as __breditorNumericPredicate, recordProjectionChild as __breditorProjectionChild, recordImpactRejection as __breditorImpactRejection } from ${JSON.stringify(recorder)};\n${transformed}` };
}
